/** 法院（既有 GeoJSON）+ 檢察機關（法務部開放資料）→ judicial-agencies.geojson */
const fs = require('fs');
const path = require('path');
const {
    normalizeText,
    featureDedupKey,
    sleep,
    geocodeWithEsri,
    geocodeTaiwanAddress,
    readCsvRows,
} = require('./lib/geo-utils');

const ROOT = path.resolve(__dirname, '..');
const MOJ_JSON = path.join(ROOT, 'data', 'judicial', 'moj-agency-addresses.json');
const JURISDICTION_CSV = path.join(ROOT, 'data', 'judicial', 'prosecutor-jurisdiction.csv');
const COURTS_GEOJSON = path.join(ROOT, 'public', 'data', 'judicial-agencies.geojson');
const OUT_PATH = COURTS_GEOJSON;

const EXCLUDE_PREFIXES = [
    '法務部調查局',
    '法務部行政執行署',
    '法務部廉政署',
    '法務部矯正署',
    '法務部司法官學院',
    '法務部法醫研究所',
    '誠正中學',
    '明陽中學',
];

function isProsecutorAgency(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (n === '法務部') return true;
    if (n === '最高檢察署') return true;
    if (EXCLUDE_PREFIXES.some((prefix) => n.startsWith(prefix))) return false;
    return n.includes('檢察署') || n.includes('檢察分署');
}

function normalizeAgencyName(name) {
    return String(name || '')
        .replace(/地方法察署/g, '地方檢察署')
        .trim();
}

function loadCourtFeatures() {
    if (!fs.existsSync(COURTS_GEOJSON)) {
        throw new Error(`找不到 ${COURTS_GEOJSON}`);
    }
    const geo = JSON.parse(fs.readFileSync(COURTS_GEOJSON, 'utf8'));
    const features = (geo.features || []).filter((f) => f?.properties?.type === '法院');
    return features;
}

function loadJurisdictionMap() {
    const map = new Map();
    if (!fs.existsSync(JURISDICTION_CSV)) {
        console.warn(`[judicial-geojson] 找不到管轄對照 ${JURISDICTION_CSV}`);
        return map;
    }
    const { header, rows } = readCsvRows(JURISDICTION_CSV);
    const nameIdx = header.indexOf('name');
    const jurisIdx = header.indexOf('jurisdiction');
    if (nameIdx < 0 || jurisIdx < 0) {
        throw new Error(`prosecutor-jurisdiction.csv 欄位不符：${header.join(',')}`);
    }
    for (const cols of rows) {
        const name = normalizeAgencyName(cols[nameIdx]);
        if (name) map.set(normalizeText(name), cols[jurisIdx] || '');
    }
    return map;
}

function loadMojRows() {
    if (!fs.existsSync(MOJ_JSON)) {
        throw new Error(`找不到 ${MOJ_JSON}，請先執行 node scripts/fetch-moj-agency-addresses.js`);
    }
    const data = JSON.parse(fs.readFileSync(MOJ_JSON, 'utf8'));
    return Array.isArray(data?.rows) ? data.rows : [];
}

function makeProsecutorFeature({ name, address, phone, jurisdiction, lng, lat }) {
    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
            name,
            type: '檢察',
            jurisdiction: jurisdiction || '',
            address: address || '',
            phone: phone || '',
        },
    };
}

async function buildProsecutorFeatures(jurisdictionMap) {
    const rows = loadMojRows().filter((row) => isProsecutorAgency(row.name));
    const seen = new Set();
    const features = [];
    const missingJurisdiction = [];
    let geocodeFailed = 0;

    for (const row of rows) {
        const name = normalizeAgencyName(row.name);
        const address = String(row.address || '').trim();
        const phone = String(row.phone || '').trim();
        const dedup = featureDedupKey(name, address);
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        const jurisdiction = jurisdictionMap.get(normalizeText(name)) || '';
        if (!jurisdiction) missingJurisdiction.push(name);

        let coords = null;
        try {
            coords = await geocodeTaiwanAddress(address);
        } catch (err) {
            console.warn(`[judicial-geojson] 地理編碼錯誤 ${name}: ${err.message}`);
        }
        if (!coords) {
            geocodeFailed += 1;
            console.warn(`[judicial-geojson] 略過（無坐標）${name} — ${address}`);
            continue;
        }

        features.push(makeProsecutorFeature({
            name,
            address,
            phone,
            jurisdiction,
            lng: coords.lng,
            lat: coords.lat,
        }));

        await sleep(350);
    }

    if (missingJurisdiction.length) {
        console.warn(`[judicial-geojson] 管轄區缺漏（${missingJurisdiction.length}）：${missingJurisdiction.join('、')}`);
    }
    if (geocodeFailed) {
        console.warn(`[judicial-geojson] 地理編碼失敗 ${geocodeFailed} 筆`);
    }

    return features;
}

async function main() {
    const courtFeatures = loadCourtFeatures();
    const jurisdictionMap = loadJurisdictionMap();
    const prosecutorFeatures = await buildProsecutorFeatures(jurisdictionMap);

    const out = {
        type: 'FeatureCollection',
        features: [...courtFeatures, ...prosecutorFeatures],
    };

    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

    const courtCount = courtFeatures.length;
    const procCount = prosecutorFeatures.length;
    console.log(`[judicial-geojson] 完成：法院 ${courtCount} + 檢察 ${procCount} = ${out.features.length} 筆 → ${OUT_PATH}`);

    const samples = ['最高檢察署', '臺灣高等檢察署', '臺灣高雄地方檢察署', '福建金門地方檢察署'];
    for (const sample of samples) {
        const hit = out.features.find((f) => f.properties?.name === sample);
        console.log(`  ${sample}: ${hit ? '✓' : '✗'}`);
    }
}

main().catch((err) => {
    console.error('[judicial-geojson] 失敗', err);
    process.exit(1);
});
