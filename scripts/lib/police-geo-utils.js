/** 警政署地址 CSV / GeoJSON 轉換共用工具（地理編碼等見 geo-utils） */
const geo = require('./geo-utils');

const TAIPEI_NAME_ALIASES = Object.freeze({
    '臺北市政府警察局總局': '臺北市政府警察局',
    '建國派出所': '建國路派出所',
});

function twd97tm2ToWgs84(x, y) {
    const a = 6378137.0;
    const b = 6356752.314245179;
    const lng0 = (121 * Math.PI) / 180;
    const k0 = 0.9999;
    const dx = 250000;
    const e = Math.sqrt(1 - (b * b) / (a * a));
    const e2 = (e * e) / (1 - e * e);
    x -= dx;
    const M = y / k0;
    const mu = M / (a * (1 - (e * e) / 4 - (3 * e ** 4) / 64 - (5 * e ** 6) / 256));
    const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
    const fp = mu
        + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
        + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
        + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
        + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const C1 = e2 * Math.cos(fp) ** 2;
    const T1 = Math.tan(fp) ** 2;
    const R1 = (a * (1 - e * e)) / (1 - e * e * Math.sin(fp) ** 2) ** 1.5;
    const N1 = a / Math.sqrt(1 - e * e * Math.sin(fp) ** 2);
    const D = x / (N1 * k0);
    const lat = fp - (N1 * Math.tan(fp) / R1) * (
        (D * D) / 2
        - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2) * D ** 4) / 24
        + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 - 3 * C1 * C1) * D ** 6) / 720
    );
    const lng = lng0 + (
        D
        - ((1 + 2 * T1 + C1) * D ** 3) / 6
        + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 + 24 * T1 * T1) * D ** 5) / 120
    ) / Math.cos(fp);
    return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}

function resolveTaipeiCanonicalName(name) {
    return TAIPEI_NAME_ALIASES[name] || name;
}

function coordsFromTwd97(pointX, pointY) {
    const x = Number.parseFloat(pointX);
    const y = Number.parseFloat(pointY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const { lng, lat } = twd97tm2ToWgs84(x, y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
}

module.exports = {
    ...geo,
    TAIPEI_NAME_ALIASES,
    twd97tm2ToWgs84,
    resolveTaipeiCanonicalName,
    coordsFromTwd97,
};
