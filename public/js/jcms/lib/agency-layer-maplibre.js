/** 工作地圖編輯：司法／警察圖層同步 */
import {
    AGENCY_LAYER_KINDS,
    agencyFeaturesToGeoJson,
} from './agency-layer-model.js';

const EDIT_SOURCE = 'agency-layer-edit';
const EDIT_LAYER = 'agency-layer-edit-circle';
const EDIT_SELECT_SOURCE = 'agency-layer-edit-select';
const EDIT_SELECT_LAYER = 'agency-layer-edit-select-circle';

const LAYER_COLORS = Object.freeze({
    judicial: 'rgb(37, 74, 125)',
    police: 'rgb(40, 49, 133)',
});

function upsertGeoJsonSource(map, sourceId, data) {
    const existing = map.getSource(sourceId);
    if (existing) {
        existing.setData(data);
        return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
}

export function syncAgencyEditLayer(map, kind, features, selectedId = null) {
    if (!map) return;

    const color = kind === AGENCY_LAYER_KINDS.judicial
        ? LAYER_COLORS.judicial
        : LAYER_COLORS.police;
    const geo = agencyFeaturesToGeoJson(kind, features || []);

    upsertGeoJsonSource(map, EDIT_SOURCE, geo);

    if (!map.getLayer(EDIT_LAYER)) {
        map.addLayer({
            id: EDIT_LAYER,
            type: 'circle',
            source: EDIT_SOURCE,
            paint: {
                'circle-radius': 8,
                'circle-color': color,
                'circle-opacity': 0.88,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
            },
        });
    } else {
        map.setPaintProperty(EDIT_LAYER, 'circle-color', color);
    }

    const selected = selectedId
        ? geo.features.filter((f) => f.properties?.id === selectedId)
        : [];
    const selectGeo = {
        type: 'FeatureCollection',
        features: selected,
    };
    upsertGeoJsonSource(map, EDIT_SELECT_SOURCE, selectGeo);

    if (!map.getLayer(EDIT_SELECT_LAYER)) {
        map.addLayer({
            id: EDIT_SELECT_LAYER,
            type: 'circle',
            source: EDIT_SELECT_SOURCE,
            paint: {
                'circle-radius': 12,
                'circle-color': 'transparent',
                'circle-stroke-color': '#F05A28',
                'circle-stroke-width': 2.5,
            },
        });
    }

    const show = geo.features.length ? 'visible' : 'none';
    if (map.getLayer(EDIT_LAYER)) {
        map.setLayoutProperty(EDIT_LAYER, 'visibility', show);
    }
    if (map.getLayer(EDIT_SELECT_LAYER)) {
        map.setLayoutProperty(
            EDIT_SELECT_LAYER,
            'visibility',
            selected.length ? 'visible' : 'none'
        );
    }
}

export function clearAgencyEditLayer(map) {
    if (!map) return;
    [EDIT_SELECT_LAYER, EDIT_LAYER].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none');
    });
    [EDIT_SELECT_SOURCE, EDIT_SOURCE].forEach((sourceId) => {
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData({ type: 'FeatureCollection', features: [] });
        }
    });
}

export function queryAgencyFeatureAt(map, point) {
    if (!map?.getLayer(EDIT_LAYER)) return null;
    const hits = map.queryRenderedFeatures(point, { layers: [EDIT_LAYER] });
    const feature = hits?.[0];
    if (!feature) return null;
    return {
        id: feature.properties?.id || null,
        properties: feature.properties || {},
        coordinates: feature.geometry?.coordinates || null,
    };
}

export const AGENCY_EDIT_LAYER_ID = EDIT_LAYER;
