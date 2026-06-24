/** 經濟部水利署：水庫位置 + 即時水情（Open Data proxy） */

const fs = require('fs');
const path = require('path');
const { coordsFromTwd97Tm2 } = require('../lib/twd97tm2');

const WRA_V2 = 'https://opendata.wra.gov.tw/api/v2';
const LEGACY_LOCATION_URL =
    'https://data.wra.gov.tw/Service/OpenData.aspx?format=json&id=923F16D6-070B-4A7D-9DA7-6CF010EEB090';
const BUNDLED_LOCATIONS = path.join(__dirname, '../../public/data/wra-reservoir-locations.json');
const SNAPSHOT_PATH = path.join(__dirname, '../../public/data/wra-reservoir-map-snapshot.json');
const TW_TOWNS_GEOJSON = path.join(__dirname, '../../public/data/tw-towns.geojson');

const ENDPOINTS = Object.freeze({
    situation: `${WRA_V2}/2be9044c-6e44-4856-aad5-dd108c2e6679?format=JSON`,
    dailyOps: `${WRA_V2}/51023e88-4c76-4dbc-bbb9-470da690d539?format=JSON`,
    basicInfo: `${WRA_V2}/708a43b0-24dc-40b7-9ed2-fca6a291e7ae?format=JSON`,
});

const REGION_CENTROIDS = Object.freeze({
    '10': { lng: 121.45, lat: 25.05 },
    '20': { lng: 120.75, lat: 24.2 },
    '30': { lng: 120.45, lat: 23.0 },
    '40': { lng: 121.35, lat: 23.75 },
    '50': { lng: 119.65, lat: 23.65 },
});

const CACHE_TTL_MS = Object.freeze({
    map: 15 * 60 * 1000,
    townCentroids: 7 * 24 * 60 * 60 * 1000,
});

function regionCentroidForId(reservoirId) {
    const prefix = String(reservoirId || '').slice(0, 2);
    return REGION_CENTROIDS[prefix] || null;
}

const cache = new Map();
let townCentroidCache = null;

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value;
}

function cacheSet(key, value, ttlMs) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function pickField(obj, ...names) {
    if (!obj || typeof obj !== 'object') return null;
    for (const name of names) {
        if (obj[name] != null && obj[name] !== '') return obj[name];
        const target = String(name).toLowerCase();
        for (const key of Object.keys(obj)) {
            if (key.toLowerCase() === target) return obj[key];
        }
    }
    return null;
}

function parseNumber(raw) {
    if (raw == null || raw === '') return null;
    const n = Number.parseFloat(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function normalizeReservoirId(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';
    return digits.slice(-5).padStart(5, '0');
}

function normalizeCountyName(name) {
    return String(name || '')
        .replace(/臺/g, '台')
        .replace(/巿/g, '市')
        .trim();
}

function normalizeTownLabel(raw) {
    const text = normalizeCountyName(raw);
    const m = text.match(/(.+?[縣市])(.+?[區鄉鎮市])/);
    if (!m) return { county: text, town: '' };
    return { county: m[1], town: m[2] };
}

function ringCentroid(ring) {
    if (!Array.isArray(ring) || !ring.length) return null;
    let sumLng = 0;
    let sumLat = 0;
    ring.forEach((coord) => {
        sumLng += coord[0];
        sumLat += coord[1];
    });
    return { lng: sumLng / ring.length, lat: sumLat / ring.length };
}

function loadTownCentroids() {
    if (townCentroidCache) return townCentroidCache;
    const cached = cacheGet('town-centroids');
    if (cached) {
        townCentroidCache = cached;
        return cached;
    }

    const geo = JSON.parse(fs.readFileSync(TW_TOWNS_GEOJSON, 'utf8'));
    const byKey = new Map();
    (geo.features || []).forEach((feature) => {
        const county = normalizeCountyName(feature.properties?.COUNTYNAME);
        const town = normalizeCountyName(feature.properties?.TOWNNAME);
        const key = `${county}|${town}`;
        const coords = feature.geometry?.type === 'MultiPolygon'
            ? ringCentroid(feature.geometry.coordinates?.[0]?.[0])
            : ringCentroid(feature.geometry?.coordinates?.[0]);
        if (coords) byKey.set(key, coords);
    });

    townCentroidCache = byKey;
    cacheSet('town-centroids', byKey, CACHE_TTL_MS.townCentroids);
    return byKey;
}

async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        const err = new Error(`WRA HTTP ${res.status} @ ${url}`);
        err.statusCode = 502;
        throw err;
    }
    return res.json();
}

function readBundledLocations() {
    try {
        if (!fs.existsSync(BUNDLED_LOCATIONS)) return null;
        const payload = JSON.parse(fs.readFileSync(BUNDLED_LOCATIONS, 'utf8'));
        return Array.isArray(payload?.locations) ? payload.locations : null;
    } catch (_) {
        return null;
    }
}

async function fetchLegacyLocations() {
    try {
        const payload = await fetchJson(LEGACY_LOCATION_URL);
        const rows = extractArrayPayload(payload);
        return rows
            .map((row) => {
                const id = normalizeReservoirId(
                    pickField(row, 'COMPARE_ID', 'ReservoirIdentifier', 'reservoiridentifier')
                );
                const name = String(pickField(row, 'RES_NAME', 'ReservoirName', 'reservoirname') || '').trim();
                const x = pickField(row, 'TM2_X97', 'tm2_x97', 'TM2_X67', 'tm2_x67');
                const y = pickField(row, 'TM2_Y97', 'tm2_y97', 'TM2_Y67', 'tm2_y67');
                const coords = coordsFromTwd97Tm2(x, y);
                if (!coords) return null;
                return {
                    reservoirId: id,
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
    } catch (_) {
        return null;
    }
}

function extractArrayPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const value of Object.values(payload)) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

function formatObservationTime(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    const isoLike = text.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/i, '$1-$2-$3T$4:$5:$6');
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return text;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function buildDailyOpsIndex(rows) {
    const byId = new Map();
    rows.forEach((row) => {
        const id = normalizeReservoirId(pickField(row, 'reservoiridentifier', 'ReservoirIdentifier'));
        const name = String(pickField(row, 'reservoirname', 'ReservoirName') || '').trim();
        const capacity = parseNumber(pickField(row, 'capacity', 'Capacity'));
        if (!id) return;
        byId.set(id, { reservoirId: id, name, effectiveCapacity: capacity });
    });
    return byId;
}

function buildBasicInfoIndex(rows) {
    const byId = new Map();
    const byName = new Map();
    const townCentroids = loadTownCentroids();

    rows.forEach((row) => {
        const id = normalizeReservoirId(pickField(row, '水庫代碼', 'reservoiridentifier', 'ReservoirIdentifier'));
        const name = String(pickField(row, '水庫名稱', 'reservoirname', 'ReservoirName') || '').trim();
        const townLabel = pickField(row, '鄉鎮市區名稱', 'townname', 'TownName');
        const { county, town } = normalizeTownLabel(townLabel);
        const centroid = townCentroids.get(`${county}|${town}`) || regionCentroidForId(id);
        const capacity = parseNumber(
            pickField(row, '目前有效容量', 'currunteffectivecapacity', 'CurruntEffectiveCapacity')
        ) ?? parseNumber(
            pickField(row, '設計有效容量', 'designedeffectivecapacity', 'DesignedEffectiveCapacity')
        );

        if (!id) return;
        const entry = {
            reservoirId: id,
            name,
            effectiveCapacity: capacity,
            lng: centroid?.lng ?? null,
            lat: centroid?.lat ?? null,
            townLabel: townLabel || null,
            source: townCentroids.has(`${county}|${town}`)
                ? 'basic-info-town-centroid'
                : 'basic-info-region-centroid',
        };
        byId.set(id, entry);
        if (name) byName.set(name, entry);
    });

    return { byId, byName };
}

function augmentLocationRowsFromDailyOps(locationRows, dailyRows, basicInfo) {
    const byId = new Map(locationRows.map((row) => [row.reservoirId, row]));
    dailyRows.forEach((row) => {
        const id = normalizeReservoirId(pickField(row, 'reservoiridentifier', 'ReservoirIdentifier'));
        const name = String(pickField(row, 'reservoirname', 'ReservoirName') || '').trim();
        if (!id || byId.has(id)) return;

        const named = name && basicInfo.byName.get(name);
        const region = regionCentroidForId(id);
        const coords = named || region;
        if (!coords?.lng || !coords?.lat) return;

        byId.set(id, {
            reservoirId: id,
            name: name || named?.name || id,
            lng: coords.lng,
            lat: coords.lat,
            effectiveCapacity: parseNumber(pickField(row, 'capacity', 'Capacity')) ?? named?.effectiveCapacity ?? null,
            source: named ? 'daily-name-match' : 'daily-region-centroid',
        });
    });
    return Array.from(byId.values());
}

function buildLocationIndex(rows) {
    const byId = new Map();
    const byName = new Map();
    rows.forEach((row) => {
        if (!row?.reservoirId || !Number.isFinite(row.lng) || !Number.isFinite(row.lat)) return;
        byId.set(row.reservoirId, row);
        if (row.name) byName.set(row.name, row);
    });
    return { byId, byName };
}

async function resolveLocationRows(dailyRows, basicInfo) {
    const bundled = readBundledLocations();
    if (bundled?.length) return bundled;

    const legacy = await fetchLegacyLocations();
    if (legacy?.length) return legacy;

    const basicLocations = [...basicInfo.byId.values()].map((row) => ({
        reservoirId: row.reservoirId,
        name: row.name,
        lng: row.lng,
        lat: row.lat,
        effectiveCapacity: row.effectiveCapacity,
        source: row.source,
    }));
    return augmentLocationRowsFromDailyOps(basicLocations, dailyRows, basicInfo);
}

function resolveLocation(locations, situationRow, dailyRow, basicRow) {
    const id = normalizeReservoirId(pickField(situationRow, 'reservoiridentifier', 'ReservoirIdentifier'));
    if (id && locations.byId.has(id)) return locations.byId.get(id);

    const name = String(
        dailyRow?.name
        || basicRow?.name
        || pickField(situationRow, 'reservoirname', 'ReservoirName')
        || ''
    ).trim();
    if (name && locations.byName.has(name)) return locations.byName.get(name);
    return basicRow || null;
}

function resolveEffectiveCapacity(location, dailyRow, basicRow) {
    return (
        dailyRow?.effectiveCapacity
        ?? location?.effectiveCapacity
        ?? basicRow?.effectiveCapacity
        ?? null
    );
}

function readSnapshotFallback() {
    try {
        if (!fs.existsSync(SNAPSHOT_PATH)) return null;
        const payload = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
        if (!Array.isArray(payload?.reservoirs) || !payload.reservoirs.length) return null;
        return {
            ...payload,
            ok: true,
            sources: {
                ...(payload.sources || {}),
                snapshot: '本地快照（水利署連線失敗時備援）',
            },
        };
    } catch (_) {
        return null;
    }
}

async function buildWaterReservoirMapData() {
    const [situationRows, dailyRows] = await Promise.all([
        fetchJson(ENDPOINTS.situation).then(extractArrayPayload),
        fetchJson(ENDPOINTS.dailyOps).then(extractArrayPayload),
    ]);

    const dailyOps = buildDailyOpsIndex(dailyRows);
    const basicRows = extractArrayPayload(await fetchJson(ENDPOINTS.basicInfo));
    const basicInfo = buildBasicInfoIndex(basicRows);
    const locationRows = await resolveLocationRows(dailyRows, basicInfo);
    const locations = buildLocationIndex(locationRows);

    const reservoirs = [];
    let latestObservation = null;

    const latestByReservoir = new Map();

    situationRows.forEach((row) => {
        const reservoirId = normalizeReservoirId(
            pickField(row, 'reservoiridentifier', 'ReservoirIdentifier')
        );
        if (!reservoirId) return;

        const observationRaw = pickField(row, 'observationtime', 'ObservationTime');
        const ts = Date.parse(String(observationRaw || '').replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/i,
            '$1-$2-$3T$4:$5:$6'
        ));
        const prev = latestByReservoir.get(reservoirId);
        if (prev && Number.isFinite(ts) && Number.isFinite(prev.ts) && ts <= prev.ts) return;
        latestByReservoir.set(reservoirId, { row, ts: Number.isFinite(ts) ? ts : 0 });
    });

    latestByReservoir.forEach(({ row }) => {
        const reservoirId = normalizeReservoirId(
            pickField(row, 'reservoiridentifier', 'ReservoirIdentifier')
        );
        if (!reservoirId) return;

        const dailyRow = dailyOps.get(reservoirId) || null;
        const basicRow = basicInfo.byId.get(reservoirId) || null;
        const location = resolveLocation(locations, row, dailyRow, basicRow);
        if (!location || !Number.isFinite(location.lng) || !Number.isFinite(location.lat)) return;

        const effectiveCapacity = resolveEffectiveCapacity(location, dailyRow, basicRow);
        const effectiveStorage = parseNumber(
            pickField(row, 'effectivewaterstoragecapacity', 'EffectiveWaterStorageCapacity')
        );
        const waterLevel = parseNumber(pickField(row, 'waterlevel', 'WaterLevel'));
        const observationRaw = pickField(row, 'observationtime', 'ObservationTime');
        const observationTime = formatObservationTime(observationRaw);
        const storagePercent = (
            effectiveCapacity > 0 && effectiveStorage != null
                ? Math.round((effectiveStorage / effectiveCapacity) * 1000) / 10
                : null
        );

        if (observationRaw) {
            const ts = Date.parse(String(observationRaw).replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/i,
                '$1-$2-$3T$4:$5:$6'
            ));
            if (Number.isFinite(ts) && (!latestObservation || ts > latestObservation.ts)) {
                latestObservation = { ts, text: observationTime };
            }
        }

        reservoirs.push({
            reservoirId,
            name: location.name || dailyRow?.name || basicRow?.name || reservoirId,
            lng: location.lng,
            lat: location.lat,
            effectiveCapacity,
            effectiveStorage,
            storagePercent,
            waterLevel,
            observationTime,
            observationRaw: observationRaw || null,
            locationSource: location.source || null,
        });
    });

    reservoirs.sort((a, b) => (b.effectiveCapacity || 0) - (a.effectiveCapacity || 0));

    const result = {
        ok: true,
        updatedAt: new Date().toISOString(),
        observationTime: latestObservation?.text || null,
        sourceAgency: '經濟部水利署',
        sources: {
            situation: '水庫水情資料',
            capacity: '水庫每日營運狀況 / 水庫基本資料',
            locations: readBundledLocations()?.length
                ? '水庫堰壩位置圖（本地快取）'
                : '水庫基本資料 + 鄉鎮中心點（預覽近似）',
        },
        reservoirCount: reservoirs.length,
        reservoirs,
    };

    cacheSet('map', result, CACHE_TTL_MS.map);
    return result;
}

async function getWaterReservoirMapData() {
    const cached = cacheGet('map');
    if (cached) return cached;

    try {
        return await buildWaterReservoirMapData();
    } catch (err) {
        const snapshot = readSnapshotFallback();
        if (snapshot) {
            cacheSet('map', snapshot, CACHE_TTL_MS.map);
            return snapshot;
        }
        throw err;
    }
}

module.exports = {
    getWaterReservoirMapData,
    ENDPOINTS,
};
