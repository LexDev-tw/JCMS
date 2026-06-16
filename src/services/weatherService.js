/** 中央氣象署開放資料 proxy（Key 僅後端使用） */

const { getWarpedImage } = require('./cwaImageWarp');

const CWA_BASE = 'https://opendata.cwa.gov.tw';

const CACHE_TTL_MS = Object.freeze({
    rainAdvisory: 5 * 60 * 1000,
    rainfallObs: 5 * 60 * 1000,
    satellite: 10 * 60 * 1000,
});

const cache = new Map();

function getApiKey() {
    const key = process.env.CWA_API_KEY;
    if (!key || !String(key).trim()) {
        const err = new Error('CWA_API_KEY 未設定');
        err.statusCode = 503;
        throw err;
    }
    return String(key).trim();
}

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value;
}

function cacheSet(key, value, ttlMs) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function parseRangePair(raw) {
    const text = String(raw || '').trim();
    const parts = text.split('-').map((p) => Number.parseFloat(p.trim()));
    if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
    return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
}

function normalizeAreaDesc(text) {
    return String(text || '').replace(/臺/g, '台').trim();
}

function severityToLevel(severityText, headline) {
    const src = `${severityText || ''}${headline || ''}`;
    if (/超大豪雨|extremely heavy rain/i.test(src)) return 'extreme';
    if (/大豪雨|heavy rain/i.test(src) && !/大雨/.test(src)) return 'heavy';
    if (/豪雨|大雨|heavy rain/i.test(src)) return 'moderate';
    return 'moderate';
}

async function fetchCwaJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
        const err = new Error(`CWA HTTP ${res.status}`);
        err.statusCode = 502;
        throw err;
    }
    return res.json();
}

async function getRainAdvisory() {
    const cached = cacheGet('rain-advisory');
    if (cached) return cached;

    const key = getApiKey();
    const url = `${CWA_BASE}/api/v1/rest/datastore/W-C0033-003?Authorization=${encodeURIComponent(key)}&format=JSON`;
    const payload = await fetchCwaJson(url);
    const infoList = payload?.records?.info;
    if (!Array.isArray(infoList)) {
        const empty = { ok: true, updatedAt: new Date().toISOString(), advisories: [], areas: [] };
        cacheSet('rain-advisory', empty, CACHE_TTL_MS.rainAdvisory);
        return empty;
    }

    const advisories = [];
    const areaMap = new Map();

    infoList.forEach((info) => {
        const headline = String(info.headline || '').trim();
        const description = String(info.description || '').trim();
        const severityParam = (info.parameter || []).find((p) => p.valueName === 'severity_level');
        const severityLevel = severityParam?.value || headline;
        const level = severityToLevel(severityLevel, headline);
        const phenomenon = String(info.event || '').trim();

        if (!/雨|rain/i.test(`${phenomenon}${headline}${description}`)) return;

        advisories.push({
            headline,
            description,
            severityLevel,
            level,
            effective: info.effective || null,
            expires: info.expires || null,
        });

        (info.area || []).forEach((area) => {
            const areaDesc = normalizeAreaDesc(area.areaDesc);
            if (!areaDesc) return;
            const prev = areaMap.get(areaDesc);
            const rank = { extreme: 3, heavy: 2, moderate: 1 };
            if (!prev || rank[level] > rank[prev.level]) {
                areaMap.set(areaDesc, {
                    areaDesc,
                    level,
                    headline,
                    geocode: area.geocode?.value || null,
                });
            }
        });
    });

    const result = {
        ok: true,
        updatedAt: new Date().toISOString(),
        advisories,
        areas: [...areaMap.values()],
    };
    cacheSet('rain-advisory', result, CACHE_TTL_MS.rainAdvisory);
    return result;
}

function parseRainfallValue(raw) {
    const n = Number.parseFloat(String(raw ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n === -99 || n === -98) return 0;
    return n;
}

function readPrecipitation(node) {
    if (node == null) return null;
    if (typeof node === 'object' && node.Precipitation != null) {
        return parseRainfallValue(node.Precipitation);
    }
    return parseRainfallValue(node);
}

function pickRainfallMm(station) {
    const rainfall = station?.RainfallElement || station?.rainfallElement || {};
    const candidates = [
        readPrecipitation(rainfall.Past1hr),
        readPrecipitation(rainfall.Past10Min),
        readPrecipitation(rainfall.Now),
        readPrecipitation(rainfall.Past3hr),
        readPrecipitation(rainfall.Past6Hr),
        readPrecipitation(rainfall.HOUR_1),
        readPrecipitation(rainfall.MIN_10),
        readPrecipitation(rainfall.NOW),
        readPrecipitation(rainfall.Precipitation),
    ];
    for (const value of candidates) {
        if (value != null && value > 0) return value;
    }
    const fallback = candidates.find((v) => v != null && Number.isFinite(v));
    return fallback ?? 0;
}

function extractStationCoords(station) {
    const geo = station?.GeoInfo || station?.geoInfo || {};
    const coordsList = Array.isArray(geo.Coordinates) ? geo.Coordinates : [];
    const wgs = coordsList.find((c) => /WGS84/i.test(String(c?.CoordinateName || '')))
        || coordsList[coordsList.length - 1]
        || {};
    const lat = Number.parseFloat(wgs.StationLatitude ?? station?.lat ?? station?.StationLatitude);
    const lng = Number.parseFloat(wgs.StationLongitude ?? station?.lon ?? station?.StationLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
}

function normalizeRainfallStation(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const coords = extractStationCoords(raw);
    if (!coords) return null;
    const rainMm = pickRainfallMm(raw);
    const name = String(
        raw.StationName || raw.locationName || raw.stationName || raw.name || ''
    ).trim();
    const county = String(raw.GeoInfo?.CountyName || raw.countyName || '').trim();
    const town = String(raw.GeoInfo?.TownName || raw.townName || '').trim();
    const observedAt = raw.ObsTime?.DateTime
        || raw.time?.obsTime
        || raw.obsTime
        || null;
    return {
        stationId: String(raw.StationId || raw.stationId || '').trim() || null,
        name: name || '雨量站',
        county,
        town,
        lat: coords.lat,
        lng: coords.lng,
        rainMm,
        observedAt,
    };
}

function parseRainfallObsPayload(payload) {
    const records = payload?.records;
    if (!records) return { observedAt: null, stations: [] };

    const stationList = Array.isArray(records.Station)
        ? records.Station
        : Array.isArray(records.location)
            ? records.location.map((loc) => {
                const elements = {};
                (loc.weatherElement || loc.WeatherElement || []).forEach((el) => {
                    const key = el.elementName || el.ElementName;
                    const val = el.elementValue ?? el.ElementValue;
                    if (key) elements[key] = val;
                });
                return {
                    StationName: loc.locationName || loc.StationName,
                    StationId: loc.stationId || loc.StationId,
                    lat: loc.lat,
                    lon: loc.lon,
                    ObsTime: loc.time,
                    RainfallElement: {
                        HOUR_1: elements.HOUR_1 ?? elements.RAIN_1HR,
                        MIN_10: elements.MIN_10 ?? elements.RAIN_10MIN,
                        NOW: elements.NOW ?? elements.Precipitation,
                    },
                };
            })
            : [];

    const stations = stationList
        .map(normalizeRainfallStation)
        .filter(Boolean);

    const observedAt = stations.reduce((latest, s) => {
        if (!s.observedAt) return latest;
        if (!latest) return s.observedAt;
        return new Date(s.observedAt) > new Date(latest) ? s.observedAt : latest;
    }, null);

    return { observedAt, stations };
}

async function getRainfallObservations() {
    const cached = cacheGet('rainfall-obs');
    if (cached) return cached;

    const key = getApiKey();
    const url = `${CWA_BASE}/api/v1/rest/datastore/O-A0002-001?Authorization=${encodeURIComponent(key)}&format=JSON`;
    const payload = await fetchCwaJson(url);
    const parsed = parseRainfallObsPayload(payload);
    const raining = parsed.stations.filter((s) => s.rainMm > 0);

    const result = {
        ok: true,
        datasetId: 'O-A0002-001',
        updatedAt: new Date().toISOString(),
        observedAt: parsed.observedAt,
        stations: parsed.stations,
        rainingCount: raining.length,
        maxRainMm: raining.reduce((max, s) => Math.max(max, s.rainMm), 0),
    };
    cacheSet('rainfall-obs', result, CACHE_TTL_MS.rainfallObs);
    return result;
}

async function getSatelliteLatest(product = 'vis-tw') {
    const cacheKey = `satellite:${product}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const datasetByProduct = {
        'vis-tw': 'O-B0023-001',
        'ir-tw': 'O-B0028-003',
        radar: 'O-A0058-003',
    };
    const datasetId = datasetByProduct[product] || datasetByProduct['vis-tw'];
    const key = getApiKey();
    const url = `${CWA_BASE}/fileapi/v1/opendataapi/${datasetId}?Authorization=${encodeURIComponent(key)}&format=JSON`;
    const payload = await fetchCwaJson(url);
    const dataset = payload?.cwaopendata?.dataset;
    if (!dataset) {
        const err = new Error('CWA 影像圖層資料格式異常');
        err.statusCode = 502;
        throw err;
    }

    const paramSet = dataset.datasetInfo?.parameterSet;
    const lon = parseRangePair(
        dataset.GeoInfo?.LongitudeRange
        || paramSet?.LongitudeRange
        || paramSet?.parameter?.LongitudeRange
    );
    const lat = parseRangePair(
        dataset.GeoInfo?.LatitudeRange
        || paramSet?.LatitudeRange
        || paramSet?.parameter?.LatitudeRange
    );
    const imageUrl = dataset.Resource?.ProductURL
        || dataset.resource?.ProductURL
        || paramSet?.parameter?.ProductURL;
    const observedAt = dataset.ObsTime?.Datetime
        || dataset.DateTime
        || payload?.cwaopendata?.sent
        || null;

    if (!lon || !lat || !imageUrl) {
        const err = new Error('CWA 影像圖層缺少座標或圖片 URL');
        err.statusCode = 502;
        throw err;
    }

    const result = {
        ok: true,
        product,
        datasetId,
        observedAt,
        imageUrl,
        bounds: {
            west: lon.min,
            east: lon.max,
            south: lat.min,
            north: lat.max,
        },
        proxyUrl: `/api/weather/satellite/image?product=${encodeURIComponent(product)}`,
    };
    cacheSet(cacheKey, result, CACHE_TTL_MS.satellite);
    return result;
}

async function fetchSatelliteImageBuffer(product = 'vis-tw') {
    const meta = await getSatelliteLatest(product);
    const res = await fetch(meta.imageUrl);
    if (!res.ok) {
        const err = new Error(`CWA 圖片 HTTP ${res.status}`);
        err.statusCode = 502;
        throw err;
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    let buffer = Buffer.from(await res.arrayBuffer());

    if (product === 'radar' && meta.bounds) {
        const cacheKey = `warp:radar:${meta.observedAt || meta.imageUrl}`;
        buffer = getWarpedImage(cacheKey, CACHE_TTL_MS.satellite, buffer, meta.bounds);
        return { buffer, contentType: 'image/png', observedAt: meta.observedAt };
    }

    return { buffer, contentType, observedAt: meta.observedAt };
}

module.exports = {
    getRainAdvisory,
    getRainfallObservations,
    getSatelliteLatest,
    fetchSatelliteImageBuffer,
};
