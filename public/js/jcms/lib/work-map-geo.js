/** 工作地圖幾何：面積、距離、閉合判斷 */

const DEG = Math.PI / 180;
const EARTH_RADIUS = 6378137;

export function coordsNearlyEqual(a, b, epsilon = 1e-9) {
    if (!a || !b) return false;
    return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

export function isClosedRing(coords) {
    if (!Array.isArray(coords) || coords.length < 3) return false;
    return coordsNearlyEqual(coords[0], coords[coords.length - 1]);
}

/** 環形面積（平方公尺），適用台灣區域尺度 */
export function ringAreaSqMeters(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    const closed = [...ring];
    if (!coordsNearlyEqual(closed[0], closed[closed.length - 1])) {
        closed.push(closed[0]);
    }
    let area = 0;
    const n = closed.length - 1;
    for (let i = 0; i < n; i += 1) {
        const [lng1, lat1] = closed[i];
        const [lng2, lat2] = closed[i + 1];
        area += (lng2 - lng1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG));
    }
    return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

export function lineLengthMeters(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < coords.length; i += 1) {
        total += haversineMeters(coords[i - 1], coords[i]);
    }
    return total;
}

function haversineMeters(a, b) {
    const lat1 = a[1] * DEG;
    const lat2 = b[1] * DEG;
    const dLat = lat2 - lat1;
    const dLng = (b[0] - a[0]) * DEG;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

export function ringCentroid(ring) {
    if (!Array.isArray(ring) || !ring.length) return null;
    const closed = [...ring];
    if (!coordsNearlyEqual(closed[0], closed[closed.length - 1])) {
        closed.push(closed[0]);
    }
    let area = 0;
    let cx = 0;
    let cy = 0;
    const n = closed.length - 1;
    for (let i = 0; i < n; i += 1) {
        const [x1, y1] = closed[i];
        const [x2, y2] = closed[i + 1];
        const cross = x1 * y2 - x2 * y1;
        area += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    if (Math.abs(area) < 1e-12) {
        const mid = ring[Math.floor(ring.length / 2)];
        return mid ? [mid[0], mid[1]] : null;
    }
    area *= 0.5;
    return [cx / (6 * area), cy / (6 * area)];
}

export function formatAreaLabel(sqMeters) {
    const m2 = Number(sqMeters);
    if (!Number.isFinite(m2) || m2 <= 0) return '';
    if (m2 >= 10000) {
        const ha = m2 / 10000;
        return ha >= 100
            ? `${ha.toFixed(1)} 公頃`
            : `${ha.toFixed(2)} 公頃`;
    }
    return `${Math.round(m2).toLocaleString('zh-TW')} ㎡`;
}

export function formatLengthLabel(meters) {
    const m = Number(meters);
    if (!Number.isFinite(m) || m <= 0) return '';
    if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
    return `${Math.round(m)} m`;
}

/** 折線中點（依路徑長度取一半處） */
export function lineMidpoint(coords) {
    if (!Array.isArray(coords) || !coords.length) return null;
    if (coords.length === 1) return [coords[0][0], coords[0][1]];
    if (coords.length === 2) {
        return [
            (coords[0][0] + coords[1][0]) / 2,
            (coords[0][1] + coords[1][1]) / 2,
        ];
    }
    const total = lineLengthMeters(coords);
    if (total <= 0) return [coords[0][0], coords[0][1]];
    const half = total / 2;
    let acc = 0;
    for (let i = 1; i < coords.length; i += 1) {
        const seg = haversineMeters(coords[i - 1], coords[i]);
        if (acc + seg >= half) {
            const t = seg > 0 ? (half - acc) / seg : 0;
            return [
                coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
                coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
            ];
        }
        acc += seg;
    }
    const last = coords[coords.length - 1];
    return [last[0], last[1]];
}

export function draftIsPolygon(draftCoords) {
    if (!Array.isArray(draftCoords) || draftCoords.length < 3) return false;
    return isClosedRing(draftCoords);
}

/** 地圖項目中心點（點／線／面或機關點） */
export function featureMapCenter(feat) {
    if (!feat) return null;
    const coords = feat.coordinates;
    if (!Array.isArray(coords) || !coords.length) return null;
    if (typeof coords[0] === 'number') {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    }
    if (feat.type === 'polygon') {
        return ringCentroid(coords) || lineMidpoint(coords);
    }
    if (feat.type === 'line') {
        return lineMidpoint(coords);
    }
    return lineMidpoint(coords) || ringCentroid(coords);
}

export function measureDraft(draftCoords, drawMode) {
    if (!Array.isArray(draftCoords) || draftCoords.length < 2) {
        return { kind: null, areaSqM: 0, lengthM: 0, label: '' };
    }
    if (drawMode === 'polygon' || (drawMode === 'line' && draftIsPolygon(draftCoords))) {
        const areaSqM = ringAreaSqMeters(draftCoords);
        return { kind: 'area', areaSqM, lengthM: 0, label: formatAreaLabel(areaSqM) };
    }
    const lengthM = lineLengthMeters(draftCoords);
    return { kind: 'length', areaSqM: 0, lengthM, label: formatLengthLabel(lengthM) };
}
