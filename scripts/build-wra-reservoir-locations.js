/** 產生 public/data/wra-reservoir-locations.json（堰壩 API 優先，否則基本資料+對照表） */
const fs = require('fs');
const path = require('path');
const { coordsFromTwd97Tm2 } = require('../src/lib/twd97tm2');
const { buildBundledReservoirLocations } = require('../src/services/waterReservoirService');

const LEGACY_URL =
    'https://data.wra.gov.tw/Service/OpenData.aspx?format=json&id=923F16D6-070B-4A7D-9DA7-6CF010EEB090';
const OUT = path.join(__dirname, '../public/data/wra-reservoir-locations.json');

function pickField(obj, ...names) {
    for (const name of names) {
        if (obj?.[name] != null && obj[name] !== '') return obj[name];
        const target = String(name).toLowerCase();
        for (const key of Object.keys(obj || {})) {
            if (key.toLowerCase() === target) return obj[key];
        }
    }
    return null;
}

function parseNumber(raw) {
    const n = Number.parseFloat(String(raw ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function normalizeReservoirId(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits ? digits.slice(-5).padStart(5, '0') : '';
}

async function fetchLegacyLocations() {
    const res = await fetch(LEGACY_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`legacy HTTP ${res.status}`);
    const payload = await res.json();
    const rows = Array.isArray(payload)
        ? payload
        : Object.values(payload).find(Array.isArray) || [];

    return rows
        .map((row) => {
            const reservoirId = normalizeReservoirId(
                pickField(row, 'COMPARE_ID', 'ReservoirIdentifier', 'reservoiridentifier')
            );
            const name = String(pickField(row, 'RES_NAME', 'ReservoirName', 'reservoirname') || '').trim();
            const coords = coordsFromTwd97Tm2(
                pickField(row, 'TM2_X97', 'tm2_x97', 'TM2_X67', 'tm2_x67'),
                pickField(row, 'TM2_Y97', 'tm2_y97', 'TM2_Y67', 'tm2_y67')
            );
            if (!reservoirId || !coords) return null;
            return {
                reservoirId,
                name,
                lng: coords.lng,
                lat: coords.lat,
                effectiveCapacity: parseNumber(
                    pickField(row, 'CAPACITY_E', 'capacity_e', 'CAPACITY_D', 'capacity_d')
                ),
                source: 'legacy-api',
            };
        })
        .filter(Boolean);
}

async function main() {
    let locations = [];
    let source = '';

    try {
        locations = await fetchLegacyLocations();
        if (locations.length) source = LEGACY_URL;
    } catch (err) {
        console.warn('[build-wra-reservoir-locations] legacy API 不可用，改用水庫基本資料推算', err.message);
    }

    if (!locations.length) {
        locations = await buildBundledReservoirLocations();
        source = 'basic-info + location-hints';
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(
        OUT,
        JSON.stringify(
            {
                updatedAt: new Date().toISOString(),
                source,
                count: locations.length,
                locations,
            },
            null,
            2
        )
    );
    console.log(`Wrote ${locations.length} locations -> ${OUT}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
