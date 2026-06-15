/** 環境部空氣品質：48269 監測站位置 + 28178 小時監測值（aqx_p_13） */

const MOENV_BASE = 'https://data.moenv.gov.tw/api/v2';
const MAP_SERVER_QUERY =
    'https://geoser.moenv.gov.tw/stdserver/rest/services/31_Air/%E7%A9%BA%E6%B0%A3%E5%93%81%E8%B3%AA%E7%9B%A3%E6%B8%AC%E7%AB%99%E4%BD%8D%E7%BD%AE%E5%9C%96/MapServer/0/query';

const CACHE_TTL_MS = Object.freeze({
    stations: 24 * 60 * 60 * 1000,
    readings: 10 * 60 * 1000,
});

const PM25_AQI_BREAKPOINTS = Object.freeze([
    { cLo: 0, cHi: 15.4, iLo: 0, iHi: 50 },
    { cLo: 15.5, cHi: 35.4, iLo: 51, iHi: 100 },
    { cLo: 35.5, cHi: 54.4, iLo: 101, iHi: 150 },
    { cLo: 54.5, cHi: 150.4, iLo: 151, iHi: 200 },
    { cLo: 150.5, cHi: 250.4, iLo: 201, iHi: 300 },
    { cLo: 250.5, cHi: 350.4, iLo: 301, iHi: 400 },
    { cLo: 350.5, cHi: 500.4, iLo: 401, iHi: 500 },
]);

const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value;
}

function cacheSet(key, value, ttlMs) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getMoenvApiKey() {
    const key = process.env.MOENV_API_KEY;
    if (!key || !String(key).trim()) {
        const err = new Error('MOENV_API_KEY 未設定');
        err.statusCode = 503;
        throw err;
    }
    return String(key).trim();
}

function getTaipeiDateHour() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(new Date());
    const pick = (type) => parts.find((p) => p.type === type)?.value || '';
    const hourRaw = pick('hour');
    return {
        date: `${pick('year')}-${pick('month')}-${pick('day')}`,
        hour: hourRaw === '24' ? 0 : parseInt(hourRaw, 10),
    };
}

function parseMonitorValue(raw) {
    const text = String(raw ?? '').trim().toLowerCase();
    if (!text || text === 'x' || text === 'na' || text === 'nd') return null;
    const n = Number.parseFloat(text);
    return Number.isFinite(n) ? n : null;
}

function pm25ToAqi(pm25) {
    if (pm25 == null || !Number.isFinite(pm25)) return null;
    for (const bp of PM25_AQI_BREAKPOINTS) {
        if (pm25 >= bp.cLo && pm25 <= bp.cHi) {
            const ratio = (pm25 - bp.cLo) / (bp.cHi - bp.cLo);
            return Math.round(ratio * (bp.iHi - bp.iLo) + bp.iLo);
        }
    }
    return pm25 > 500.4 ? 500 : null;
}

function aqiBand(aqi) {
    if (aqi == null || !Number.isFinite(aqi)) return 'unknown';
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'moderate';
    if (aqi <= 150) return 'sensitive';
    if (aqi <= 200) return 'unhealthy';
    return 'hazardous';
}

function aqiStatusLabel(aqi) {
    if (aqi == null || !Number.isFinite(aqi)) return '—';
    if (aqi <= 50) return '良好';
    if (aqi <= 100) return '普通';
    if (aqi <= 150) return '對敏感族群不健康';
    if (aqi <= 200) return '對所有族群不健康';
    if (aqi <= 300) return '非常不健康';
    return '危害';
}

function normalizeMonitorDate(raw) {
    return String(raw || '').trim().slice(0, 10);
}

async function fetchMapServerStations() {
    const cached = cacheGet('stations');
    if (cached) return cached;

    const features = [];
    let offset = 0;
    const pageSize = 500;

    for (;;) {
        const url = `${MAP_SERVER_QUERY}?where=1%3D1&outFields=Stcode,SiteName,County,Township,SiteAddres,TWD97_Lon,TWD97_Lat,SiteType&returnGeometry=false&f=json&resultRecordCount=${pageSize}&resultOffset=${offset}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
        if (!res.ok) {
            const err = new Error(`MapServer HTTP ${res.status}`);
            err.statusCode = 502;
            throw err;
        }
        const payload = await res.json();
        const batch = Array.isArray(payload?.features) ? payload.features : [];
        features.push(...batch);
        if (!payload?.exceededTransferLimit || batch.length < pageSize) break;
        offset += pageSize;
    }

    const stations = features
        .map((f) => {
            const a = f.attributes || {};
            const lng = Number.parseFloat(a.TWD97_Lon);
            const lat = Number.parseFloat(a.TWD97_Lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return {
                siteId: String(a.Stcode ?? '').trim(),
                name: String(a.SiteName || '').trim(),
                county: String(a.County || '').trim(),
                township: String(a.Township || '').trim(),
                address: String(a.SiteAddres || '').trim(),
                siteType: String(a.SiteType || '').trim(),
                lng,
                lat,
            };
        })
        .filter((s) => s && s.siteId && s.name);

    cacheSet('stations', stations, CACHE_TTL_MS.stations);
    return stations;
}

async function fetchMoenvJson(pathQuery) {
    const key = getMoenvApiKey();
    const url = `${MOENV_BASE}/${pathQuery}${pathQuery.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}&format=JSON`;
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) {
        const err = new Error(`MOENV HTTP ${res.status}`);
        err.statusCode = 502;
        throw err;
    }
    const body = await res.json();
    if (!Array.isArray(body)) {
        const err = new Error('MOENV 回應格式異常');
        err.statusCode = 502;
        throw err;
    }
    return body;
}

async function fetchLatestPm25Hourly() {
    const cacheKey = 'pm25-hourly';
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    let rows = [];
    try {
        rows = await fetchMoenvJson(
            'aqx_p_13?limit=1000&sort=monitordate%20desc&filters=itemengname,EQ,PM2.5'
        );
    } catch (err) {
        if (err.statusCode === 503) {
            const { date: taipeiDate, hour } = getTaipeiDateHour();
            return {
                monitorDate: taipeiDate,
                monitorHour: hour,
                readings: {},
                readingsUnavailable: true,
            };
        }
        throw err;
    }

    const { date: taipeiDate, hour } = getTaipeiDateHour();
    const hourKey = `monitorvalue${String(hour).padStart(2, '0')}`;

    const latestBySite = new Map();
    rows.forEach((row) => {
        const siteId = String(row.siteid ?? '').trim();
        if (!siteId || latestBySite.has(siteId)) return;
        latestBySite.set(siteId, {
            siteId,
            siteName: String(row.sitename || '').trim(),
            monitorDate: normalizeMonitorDate(row.monitordate),
            pm25: parseMonitorValue(row[hourKey]),
        });
    });

    let monitorDate = taipeiDate;
    const readings = {};
    latestBySite.forEach((entry, siteId) => {
        if (entry.monitorDate) monitorDate = entry.monitorDate;
        const aqi = pm25ToAqi(entry.pm25);
        readings[siteId] = {
            pm25: entry.pm25,
            aqi,
            band: aqiBand(aqi),
            status: aqiStatusLabel(aqi),
            monitorHour: hour,
        };
    });

    const payload = {
        monitorDate,
        monitorHour: hour,
        readings,
    };
    cacheSet(cacheKey, payload, CACHE_TTL_MS.readings);
    return payload;
}

async function getAirQualityMapData() {
    const [stations, hourly] = await Promise.all([
        fetchMapServerStations(),
        fetchLatestPm25Hourly(),
    ]);

    const merged = stations.map((station) => {
        const reading = hourly.readings[station.siteId] || null;
        return {
            ...station,
            pm25: reading?.pm25 ?? null,
            aqi: reading?.aqi ?? null,
            band: reading?.band ?? 'unknown',
            status: reading?.status ?? '—',
            monitorHour: reading?.monitorHour ?? hourly.monitorHour,
        };
    });

    return {
        ok: true,
        updatedAt: new Date().toISOString(),
        monitorDate: hourly.monitorDate,
        monitorHour: hourly.monitorHour,
        readingsUnavailable: Boolean(hourly.readingsUnavailable),
        sourceAgency: '環境部',
        sources: {
            stations: '48269 / 空氣品質監測站位置圖',
            hourly: '28178 / aqx_p_13（PM2.5 小時值換算 AQI）',
        },
        stationCount: merged.length,
        stations: merged,
    };
}

module.exports = {
    getAirQualityMapData,
    pm25ToAqi,
    aqiBand,
    aqiStatusLabel,
};
