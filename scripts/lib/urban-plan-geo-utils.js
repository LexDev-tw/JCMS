/** 都市計畫 GeoJSON 轉換共用 */
const proj4 = require('proj4');
const simplify = require('@turf/simplify').default;
const { polygon, multiPolygon } = require('@turf/helpers');

proj4.defs('EPSG:3826', '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs');

const DEFAULT_SIMPLIFY_TOLERANCE = 0.0002;

/** AutoCAD Color Index → #RRGGBB（臺北市資料集「顏色」欄位） */
function aciToHex(index) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) return '#B0B0B8';
    if (i === 0) return '#9E9E9E';
    if (i >= 1 && i <= 9) {
        const base = [
            '#000000', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF',
            '#0000FF', '#FF00FF', '#FFFFFF', '#808080', '#C0C0C0',
        ];
        return base[i];
    }
    if (i === 250) return '#333333';
    if (i === 251) return '#555555';
    if (i === 252) return '#777777';
    if (i === 253) return '#999999';
    if (i === 254) return '#BBBBBB';
    if (i === 255) return '#DDDDDD';
    const hue = ((i - 10) * 15) % 360;
    const sat = i % 2 === 0 ? 85 : 65;
    const light = 45 + (i % 5) * 8;
    return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

const ZONE_COLOR_RULES = Object.freeze([
    [/第[一二三四]種住宅|住宅區/, '#FFF59D'],
    [/商業/, '#EF9A9A'],
    [/工業/, '#CE93D8'],
    [/農業/, '#A5D6A7'],
    [/道路|步道|橋梁|隧道|鐵路|捷運|停車|交通/, '#E0E0E0'],
    [/河川|溝渠|排水|行水|水溝/, '#90CAF9'],
    [/公園|綠地|廣場|遊憩|風景/, '#81C784'],
    [/學校|文教|大學|高中|國中|國小/, '#F8BBD0'],
    [/機關|行政|郵電|社福|醫療|消防|警察|軍事/, '#FFCC80'],
    [/保護|保安/, '#66BB6A'],
    [/墓地|殯葬|公墓/, '#BDBDBD'],
    [/宗教|寺|廟/, '#FFE082'],
    [/倉儲|倉庫|批發/, '#B39DDB'],
    [/水利|抽水|自來水|電力|電信|瓦斯|污水|變電/, '#CFD8DC'],
    [/港埠|碼頭|機場/, '#B0BEC5'],
    [/特定|特種/, '#80DEEA'],
    [/文化|古蹟/, '#FFAB91'],
]);

function hashColor(text) {
    const raw = String(text || '分區');
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    const hue = hash % 360;
    return hslToHex(hue, 55, 62);
}

function zoneNameToColor(zoneName) {
    const name = String(zoneName || '').trim();
    if (!name) return '#B0B0B8';
    for (const [pattern, color] of ZONE_COLOR_RULES) {
        if (pattern.test(name)) return color;
    }
    return hashColor(name);
}

function transformCoord([x, y]) {
    const [lng, lat] = proj4('EPSG:3826', 'EPSG:4326', [x, y]);
    return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

function transformRing(ring) {
    return ring.map(transformCoord);
}

function transformGeometry(geometry) {
    if (!geometry) return geometry;
    if (geometry.type === 'Polygon') {
        return { type: 'Polygon', coordinates: geometry.coordinates.map(transformRing) };
    }
    if (geometry.type === 'MultiPolygon') {
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates.map((poly) => poly.map(transformRing)),
        };
    }
    return geometry;
}

function simplifyGeometry(geometry, tolerance = DEFAULT_SIMPLIFY_TOLERANCE) {
    if (!geometry || !tolerance) return geometry;
    try {
        const feature = geometry.type === 'Polygon'
            ? polygon(geometry.coordinates)
            : multiPolygon(geometry.coordinates);
        const simplified = simplify(feature, { tolerance, highQuality: false });
        return simplified.geometry;
    } catch (_) {
        return geometry;
    }
}

function cleanText(value) {
    const text = String(value ?? '').trim();
    return text || null;
}

function extractZip(win32) {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
        execFileSync(
            'powershell',
            ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${win32.zipPath.replace(/'/g, "''")}' -DestinationPath '${win32.extractDir.replace(/'/g, "''")}'`],
            { stdio: 'inherit' }
        );
        return;
    }
    execFileSync('unzip', ['-o', win32.zipPath, '-d', win32.extractDir], { stdio: 'inherit' });
}

function findShapefileBase(extractDir) {
    const shpName = require('fs').readdirSync(extractDir).find((name) => name.endsWith('.shp'));
    if (!shpName) throw new Error(`解壓後找不到 .shp：${extractDir}`);
    return require('path').join(extractDir, shpName.replace(/\.shp$/i, ''));
}

module.exports = {
    DEFAULT_SIMPLIFY_TOLERANCE,
    aciToHex,
    zoneNameToColor,
    transformGeometry,
    simplifyGeometry,
    cleanText,
    extractZip,
    findShapefileBase,
};
