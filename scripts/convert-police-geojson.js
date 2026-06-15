/** 全國警察機關地址 → 單一 WGS84 GeoJSON（地方 + 直屬 + 臺北開放資料覆寫） */
const fs = require('fs');
const path = require('path');
const {
    parseCsvLine,
    normalizeText,
    normalizeAddress,
    featureDedupKey,
    resolveTaipeiCanonicalName,
    coordsFromTwd97,
    sleep,
    geocodeWithEsri,
    readCsvRows,
} = require('./lib/police-geo-utils');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_CSV = path.join(ROOT, 'data', 'police', 'PoliceAddress1_1150528.csv');
const CENTRAL_CSV = path.join(ROOT, 'data', 'police', 'PoliceAddress2_1150528.csv');
const TAIPEI_CSV = path.join(ROOT, 'data', 'police', 'taipei-police-addresses.csv');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'police-agencies.geojson');

function makeFeature({ name, unit, address, phone, zip, lng, lat }) {
    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
            name: name || '',
            unit: unit || '',
            address: address || '',
            phone: phone || '',
            zip: zip || '',
        },
    };
}

function loadLocalFeatures() {
    if (!fs.existsSync(LOCAL_CSV)) {
        throw new Error(`找不到 ${LOCAL_CSV}，請先執行 node scripts/fetch-police-address-data.js`);
    }

    const { header, rows } = readCsvRows(LOCAL_CSV);
    const idx = {
        name: header.indexOf('中文單位名稱'),
        zip: header.indexOf('郵遞區號'),
        address: header.indexOf('地址'),
        phone: header.indexOf('電話'),
        x: header.indexOf('POINT_X'),
        y: header.indexOf('POINT_Y'),
    };
    if (Object.values(idx).some((i) => i < 0)) {
        throw new Error(`PoliceAddress1 欄位不符：${header.join(',')}`);
    }

    const features = [];
    let skipped = 0;
    for (const cols of rows) {
        const coords = coordsFromTwd97(cols[idx.x], cols[idx.y]);
        if (!coords) {
            skipped += 1;
            continue;
        }
        features.push(makeFeature({
            name: cols[idx.name] || '',
            address: cols[idx.address] || '',
            phone: cols[idx.phone] || '',
            zip: cols[idx.zip] || '',
            lng: coords.lng,
            lat: coords.lat,
        }));
    }
    if (skipped) console.warn(`[police-geojson] PoliceAddress1 略過 ${skipped} 筆（無坐標）`);
    return features;
}

function loadCentralFeatures(existingKeys) {
    if (!fs.existsSync(CENTRAL_CSV)) {
        console.warn(`[police-geojson] 略過直屬機關：找不到 ${CENTRAL_CSV}`);
        return [];
    }

    const { header, rows } = readCsvRows(CENTRAL_CSV);
    const idx = {
        name: header.indexOf('單位'),
        zip: header.indexOf('郵遞區號'),
        address: header.indexOf('地址'),
        phone: header.indexOf('電話'),
        x: header.indexOf('POINT_X'),
        y: header.indexOf('POINT_Y'),
    };
    if (Object.values(idx).some((i) => i < 0)) {
        throw new Error(`PoliceAddress2 欄位不符：${header.join(',')}`);
    }

    const features = [];
    let skipped = 0;
    let duplicated = 0;
    for (const cols of rows) {
        const name = cols[idx.name] || '';
        const address = cols[idx.address] || '';
        const key = featureDedupKey(name, address);
        if (existingKeys.has(key)) {
            duplicated += 1;
            continue;
        }
        const coords = coordsFromTwd97(cols[idx.x], cols[idx.y]);
        if (!coords) {
            skipped += 1;
            continue;
        }
        existingKeys.add(key);
        features.push(makeFeature({
            name,
            address,
            phone: cols[idx.phone] || '',
            zip: cols[idx.zip] || '',
            lng: coords.lng,
            lat: coords.lat,
        }));
    }
    if (duplicated) console.log(`[police-geojson] 直屬機關去重略過 ${duplicated} 筆`);
    if (skipped) console.warn(`[police-geojson] PoliceAddress2 略過 ${skipped} 筆（無坐標）`);
    return features;
}

function buildNameIndex(features) {
    const byName = new Map();
    for (let i = 0; i < features.length; i += 1) {
        const name = features[i].properties.name;
        const key = normalizeText(name);
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(i);
    }
    return byName;
}

function findFeatureIndex(byName, features, taipeiName) {
    const canonical = resolveTaipeiCanonicalName(taipeiName);
    const keys = [normalizeText(taipeiName), normalizeText(canonical)];
    for (const key of keys) {
        const indices = byName.get(key);
        if (!indices?.length) continue;
        if (indices.length === 1) return indices[0];
    }
    return -1;
}

function findFeatureByAddress(features, address) {
    const addrKey = normalizeAddress(address);
    if (!addrKey) return -1;
    for (let i = 0; i < features.length; i += 1) {
        if (normalizeAddress(features[i].properties.address) === addrKey) return i;
    }
    return -1;
}

async function applyTaipeiOverlay(features, existingKeys) {
    if (!fs.existsSync(TAIPEI_CSV)) {
        console.warn(`[police-geojson] 略過臺北覆寫：找不到 ${TAIPEI_CSV}`);
        return { enriched: 0, added: 0, failed: [] };
    }

    const { header, rows } = readCsvRows(TAIPEI_CSV);
    const idx = {
        name: header.indexOf('name'),
        content: header.indexOf('content'),
        display_addr: header.indexOf('display_addr'),
        poi_addr: header.indexOf('poi_addr'),
    };
    if (Object.values(idx).some((i) => i < 0)) {
        throw new Error(`臺北 CSV 欄位不符：${header.join(',')}`);
    }

    const byName = buildNameIndex(features);
    let enriched = 0;
    let added = 0;
    const failed = [];

    for (const cols of rows) {
        const row = {
            name: cols[idx.name] || '',
            content: cols[idx.content] || '',
            display_addr: cols[idx.display_addr] || '',
            poi_addr: cols[idx.poi_addr] || '',
        };
        if (!row.name || !row.poi_addr) continue;

        const displayAddress = row.display_addr || row.poi_addr;
        const unit = row.content !== row.name ? row.content : '';
        const featureIdx = findFeatureIndex(byName, features, row.name);

        if (featureIdx >= 0) {
            const props = features[featureIdx].properties;
            props.name = row.name;
            props.unit = unit;
            props.address = displayAddress;
            enriched += 1;
            continue;
        }

        const addrIdx = findFeatureByAddress(features, row.poi_addr);
        if (addrIdx >= 0) {
            const props = features[addrIdx].properties;
            props.name = row.name;
            props.unit = unit;
            props.address = displayAddress;
            enriched += 1;
            continue;
        }

        const key = featureDedupKey(row.name, displayAddress);
        if (existingKeys.has(key)) continue;

        let coords = null;
        const nationalIdx = findFeatureIndex(byName, features, resolveTaipeiCanonicalName(row.name));
        if (nationalIdx >= 0) {
            coords = features[nationalIdx].geometry.coordinates.slice();
        }
        if (!coords) {
            const esri = await geocodeWithEsri(row.poi_addr);
            if (esri) {
                coords = [esri.lng, esri.lat];
                await sleep(350);
            }
        }
        if (!coords) {
            failed.push(row.name);
            continue;
        }

        existingKeys.add(key);
        features.push(makeFeature({
            name: row.name,
            unit,
            address: displayAddress,
            phone: '',
            zip: '',
            lng: coords[0],
            lat: coords[1],
        }));
        const nameKey = normalizeText(row.name);
        if (!byName.has(nameKey)) byName.set(nameKey, []);
        byName.get(nameKey).push(features.length - 1);
        added += 1;
    }

    return { enriched, added, failed };
}

async function main() {
    const features = loadLocalFeatures();
    const existingKeys = new Set(
        features.map((f) => featureDedupKey(f.properties.name, f.properties.address))
    );

    const central = loadCentralFeatures(existingKeys);
    features.push(...central);

    const { enriched, added, failed } = await applyTaipeiOverlay(features, existingKeys);
    console.log(`[police-geojson] 臺北覆寫 ${enriched} 筆、新增 ${added} 筆`);

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(
        OUT_PATH,
        JSON.stringify({ type: 'FeatureCollection', features }),
        'utf8'
    );
    console.log(`已寫入 ${features.length} 筆 → ${OUT_PATH}`);

    if (failed.length) {
        console.warn(`未能定位 ${failed.length} 筆：${failed.join('、')}`);
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
