/** 工作地圖圖層同步至 MapLibre */
import { listToGeoJsonByKind, draftToGeoJson, WORK_MAP_DEFAULT_COLOR, WORK_MAP_TOOL_MODES } from './work-map-model.js';
import { featureVertices } from './work-map-interaction.js';

const WORK_MAP_LAYER_PREFIX = 'work-map-list-';
const WORK_MAP_DRAFT_SOURCE = 'work-map-draft';
const WORK_MAP_DRAFT_LINE = 'work-map-draft-line';
const WORK_MAP_DRAFT_FILL = 'work-map-draft-fill';
const WORK_MAP_DRAFT_POINT = 'work-map-draft-point';
const WORK_MAP_SELECT_SOURCE = 'work-map-selection';
const WORK_MAP_SELECT_LAYER = 'work-map-selection-pt';
const WORK_MAP_VERTEX_SOURCE = 'work-map-vertices';
const WORK_MAP_VERTEX_LAYER = 'work-map-vertices-pt';

/** 地圖上點要素半徑（較先前縮小 50%） */
export const WORK_MAP_POINT_RADIUS = 4;

export const WORK_MAP_LAYER_COLORS = Object.freeze({
    fill: 'rgba(240, 90, 40, 0.12)',
    stroke: '#F05A28',
    point: '#111111',
    draft: '#666666',
});

function listLayerIds(listId) {
    const base = `${WORK_MAP_LAYER_PREFIX}${listId}`;
    return {
        sourcePoints: `${base}-src-pt`,
        sourceLines: `${base}-src-ln`,
        sourcePolygons: `${base}-src-pg`,
        sourceLabels: `${base}-src-lb`,
        layerPoints: `${base}-pt`,
        layerLines: `${base}-ln`,
        layerPolygonsFill: `${base}-pg-fill`,
        layerPolygonsLine: `${base}-pg-line`,
        layerLabels: `${base}-lb`,
    };
}

function upsertGeoJsonSource(map, sourceId, data) {
    const existing = map.getSource(sourceId);
    if (existing) {
        existing.setData(data);
        return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
}

function removeListLayers(map, listId) {
    const ids = listLayerIds(listId);
    [
        ids.layerPoints,
        ids.layerLines,
        ids.layerPolygonsFill,
        ids.layerPolygonsLine,
        ids.layerLabels,
    ].forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    [
        ids.sourcePoints,
        ids.sourceLines,
        ids.sourcePolygons,
        ids.sourceLabels,
    ].forEach((sourceId) => {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
    });
}

function applySolidPointPaint(map, layerId) {
    if (!map.getLayer(layerId)) return;
    map.setPaintProperty(layerId, 'circle-color', ['coalesce', ['get', 'color'], WORK_MAP_DEFAULT_COLOR]);
    map.setPaintProperty(layerId, 'circle-radius', WORK_MAP_POINT_RADIUS);
    map.setPaintProperty(layerId, 'circle-stroke-width', 0);
    map.setPaintProperty(layerId, 'circle-stroke-opacity', 0);
    map.setPaintProperty(layerId, 'circle-opacity', 1);
}

function syncListLayers(map, list) {
    const ids = listLayerIds(list.id);
    const geo = listToGeoJsonByKind(list);
    const visible = list.visible !== false ? 'visible' : 'none';

    upsertGeoJsonSource(map, ids.sourcePoints, geo.points);
    upsertGeoJsonSource(map, ids.sourceLines, geo.lines);
    upsertGeoJsonSource(map, ids.sourcePolygons, geo.polygons);
    upsertGeoJsonSource(map, ids.sourceLabels, geo.labels);

    if (!map.getLayer(ids.layerPolygonsFill)) {
        map.addLayer({
            id: ids.layerPolygonsFill,
            type: 'fill',
            source: ids.sourcePolygons,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'fill-color': ['coalesce', ['get', 'color'], WORK_MAP_DEFAULT_COLOR],
                'fill-opacity': 0.18,
            },
        });
    }
    if (!map.getLayer(ids.layerPolygonsLine)) {
        map.addLayer({
            id: ids.layerPolygonsLine,
            type: 'line',
            source: ids.sourcePolygons,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'line-color': ['coalesce', ['get', 'color'], WORK_MAP_DEFAULT_COLOR],
                'line-width': 2,
                'line-opacity': 0.9,
            },
        });
    }
    if (!map.getLayer(ids.layerLines)) {
        map.addLayer({
            id: ids.layerLines,
            type: 'line',
            source: ids.sourceLines,
            paint: {
                'line-color': ['coalesce', ['get', 'color'], WORK_MAP_DEFAULT_COLOR],
                'line-width': 2.5,
                'line-opacity': 0.88,
            },
        });
    }
    if (!map.getLayer(ids.layerPoints)) {
        map.addLayer({
            id: ids.layerPoints,
            type: 'circle',
            source: ids.sourcePoints,
            paint: {
                'circle-color': ['coalesce', ['get', 'color'], WORK_MAP_DEFAULT_COLOR],
                'circle-radius': WORK_MAP_POINT_RADIUS,
                'circle-stroke-width': 0,
                'circle-stroke-opacity': 0,
                'circle-opacity': 1,
            },
        });
    }
    applySolidPointPaint(map, ids.layerPoints);
    if (!map.getLayer(ids.layerLabels)) {
        map.addLayer({
            id: ids.layerLabels,
            type: 'symbol',
            source: ids.sourceLabels,
            layout: {
                'text-field': ['coalesce', ['get', 'titleLabel'], ['get', 'lengthLabel'], ['get', 'areaLabel']],
                'text-font': ['Noto Sans Regular'],
                'text-size': 10,
                'text-anchor': ['case', ['has', 'titleLabel'], 'top', 'center'],
                'text-offset': ['case', ['has', 'titleLabel'], ['literal', [0, 0.85]], ['literal', [0, 0]]],
            },
            paint: {
                'text-color': '#111111',
                'text-halo-color': '#FFFFFF',
                'text-halo-width': 1.2,
            },
        });
    }

    [
        ids.layerPoints,
        ids.layerLines,
        ids.layerPolygonsFill,
        ids.layerPolygonsLine,
        ids.layerLabels,
    ].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible);
    });
}

export function syncWorkMapDocLayers(map, doc) {
    if (!map || !doc) return;
    const listIds = new Set((doc.lists || []).map((l) => l.id));

    Object.keys(map.getStyle()?.sources || {}).forEach((sourceId) => {
        if (!sourceId.startsWith(WORK_MAP_LAYER_PREFIX)) return;
        const rest = sourceId.slice(WORK_MAP_LAYER_PREFIX.length);
        const match = rest.match(/^(.+)-src-(?:pt|ln|pg|lb)$/);
        const listId = match && match[1];
        if (listId && !listIds.has(listId)) {
            removeListLayers(map, listId);
        }
    });

    (doc.lists || []).forEach((list) => syncListLayers(map, list));
}

export function syncWorkMapDraftLayer(map, draftCoords, drawMode, draftCursor = null) {
    if (!map) return;
    const data = draftToGeoJson(draftCoords, drawMode, draftCursor);

    upsertGeoJsonSource(map, WORK_MAP_DRAFT_SOURCE, data);

    if (!map.getLayer(WORK_MAP_DRAFT_FILL)) {
        map.addLayer({
            id: WORK_MAP_DRAFT_FILL,
            type: 'fill',
            source: WORK_MAP_DRAFT_SOURCE,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'fill-color': WORK_MAP_LAYER_COLORS.draft,
                'fill-opacity': 0.12,
            },
        });
    }
    if (!map.getLayer(WORK_MAP_DRAFT_LINE)) {
        map.addLayer({
            id: WORK_MAP_DRAFT_LINE,
            type: 'line',
            source: WORK_MAP_DRAFT_SOURCE,
            filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
            paint: {
                'line-color': WORK_MAP_LAYER_COLORS.draft,
                'line-width': 2,
                'line-dasharray': [2, 2],
            },
        });
    }
    if (!map.getLayer(WORK_MAP_DRAFT_POINT)) {
        map.addLayer({
            id: WORK_MAP_DRAFT_POINT,
            type: 'circle',
            source: WORK_MAP_DRAFT_SOURCE,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-color': WORK_MAP_LAYER_COLORS.draft,
                'circle-radius': WORK_MAP_POINT_RADIUS,
                'circle-stroke-width': 0,
                'circle-stroke-opacity': 0,
                'circle-opacity': 1,
            },
        });
    } else {
        applySolidPointPaint(map, WORK_MAP_DRAFT_POINT);
        map.setPaintProperty(WORK_MAP_DRAFT_POINT, 'circle-color', WORK_MAP_LAYER_COLORS.draft);
    }

    const show = data.features.length ? 'visible' : 'none';
    [WORK_MAP_DRAFT_FILL, WORK_MAP_DRAFT_LINE, WORK_MAP_DRAFT_POINT].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', show);
    });
}

export function clearWorkMapDraftLayer(map) {
    if (!map) return;
    syncWorkMapDraftLayer(map, [], null);
}

export function syncWorkMapSelectionLayer(map, feature) {
    if (!map) return;
    let geometry = null;
    if (feature && feature.coordinates) {
        if (feature.type === 'point') {
            geometry = { type: 'Point', coordinates: feature.coordinates };
        } else if (feature.type === 'line') {
            geometry = { type: 'LineString', coordinates: feature.coordinates };
        } else if (feature.type === 'polygon') {
            const ring = [...feature.coordinates];
            const first = ring[0];
            const last = ring[ring.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            geometry = { type: 'Polygon', coordinates: [ring] };
        }
    }

    const data = geometry
        ? {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                properties: { id: feature.id },
                geometry,
            }],
        }
        : { type: 'FeatureCollection', features: [] };

    upsertGeoJsonSource(map, WORK_MAP_SELECT_SOURCE, data);

    if (!map.getLayer(`${WORK_MAP_SELECT_LAYER}-line`)) {
        map.addLayer({
            id: `${WORK_MAP_SELECT_LAYER}-line`,
            type: 'line',
            source: WORK_MAP_SELECT_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': '#111111',
                'line-width': 3,
                'line-opacity': 0.85,
            },
        });
    }
    if (!map.getLayer(`${WORK_MAP_SELECT_LAYER}-fill`)) {
        map.addLayer({
            id: `${WORK_MAP_SELECT_LAYER}-fill`,
            type: 'fill',
            source: WORK_MAP_SELECT_SOURCE,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: {
                'fill-color': '#111111',
                'fill-opacity': 0.06,
            },
        });
    }
    if (!map.getLayer(WORK_MAP_SELECT_LAYER)) {
        map.addLayer({
            id: WORK_MAP_SELECT_LAYER,
            type: 'circle',
            source: WORK_MAP_SELECT_SOURCE,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-color': '#111111',
                'circle-radius': 5,
                'circle-opacity': 0.12,
                'circle-stroke-width': 0,
                'circle-stroke-opacity': 0,
            },
        });
    }

    const isPoint = feature?.type === 'point';
    const isLine = feature?.type === 'line';
    const isPolygon = feature?.type === 'polygon';
    const show = data.features.length ? 'visible' : 'none';

    if (map.getLayer(WORK_MAP_SELECT_LAYER)) {
        map.setLayoutProperty(
            WORK_MAP_SELECT_LAYER,
            'visibility',
            show === 'visible' && isPoint ? 'visible' : 'none'
        );
    }
    if (map.getLayer(`${WORK_MAP_SELECT_LAYER}-line`)) {
        map.setLayoutProperty(
            `${WORK_MAP_SELECT_LAYER}-line`,
            'visibility',
            show === 'visible' && isLine ? 'visible' : 'none'
        );
    }
    if (map.getLayer(`${WORK_MAP_SELECT_LAYER}-fill`)) {
        map.setLayoutProperty(
            `${WORK_MAP_SELECT_LAYER}-fill`,
            'visibility',
            show === 'visible' && isPolygon ? 'visible' : 'none'
        );
    }
}

export function syncWorkMapVertexLayer(map, feature, toolMode) {
    if (!map) return;

    const show =
        toolMode === WORK_MAP_TOOL_MODES.select &&
        feature &&
        (feature.type === 'point' || feature.type === 'line' || feature.type === 'polygon');

    const verts = show ? featureVertices(feature) : [];
    const data = {
        type: 'FeatureCollection',
        features: verts.map((v) => ({
            type: 'Feature',
            properties: { vertexIndex: v.index },
            geometry: { type: 'Point', coordinates: v.coord },
        })),
    };

    upsertGeoJsonSource(map, WORK_MAP_VERTEX_SOURCE, data);

    if (!map.getLayer(WORK_MAP_VERTEX_LAYER)) {
        map.addLayer({
            id: WORK_MAP_VERTEX_LAYER,
            type: 'circle',
            source: WORK_MAP_VERTEX_SOURCE,
            paint: {
                'circle-color': '#FFFFFF',
                'circle-radius': 2.5,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#111111',
                'circle-opacity': 1,
            },
        });
    }

    if (map.getLayer(WORK_MAP_VERTEX_LAYER)) {
        map.setLayoutProperty(
            WORK_MAP_VERTEX_LAYER,
            'visibility',
            data.features.length ? 'visible' : 'none'
        );
    }
}

export function queryWorkMapFeatureAt(map, point, activeListId) {
    if (!map || !activeListId) return null;
    const base = `${WORK_MAP_LAYER_PREFIX}${activeListId}`;
    const layerIds = [
        `${base}-pt`,
        `${base}-ln`,
        `${base}-pg-fill`,
        `${base}-pg-line`,
    ].filter((id) => map.getLayer(id));

    const hits = map.queryRenderedFeatures(point, { layers: layerIds });
    if (!hits.length) return null;
    const props = hits[0].properties || {};
    const featureId = props.id;
    if (!featureId) return null;
    return {
        id: featureId,
        type: props.featureType,
        title: props.title,
    };
}
