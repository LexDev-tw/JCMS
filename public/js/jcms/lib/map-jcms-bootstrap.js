/** JCMS MapLibre 地圖 bootstrap：樣式、台灣行政界、預設視圖 */

/** JCMS Neo-Swiss 地圖色票（對齊 tailwind.config / .cursorrules） */
export const MAP_COLORS = Object.freeze({
    surface: '#FFFFFF',
    panel: '#F7F7F5',
    ink900: '#111111',
    ink600: '#666666',
    ink400: '#999999',
    ink100: '#EAEAEA',
    accent: '#F05A28',
});

export const NORTH_TW_BOUNDS = [[120.35, 24.55], [122.05, 25.45]];
export const MAP_FIT_PADDING = { top: 420, bottom: 90, left: 200, right: 200 };

export const LAYER_IDS = Object.freeze({
    adminLabels: 'tw-town-labels',
    countyBoundaries: 'tw-county-boundaries',
    townBoundaries: 'tw-town-boundaries',
    detailRoads: 'road-detail-minor',
});

/** 主要交通：國省道縣道、鐵路／捷運、渡輪航線、機場、港口 */
export const MAJOR_TRANSPORT_LAYER_IDS = Object.freeze([
    'transp-major-roads',
    'transp-rail',
    'transp-transit',
    'transp-ferry',
    'aeroway-airport-fill',
    'aeroway-airport-line',
    'poi-harbor',
]);

/** 內政部縣市／鄉鎮市區界（WGS84）；向量圖磚低縮放不含區級邊界 */
const TW_COUNTIES_TOPO_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json';
const TW_TOWNS_TOPO_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json';

let twTownsGeoJson = null;

/** JCMS Neo-Swiss：panel 陸地、surface 水域、ink 道路與標籤 */
export function createJcmsMapStyle() {
    return {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
            openmaptiles: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet',
            },
        },
        layers: [
            {
                id: 'background',
                type: 'background',
                paint: { 'background-color': MAP_COLORS.surface },
            },
            {
                id: 'water',
                type: 'fill',
                source: 'openmaptiles',
                'source-layer': 'water',
                paint: { 'fill-color': MAP_COLORS.surface },
            },
            {
                id: 'landcover',
                type: 'fill',
                source: 'openmaptiles',
                'source-layer': 'landcover',
                paint: {
                    'fill-color': MAP_COLORS.panel,
                    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.72, 10, 0.9, 14, 1],
                },
            },
            {
                id: 'landuse',
                type: 'fill',
                source: 'openmaptiles',
                'source-layer': 'landuse',
                paint: {
                    'fill-color': MAP_COLORS.ink100,
                    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.12, 13, 0.28],
                },
            },
            {
                id: 'road-detail-minor',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': MAP_COLORS.ink600,
                    'line-opacity': 0.38,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 14, 0.9],
                },
                filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path']]],
            },
            {
                id: 'transp-major-roads',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': MAP_COLORS.ink900,
                    'line-opacity': 0.82,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 10, 1.1, 14, 2.6],
                },
                filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
            },
            {
                id: 'transp-rail',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': MAP_COLORS.ink900,
                    'line-opacity': 0.72,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1, 14, 2],
                },
                filter: ['==', ['get', 'class'], 'rail'],
            },
            {
                id: 'transp-transit',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': MAP_COLORS.ink900,
                    'line-opacity': 0.68,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.2, 14, 2],
                    'line-dasharray': [2, 1.5],
                },
                filter: ['==', ['get', 'class'], 'transit'],
            },
            {
                id: 'transp-ferry',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'transportation',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': MAP_COLORS.ink600,
                    'line-opacity': 0.65,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1, 14, 1.5],
                    'line-dasharray': [4, 3],
                },
                filter: ['==', ['get', 'class'], 'ferry'],
            },
            {
                id: 'aeroway-airport-fill',
                type: 'fill',
                source: 'openmaptiles',
                'source-layer': 'aeroway',
                layout: { visibility: 'none' },
                minzoom: 8,
                paint: {
                    'fill-color': MAP_COLORS.ink100,
                    'fill-opacity': 0.45,
                },
                filter: ['in', ['get', 'class'], ['literal', ['aerodrome', 'heliport', 'apron']]],
            },
            {
                id: 'aeroway-airport-line',
                type: 'line',
                source: 'openmaptiles',
                'source-layer': 'aeroway',
                layout: { visibility: 'none' },
                minzoom: 9,
                paint: {
                    'line-color': MAP_COLORS.ink600,
                    'line-opacity': 0.55,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 12, 1, 14, 2],
                },
                filter: ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]],
            },
            {
                id: 'poi-harbor',
                type: 'circle',
                source: 'openmaptiles',
                'source-layer': 'poi',
                layout: { visibility: 'none' },
                minzoom: 9,
                paint: {
                    'circle-color': MAP_COLORS.ink600,
                    'circle-opacity': 0.75,
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 12, 4, 14, 5],
                    'circle-stroke-color': MAP_COLORS.ink900,
                    'circle-stroke-width': 0.8,
                },
                filter: ['==', ['get', 'class'], 'harbor'],
            },
        ],
    };
}

export function normalizeDefaultView(view) {
    if (!view || typeof view !== 'object') return null;
    const center = view.center;
    const zoom = Number(view.zoom);
    if (!Array.isArray(center) || center.length < 2) return null;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return null;
    return { center: [lng, lat], zoom };
}

export function applyDefaultMapView(map, defaultView, { animate = false } = {}) {
    const view = normalizeDefaultView(defaultView);
    if (view) {
        map.jumpTo({
            center: view.center,
            zoom: view.zoom,
            duration: animate ? 320 : 0,
        });
        return;
    }
    map.fitBounds(NORTH_TW_BOUNDS, {
        padding: MAP_FIT_PADDING,
        maxZoom: 10,
        duration: animate ? 320 : 0,
    });
}

function ringSignedArea(ring) {
    if (!ring || ring.length < 3) return 0;
    let sum = 0;
    const n = ring.length - 1;
    for (let i = 0; i < n; i += 1) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        sum += x0 * y1 - x1 * y0;
    }
    return sum * 0.5;
}

/** 多邊形外環面積加權質心（行政區標籤置中） */
function ringAreaCentroid(ring) {
    if (!ring || ring.length < 4) return null;
    let area = 0;
    let cx = 0;
    let cy = 0;
    const n = ring.length - 1;
    for (let i = 0; i < n; i += 1) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        const cross = x0 * y1 - x1 * y0;
        area += cross;
        cx += (x0 + x1) * cross;
        cy += (y0 + y1) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-14) return null;
    return [cx / (6 * area), cy / (6 * area)];
}

function ringVertexMean(ring) {
    if (!ring || ring.length < 3) return null;
    let sx = 0;
    let sy = 0;
    const n = ring.length - 1;
    for (let i = 0; i < n; i += 1) {
        sx += ring[i][0];
        sy += ring[i][1];
    }
    return [sx / n, sy / n];
}

function featureCentroid(feature) {
    const g = feature && feature.geometry;
    if (!g) return null;
    if (g.type === 'Polygon') {
        return ringAreaCentroid(g.coordinates[0]) || ringVertexMean(g.coordinates[0]);
    }
    if (g.type === 'MultiPolygon') {
        let bestCentroid = null;
        let bestArea = 0;
        g.coordinates.forEach((poly) => {
            const ring = poly[0];
            if (!ring) return;
            const area = Math.abs(ringSignedArea(ring));
            const c = ringAreaCentroid(ring) || ringVertexMean(ring);
            if (c && area > bestArea) {
                bestArea = area;
                bestCentroid = c;
            }
        });
        return bestCentroid;
    }
    return null;
}

export async function loadTaiwanAdminBoundaries(map) {
    if (map.getSource('tw-towns')) return;

    const [countyRes, townRes] = await Promise.all([
        fetch(TW_COUNTIES_TOPO_URL),
        fetch(TW_TOWNS_TOPO_URL),
    ]);
    if (!countyRes.ok) throw new Error(`county boundaries HTTP ${countyRes.status}`);
    if (!townRes.ok) throw new Error(`town boundaries HTTP ${townRes.status}`);

    const countyTopo = await countyRes.json();
    const townTopo = await townRes.json();
    const counties = topojson.feature(countyTopo, countyTopo.objects.counties);
    const towns = topojson.feature(townTopo, townTopo.objects.towns);
    twTownsGeoJson = towns;

    map.addSource('tw-counties', { type: 'geojson', data: counties });
    map.addLayer({
        id: LAYER_IDS.countyBoundaries,
        type: 'line',
        source: 'tw-counties',
        minzoom: 6,
        paint: {
            'line-color': MAP_COLORS.accent,
            'line-opacity': 0.88,
            'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.15, 10, 1.45, 14, 1.85],
        },
    });

    map.addSource('tw-towns', { type: 'geojson', data: towns });
    map.addLayer({
        id: LAYER_IDS.townBoundaries,
        type: 'line',
        source: 'tw-towns',
        minzoom: 7,
        paint: {
            'line-color': MAP_COLORS.accent,
            'line-opacity': 0.88,
            'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 11, 0.85, 14, 1.1],
            'line-dasharray': [3, 2],
        },
    });
}

export function ensureAdminLabelLayer(map) {
    if (map.getLayer(LAYER_IDS.adminLabels) || !twTownsGeoJson) return;

    const labelFeatures = twTownsGeoJson.features
        .map((f) => {
            const c = featureCentroid(f);
            const name = String((f.properties && f.properties.TOWNNAME) || '').trim();
            if (!c || !name) return null;
            return {
                type: 'Feature',
                properties: { name },
                geometry: { type: 'Point', coordinates: c },
            };
        })
        .filter(Boolean);

    map.addSource('tw-town-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: labelFeatures },
    });
    map.addLayer({
        id: LAYER_IDS.adminLabels,
        type: 'symbol',
        source: 'tw-town-labels',
        minzoom: 8,
        layout: {
            visibility: 'none',
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 11, 11, 14, 12],
            'text-anchor': 'center',
            'text-letter-spacing': 0.04,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
        },
        paint: {
            'text-color': MAP_COLORS.ink900,
            'text-halo-color': 'rgba(255, 255, 255, 0.92)',
            'text-halo-width': 1.4,
        },
    });
}
