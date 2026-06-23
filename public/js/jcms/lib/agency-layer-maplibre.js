/** 工作地圖編輯：司法／警察圖層同步 */
import {
    AGENCY_LAYER_KINDS,
    agencyFeaturesToGeoJson,
} from './agency-layer-model.js';

const LAYER_COLORS = Object.freeze({
    judicial: 'rgb(37, 74, 125)',
    police: 'rgb(40, 49, 133)',
});

function layerIdsForKind(kind) {
    return {
        source: `agency-layer-${kind}`,
        layer: `agency-layer-${kind}-circle`,
        selectSource: `agency-layer-${kind}-select`,
        selectLayer: `agency-layer-${kind}-select-circle`,
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

function clearAgencyKindLayer(map, kind) {
    if (!map) return;
    const ids = layerIdsForKind(kind);
    [ids.selectLayer, ids.layer].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
    });
    [ids.selectSource, ids.source].forEach((sourceId) => {
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData({ type: 'FeatureCollection', features: [] });
        }
    });
}

export function syncAgencyEditLayer(map, kind, features, selectedId = null, visible = true) {
    if (!map) return;
    const ids = layerIdsForKind(kind);
    if (!visible) {
        clearAgencyKindLayer(map, kind);
        return;
    }

    const color = kind === AGENCY_LAYER_KINDS.judicial
        ? LAYER_COLORS.judicial
        : LAYER_COLORS.police;
    const geo = agencyFeaturesToGeoJson(kind, features || []);

    upsertGeoJsonSource(map, ids.source, geo);

    if (!map.getLayer(ids.layer)) {
        map.addLayer({
            id: ids.layer,
            type: 'circle',
            source: ids.source,
            paint: {
                'circle-radius': 4,
                'circle-color': color,
                'circle-opacity': 0.88,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
            },
        });
    } else {
        map.setPaintProperty(ids.layer, 'circle-color', color);
    }

    const selected = selectedId
        ? geo.features.filter((f) => f.properties?.id === selectedId)
        : [];
    upsertGeoJsonSource(map, ids.selectSource, {
        type: 'FeatureCollection',
        features: selected,
    });

    if (!map.getLayer(ids.selectLayer)) {
        map.addLayer({
            id: ids.selectLayer,
            type: 'circle',
            source: ids.selectSource,
            paint: {
                'circle-radius': 6,
                'circle-color': 'transparent',
                'circle-stroke-color': '#F05A28',
                'circle-stroke-width': 2.5,
            },
        });
    }

    const show = geo.features.length ? 'visible' : 'none';
    if (map.getLayer(ids.layer)) {
        map.setLayoutProperty(ids.layer, 'visibility', show);
    }
    if (map.getLayer(ids.selectLayer)) {
        map.setLayoutProperty(
            ids.selectLayer,
            'visibility',
            selected.length ? 'visible' : 'none'
        );
    }
}

export function syncAgencyEditLayers(map, {
    judicialFeatures = [],
    policeFeatures = [],
    judicialVisible = true,
    policeVisible = true,
    activeKind = null,
    selectedId = null,
} = {}) {
    if (!map) return;
    const judSelected = activeKind === AGENCY_LAYER_KINDS.judicial ? selectedId : null;
    const polSelected = activeKind === AGENCY_LAYER_KINDS.police ? selectedId : null;
    syncAgencyEditLayer(
        map,
        AGENCY_LAYER_KINDS.judicial,
        judicialFeatures,
        judSelected,
        judicialVisible
    );
    syncAgencyEditLayer(
        map,
        AGENCY_LAYER_KINDS.police,
        policeFeatures,
        polSelected,
        policeVisible
    );
}

export function clearAgencyEditLayer(map) {
    if (!map) return;
    clearAgencyKindLayer(map, AGENCY_LAYER_KINDS.judicial);
    clearAgencyKindLayer(map, AGENCY_LAYER_KINDS.police);
}

export function queryAgencyFeatureAt(map, point, activeKind = null) {
    if (!map) return null;
    const kinds = activeKind
        ? [activeKind]
        : [AGENCY_LAYER_KINDS.judicial, AGENCY_LAYER_KINDS.police];
    const layerIds = kinds
        .map((kind) => layerIdsForKind(kind).layer)
        .filter((id) => map.getLayer(id));

    const hits = map.queryRenderedFeatures(point, { layers: layerIds });
    const feature = hits?.[0];
    if (!feature) return null;
    return {
        id: feature.properties?.id || null,
        properties: feature.properties || {},
        coordinates: feature.geometry?.coordinates || null,
    };
}

export const AGENCY_EDIT_LAYER_ID = layerIdsForKind(AGENCY_LAYER_KINDS.judicial).layer;
