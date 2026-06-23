/** 合併臺北、新北使用分區 GeoJSON → public/data/urban-plan.geojson */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = Object.freeze([
    path.join(ROOT, 'public', 'data', 'taipei-urban-plan.geojson'),
    path.join(ROOT, 'public', 'data', 'ntpc-urban-plan.geojson'),
]);
const OUT_PATH = path.join(ROOT, 'public', 'data', 'urban-plan.geojson');

function readFeatures(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.features)) {
        throw new Error(`${filePath} 缺少 features 陣列`);
    }
    return data.features;
}

function main() {
    const features = [];
    const metadata = { sources: [] };

    SOURCES.forEach((filePath) => {
        if (!fs.existsSync(filePath)) {
            throw new Error(`找不到來源檔：${filePath}`);
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        features.push(...readFeatures(filePath));
        metadata.sources.push({
            file: path.basename(filePath),
            dataset: data?.metadata?.dataset || null,
            featureCount: Array.isArray(data?.features) ? data.features.length : 0,
        });
    });

    const geojson = {
        type: 'FeatureCollection',
        metadata: {
            ...metadata,
            mergedAt: new Date().toISOString().slice(0, 10),
            featureCount: features.length,
        },
        features,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(geojson)}\n`, 'utf8');
    const mb = (Buffer.byteLength(JSON.stringify(geojson)) / 1024 / 1024).toFixed(2);
    console.log(`[urban-plan] 合併完成：${features.length} 筆 → ${OUT_PATH} (${mb} MB)`);
}

main();
