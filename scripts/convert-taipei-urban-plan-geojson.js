/** 臺北市都市計畫使用分區（主計）SHP → public/data/taipei-urban-plan.geojson */
const fs = require('fs');
const path = require('path');
const shapefile = require('shapefile');
const {
    DEFAULT_SIMPLIFY_TOLERANCE,
    aciToHex,
    transformGeometry,
    simplifyGeometry,
    cleanText,
    extractZip,
    findShapefileBase,
} = require('./lib/urban-plan-geo-utils');

const ROOT = path.resolve(__dirname, '..');
const DOWNLOAD_URL = 'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=10196e7d-2460-4b8a-b1d2-84001d09d7a4';
const WORK_DIR = path.join(ROOT, 'data', 'taipei-urban-plan');
const ZIP_PATH = path.join(WORK_DIR, 'main-plan.zip');
const EXTRACT_DIR = path.join(WORK_DIR, 'extracted');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'taipei-urban-plan.geojson');

async function ensureShapefile() {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    if (!fs.existsSync(ZIP_PATH)) {
        console.log('[taipei-urban-plan] 下載 SHP…');
        const res = await fetch(DOWNLOAD_URL);
        if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
        fs.writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()));
    }

    const shpExists = fs.existsSync(EXTRACT_DIR)
        && fs.readdirSync(EXTRACT_DIR).some((name) => name.endsWith('.shp'));
    if (!shpExists) {
        console.log('[taipei-urban-plan] 解壓縮…');
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
        const projected = transformGeometry(result.value.geometry);
        const geometry = simplifyGeometry(projected, DEFAULT_SIMPLIFY_TOLERANCE);
        features.push({
            type: 'Feature',
            geometry,
            properties: {
                region: '臺北市',
                zoneCode: cleanText(props['分區代碼']),
                zoneAbbr: cleanText(props['分區簡稱']),
                zoneName: cleanText(props['使用分區']),
                zoneDesc: cleanText(props['分區說明']),
                fillColor: aciToHex(props['顏色']),
            },
        });
    }

    return {
        type: 'FeatureCollection',
        metadata: {
            source: '臺北市資料大平臺',
            dataset: '臺北市都市計畫使用分區圖（全市主計）',
            updated: '2026-04-09',
            agency: '臺北市政府都市發展局',
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
    console.log(`[taipei-urban-plan] 完成：${geojson.features.length} 筆 → ${OUT_PATH} (${mb} MB)`);
}

main().catch((err) => {
    console.error('[taipei-urban-plan] 失敗', err);
    process.exit(1);
});
