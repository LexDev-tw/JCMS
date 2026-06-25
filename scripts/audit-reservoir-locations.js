/** 稽核水庫座標：標記仍落在分署預設中心點者 */
const { buildBundledReservoirLocations } = require('../src/services/waterReservoirService');

const REGION = {
    10: { lng: 121.45, lat: 25.05 },
    20: { lng: 120.75, lat: 24.2 },
    30: { lng: 120.45, lat: 23 },
    40: { lng: 121.35, lat: 23.75 },
    50: { lng: 119.65, lat: 23.65 },
};

function isRegionCentroid(id, lng, lat) {
    const reg = REGION[id.slice(0, 2)];
    if (!reg) return false;
    return Math.abs(lng - reg.lng) < 0.001 && Math.abs(lat - reg.lat) < 0.001;
}

async function main() {
    const rows = await buildBundledReservoirLocations();
    const bad = rows.filter((r) => isRegionCentroid(r.reservoirId, r.lng, r.lat));
    const bySource = {};
    rows.forEach((r) => {
        bySource[r.source || 'unknown'] = (bySource[r.source || 'unknown'] || 0) + 1;
    });

    console.log('total', rows.length);
    console.log('by source', bySource);
    console.log('region-centroid suspects', bad.length);
    bad.forEach((r) => console.log(r.reservoirId, r.name, r.source, r.lng, r.lat));

    const key = rows.find((r) => r.name === '蘭潭水庫');
    if (key) console.log('蘭潭水庫', key);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
