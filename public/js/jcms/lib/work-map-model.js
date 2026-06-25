/** 工作地圖：清單／圖層／地點資料模型與 localStorage 持久化 */

import {
    ringAreaSqMeters,
    ringCentroid,
    formatAreaLabel,
    lineLengthMeters,
    formatLengthLabel,
    lineMidpoint,
} from './work-map-geo.js?v=0.1.20260625';

export const WORK_MAP_FEATURE_TYPES = Object.freeze({
    point: 'point',
    line: 'line',
    polygon: 'polygon',
});

export const WORK_MAP_TOOL_MODES = Object.freeze({
    select: 'select',
    point: 'point',
    line: 'line',
    polygon: 'polygon',
});

export const WORK_MAP_DEFAULT_COLOR = '#F05A28';

export const WORK_MAP_COLOR_PRESETS = Object.freeze([
    '#F05A28',
    '#111111',
    '#666666',
    '#2563EB',
    '#16A34A',
    '#CA8A04',
    '#9333EA',
    '#DC2626',
]);

export function workMapStorageKey(workspaceId) {
    const ws = String(workspaceId || 'default').trim() || 'default';
    return `jcms.work-map.${ws}`;
}

export function createWorkMapId(prefix = 'wm') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyWorkMapDoc() {
    return {
        version: 1,
        lists: [],
    };
}

export function normalizeColor(raw) {
    const c = String(raw || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c.toUpperCase();
    return WORK_MAP_DEFAULT_COLOR;
}

function normalizeFeature(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = raw.type;
    if (!WORK_MAP_FEATURE_TYPES[type]) return null;
    const id = String(raw.id || '').trim() || createWorkMapId('feat');
    const title = String(raw.title || '').trim() || '未命名地點';
    const description = String(raw.description || '').trim();
    const color = normalizeColor(raw.color);

    if (type === WORK_MAP_FEATURE_TYPES.point) {
        const c = raw.coordinates;
        if (!Array.isArray(c) || c.length < 2) return null;
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return { id, type, title, description, color, coordinates: [lng, lat] };
    }

    if (type === WORK_MAP_FEATURE_TYPES.line) {
        const coords = normalizeLineCoords(raw.coordinates);
        if (!coords || coords.length < 2) return null;
        return { id, type, title, description, color, coordinates: coords };
    }

    if (type === WORK_MAP_FEATURE_TYPES.polygon) {
        const ring = normalizeLineCoords(raw.coordinates);
        if (!ring || ring.length < 3) return null;
        return { id, type, title, description, color, coordinates: ring };
    }

    return null;
}

function normalizeLineCoords(coords) {
    if (!Array.isArray(coords)) return null;
    const out = [];
    coords.forEach((pt) => {
        if (!Array.isArray(pt) || pt.length < 2) return;
        const lng = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        out.push([lng, lat]);
    });
    return out.length ? out : null;
}

function normalizeList(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim() || createWorkMapId('list');
    const name = String(raw.name || '').trim() || '未命名圖層';
    const visible = raw.visible !== false;
    const features = [];
    (raw.features || []).forEach((f) => {
        const norm = normalizeFeature(f);
        if (norm) features.push(norm);
    });
    return { id, name, visible, features };
}

export function normalizeWorkMapDoc(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyWorkMapDoc();
    const lists = [];
    (raw.lists || []).forEach((item) => {
        const norm = normalizeList(item);
        if (norm) lists.push(norm);
    });
    return { version: 1, lists };
}

export function loadWorkMapDoc(workspaceId) {
    try {
        const raw = localStorage.getItem(workMapStorageKey(workspaceId));
        if (!raw) return createEmptyWorkMapDoc();
        return normalizeWorkMapDoc(JSON.parse(raw));
    } catch (err) {
        console.warn('[work-map] 讀取失敗', err);
        return createEmptyWorkMapDoc();
    }
}

export function saveWorkMapDoc(workspaceId, doc) {
    try {
        localStorage.setItem(workMapStorageKey(workspaceId), JSON.stringify(normalizeWorkMapDoc(doc)));
        return true;
    } catch (err) {
        console.warn('[work-map] 儲存失敗', err);
        return false;
    }
}

export function featureTypeLabel(type) {
    if (type === WORK_MAP_FEATURE_TYPES.point) return '點';
    if (type === WORK_MAP_FEATURE_TYPES.line) return '線';
    if (type === WORK_MAP_FEATURE_TYPES.polygon) return '範圍';
    return '—';
}

function featureProps(f) {
    const props = {
        id: f.id,
        title: f.title,
        description: f.description || '',
        featureType: f.type,
        color: f.color || WORK_MAP_DEFAULT_COLOR,
    };
    if (f.type === WORK_MAP_FEATURE_TYPES.polygon) {
        const areaSqM = ringAreaSqMeters(f.coordinates);
        props.areaLabel = formatAreaLabel(areaSqM);
        const centroid = ringCentroid(f.coordinates);
        if (centroid) props.centroidLng = centroid[0];
        if (centroid) props.centroidLat = centroid[1];
    }
    return props;
}

export function listToGeoJsonByKind(list) {
    const points = [];
    const lines = [];
    const polygons = [];
    const labels = [];

    (list.features || []).forEach((f) => {
        if (f.type === WORK_MAP_FEATURE_TYPES.point) {
            const props = featureProps(f);
            points.push({
                type: 'Feature',
                properties: props,
                geometry: { type: 'Point', coordinates: f.coordinates },
            });
            if (props.title) {
                labels.push({
                    type: 'Feature',
                    properties: {
                        id: `${f.id}-title`,
                        featureId: f.id,
                        titleLabel: props.title,
                    },
                    geometry: { type: 'Point', coordinates: f.coordinates },
                });
            }
            return;
        }
        if (f.type === WORK_MAP_FEATURE_TYPES.line) {
            const props = featureProps(f);
            lines.push({
                type: 'Feature',
                properties: props,
                geometry: { type: 'LineString', coordinates: f.coordinates },
            });
            const lengthLabel = formatLengthLabel(lineLengthMeters(f.coordinates));
            const mid = lineMidpoint(f.coordinates);
            if (lengthLabel && mid) {
                labels.push({
                    type: 'Feature',
                    properties: {
                        id: `${f.id}-length`,
                        featureId: f.id,
                        lengthLabel,
                    },
                    geometry: { type: 'Point', coordinates: mid },
                });
            }
            return;
        }
        if (f.type === WORK_MAP_FEATURE_TYPES.polygon) {
            const ring = [...f.coordinates];
            if (ring.length >= 3) {
                const first = ring[0];
                const last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            }
            const props = featureProps(f);
            polygons.push({
                type: 'Feature',
                properties: props,
                geometry: { type: 'Polygon', coordinates: [ring] },
            });
            if (props.areaLabel && Number.isFinite(props.centroidLng)) {
                labels.push({
                    type: 'Feature',
                    properties: {
                        id: `${f.id}-label`,
                        featureId: f.id,
                        areaLabel: props.areaLabel,
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [props.centroidLng, props.centroidLat],
                    },
                });
            }
        }
    });

    return {
        points: { type: 'FeatureCollection', features: points },
        lines: { type: 'FeatureCollection', features: lines },
        polygons: { type: 'FeatureCollection', features: polygons },
        labels: { type: 'FeatureCollection', features: labels },
    };
}

export function draftToGeoJson(draftCoords, drawMode, draftCursor = null) {
    if (!Array.isArray(draftCoords) || !draftCoords.length) {
        return { type: 'FeatureCollection', features: [] };
    }

    const coords = draftCursor ? [...draftCoords, draftCursor] : [...draftCoords];

    if (drawMode === WORK_MAP_FEATURE_TYPES.point) {
        return {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { draft: true },
                geometry: { type: 'Point', coordinates: draftCoords[0] },
            }],
        };
    }

    const closed =
        drawMode === WORK_MAP_FEATURE_TYPES.polygon ||
        (drawMode === WORK_MAP_FEATURE_TYPES.line &&
            coords.length >= 3 &&
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]);

    if (closed && coords.length >= 3) {
        const ring = [...coords];
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
        return {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { draft: true },
                geometry: { type: 'Polygon', coordinates: [ring] },
            }],
        };
    }

    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { draft: true },
            geometry: { type: 'LineString', coordinates: coords },
        }],
    };
}

export function createDefaultFeature(type, coords, index) {
    const n = index + 1;
    const label =
        type === WORK_MAP_FEATURE_TYPES.point
            ? '地點'
            : type === WORK_MAP_FEATURE_TYPES.line
              ? '線段'
              : '範圍';
    return {
        id: createWorkMapId('feat'),
        type,
        title: `${label} ${n}`,
        description: '',
        color: WORK_MAP_DEFAULT_COLOR,
        coordinates: type === WORK_MAP_FEATURE_TYPES.point ? coords : coords,
    };
}
