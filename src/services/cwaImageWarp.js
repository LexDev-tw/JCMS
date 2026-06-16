/** Reproject CWA plate-carree PNG for MapLibre image source (Web Mercator corners). */

const { PNG } = require('pngjs');

const warpCache = new Map();

function mercatorX(lonDeg) {
    return (lonDeg * Math.PI) / 180;
}

function mercatorY(latDeg) {
    const latRad = (latDeg * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

function invMercatorX(x) {
    return (x * 180) / Math.PI;
}

function invMercatorY(y) {
    return (180 / Math.PI) * (2 * Math.atan(Math.exp(y)) - Math.PI / 2);
}

function bilinearMercatorAt(u, v, bounds) {
    const { west, east, south, north } = bounds;
    const tl = [mercatorX(west), mercatorY(north)];
    const tr = [mercatorX(east), mercatorY(north)];
    const br = [mercatorX(east), mercatorY(south)];
    const bl = [mercatorX(west), mercatorY(south)];
    return [
        (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + u * v * br[0] + (1 - u) * v * bl[0],
        (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + u * v * br[1] + (1 - u) * v * bl[1],
    ];
}

function sampleBilinear(png, x, y) {
    const { width: w, height: h, data } = png;
    const clampedX = Math.max(0, Math.min(w - 1, x));
    const clampedY = Math.max(0, Math.min(h - 1, y));
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const tx = clampedX - x0;
    const ty = clampedY - y0;
    const idx = (px, py) => ((py * w) + px) << 2;
    const rgba = [0, 0, 0, 0];
    for (let c = 0; c < 4; c += 1) {
        rgba[c] = Math.round(
            (1 - tx) * (1 - ty) * data[idx(x0, y0) + c]
            + tx * (1 - ty) * data[idx(x1, y0) + c]
            + tx * ty * data[idx(x1, y1) + c]
            + (1 - tx) * ty * data[idx(x0, y1) + c]
        );
    }
    return rgba;
}

function warpPlateCarreePngForMaplibre(pngBuffer, bounds) {
    const source = PNG.sync.read(pngBuffer);
    const { width: w, height: h } = source;
    const output = new PNG({ width: w, height: h });
    const { west, east, south, north } = bounds;
    const lonSpan = east - west;
    const latSpan = north - south;

    for (let j = 0; j < h; j += 1) {
        const v = j / (h - 1);
        for (let i = 0; i < w; i += 1) {
            const u = i / (w - 1);
            const [mx, my] = bilinearMercatorAt(u, v, bounds);
            const lon = invMercatorX(mx);
            const lat = invMercatorY(my);
            const srcU = (lon - west) / lonSpan;
            const srcV = (north - lat) / latSpan;
            const outIdx = ((j * w) + i) << 2;
            if (srcU < 0 || srcU > 1 || srcV < 0 || srcV > 1) {
                output.data[outIdx + 3] = 0;
                continue;
            }
            const rgba = sampleBilinear(source, srcU * (w - 1), srcV * (h - 1));
            output.data[outIdx] = rgba[0];
            output.data[outIdx + 1] = rgba[1];
            output.data[outIdx + 2] = rgba[2];
            output.data[outIdx + 3] = rgba[3];
        }
    }

    return PNG.sync.write(output);
}

function getWarpedImage(cacheKey, ttlMs, pngBuffer, bounds) {
    const now = Date.now();
    const cached = warpCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
        return cached.buffer;
    }
    const buffer = warpPlateCarreePngForMaplibre(pngBuffer, bounds);
    warpCache.set(cacheKey, { buffer, expiresAt: now + ttlMs });
    return buffer;
}

module.exports = {
    warpPlateCarreePngForMaplibre,
    getWarpedImage,
};
