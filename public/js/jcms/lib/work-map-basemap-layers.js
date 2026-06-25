/** 工作地圖編輯：交通／正射影像／行政區底圖圖層 */
import {
    LAYER_IDS,
    MAJOR_TRANSPORT_LAYER_IDS,
} from './map-jcms-bootstrap.js?v=0.1.20260625';

export const MAP_SETTINGS_STORAGE_KEY = 'jcms.dashboard-map.settings';

export function loadBasemapLayerPrefs() {
    try {
        const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
        if (!raw) {
            return { majorTransport: false, nlscOrthophoto: false, adminLabels: false };
        }
        const data = JSON.parse(raw);
        const hasAdminKey = Object.prototype.hasOwnProperty.call(data, 'adminLabels');
        return {
            majorTransport: Boolean(data?.majorTransport),
            nlscOrthophoto: Boolean(data?.nlscOrthophoto),
            adminLabels: hasAdminKey ? Boolean(data.adminLabels) : false,
        };
    } catch {
        return { majorTransport: false, nlscOrthophoto: false, adminLabels: false };
    }
}

export function persistBasemapLayerPrefs(prefs) {
    try {
        const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
        const data = raw && typeof JSON.parse(raw) === 'object' ? JSON.parse(raw) : {};
        data.majorTransport = Boolean(prefs?.majorTransport);
        data.nlscOrthophoto = Boolean(prefs?.nlscOrthophoto);
        data.adminLabels = Boolean(prefs?.adminLabels);
        localStorage.setItem(MAP_SETTINGS_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
        console.warn('[work-map] 底圖圖層設定儲存失敗', err);
    }
}

export function loadCurrentLocationFromStorage() {
    try {
        const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        const loc = data?.currentLocation;
        if (!loc || typeof loc !== 'object') return null;
        const lng = Number(loc.lng ?? loc.coordinates?.[0]);
        const lat = Number(loc.lat ?? loc.coordinates?.[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            title: String(loc.title || '').trim() || '現在位置',
            description: String(loc.description || '').trim(),
        };
    } catch {
        return null;
    }
}

export function persistCurrentLocation(loc) {
    if (!loc || typeof loc !== 'object') return;
    const lng = Number(loc.lng);
    const lat = Number(loc.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    persistMapSettingsPatch({
        currentLocation: {
            lng,
            lat,
            title: String(loc.title || '').trim() || '現在位置',
            description: String(loc.description || '').trim(),
        },
    });
}

export function persistMapSettingsPatch(patch) {
    try {
        const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
        const data = raw && typeof JSON.parse(raw) === 'object' ? JSON.parse(raw) : {};
        Object.assign(data, patch);
        localStorage.setItem(MAP_SETTINGS_STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
        console.warn('[work-map] 地圖設定儲存失敗', err);
    }
}

export function applyMajorTransportVisibility(map, visible) {
    if (!map) return;
    const layout = visible ? 'visible' : 'none';
    MAJOR_TRANSPORT_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', layout);
        }
    });
    if (map.getLayer(LAYER_IDS.detailRoads)) {
        map.setLayoutProperty(LAYER_IDS.detailRoads, 'visibility', layout);
    }
}

export function applyAdminBoundariesVisibility(map, visible) {
    if (!map) return;
    const layout = visible ? 'visible' : 'none';
    [LAYER_IDS.countyBoundaries, LAYER_IDS.townBoundaries].forEach((layerId) => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', layout);
        }
    });
}

export function applyAdminNameLabelsVisibility(map, visible) {
    if (!map) return;
    if (!map.getLayer(LAYER_IDS.adminLabels)) return;
    map.setLayoutProperty(
        LAYER_IDS.adminLabels,
        'visibility',
        visible ? 'visible' : 'none'
    );
}

export function applyWorkMapBasemapLayers(map, prefs) {
    if (!map) return;
    applyMajorTransportVisibility(map, Boolean(prefs?.majorTransport));
    applyAdminBoundariesVisibility(map, true);
    applyAdminNameLabelsVisibility(map, Boolean(prefs?.adminLabels));
    if (typeof globalThis.DashboardMapNlsc !== 'undefined') {
        globalThis.DashboardMapNlsc.applyNlscLayerVisibility(map, {
            nlscOrthophoto: Boolean(prefs?.nlscOrthophoto),
            nlscLandsect: false,
        });
    }
}
