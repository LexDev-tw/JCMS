/** 新北市都市計畫土地使用分區 SHP → public/data/ntpc-urban-plan.geojson */
const fs = require('fs');
const path = require('path');
const shapefile = require('shapefile');
const {
    DEFAULT_SIMPLIFY_TOLERANCE,
    zoneNameToColor,
    transformGeometry,
    simplifyGeometry,
    cleanText,
    extractZip,
    findShapefileBase,
} = require('./lib/urban-plan-geo-utils');

const ROOT = path.resolve(__dirname, '..');
const DATASET_ID = 'fe26e0a5-54c2-4876-bbc7-150243c048f5';
const CATALOG_URL = `https://data.ntpc.gov.tw/api/datasets/${DATASET_ID}/json`;
const WORK_DIR = path.join(ROOT, 'data', 'ntpc-urban-plan');
const ZIP_PATH = path.join(WORK_DIR, 'zone.zip');
const EXTRACT_DIR = path.join(WORK_DIR, 'extracted');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'ntpc-urban-plan.geojson');

async function fetchCatalogLinks() {
    const res = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`目錄 API HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
        throw new Error('新北市都市計畫目錄為空，請至資料開放平臺確認');
    }
    return rows;
}

async function ensureShapefile() {
    fs.mkdirSync(WORK_DIR, { recursive: true });

    const shpExists = fs.existsSync(EXTRACT_DIR)
        && fs.readdirSync(EXTRACT_DIR).some((name) => name.endsWith('.shp'));

    if (!shpExists) {
        let downloadUrl = process.env.NTPC_URBAN_PLAN_ZIP_URL || '';
        if (!downloadUrl) {
            const rows = await fetchCatalogLinks();
            const zoning = rows.find((row) => String(row.name || '').includes('使用分區'));
            downloadUrl = zoning?.link || rows[0]?.link || '';
        }
        if (!downloadUrl) throw new Error('找不到新北市使用分區下載連結');

        console.log('[ntpc-urban-plan] 下載 SHP…');
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
        fs.writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));

        console.log('[ntpc-urban-plan] 解壓縮…');
        fs.mkdirSync(EXTRACT_DIR, { recursive: true });
        extractZip({ zipPath: ZIP_PATH, extractDir: EXTRACT_DIR });
    }

    return findShapefileBase(EXTRACT_DIR);
}

async function convert(basePath) {
    const source = await shapefile.open(`${basePath}.shp`, `${basePath}.dbf`, { encoding: 'big5' });
    const features = [];

    while (true) {
        const result = await source.read();
        if (result.done) break;
        const props = result.value.properties || {};
        const zoneName = cleanText(props.ZONE);
        const projected = transformGeometry(result.value.geometry);
        const geometry = simplifyGeometry(projected, DEFAULT_SIMPLIFY_TOLERANCE);
        features.push({
            type: 'Feature',
            geometry,
            properties: {
                region: '新北市',
                zoneCode: null,
                zoneAbbr: null,
                zoneName,
                zoneDesc: null,
                fillColor: zoneNameToColor(zoneName),
            },
        });
    }

    return {
        type: 'FeatureCollection',
        metadata: {
            source: '新北市資料開放平臺',
            dataset: '新北市都市計畫土地使用分區及範圍圖',
            datasetId: DATASET_ID,
            agency: '新北市政府城鄉發展局',
        },
        features,
    };
}

async function main() {
    const basePath = await ensureShapefile();
    const geojson = await convert(basePath);
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(geojson)}\n`, 'utf8');
    const mb = (Buffer.byteLength(JSON.stringify(geojson)) / 1024 / 1024).toFixed(2);
    console.log(`[ntpc-urban-plan] 完成：${geojson.features.length} 筆 → ${OUT_PATH} (${mb} MB)`);
}

main().catch((err) => {
    console.error('[ntpc-urban-plan] 失敗', err);
    process.exit(1);
});
