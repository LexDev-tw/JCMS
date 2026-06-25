/** 地圖總覽：MapLibre + 案件統計圖 + 版面寬度同步 */
import { watch, onUnmounted, nextTick } from '../vue-api.js?v=0.1.20260625a';
import { syncWorkMapDocLayers } from '../lib/work-map-maplibre.js?v=0.1.20260625a';
import {
    AGENCY_LAYER_KINDS,
    resolveAgencyFeatures,
    agencyFeaturesToGeoJson,
} from '../lib/agency-layer-model.js?v=0.1.20260625a';

/** 內建行政區界線（VPS 同源，不依賴外部 CDN） */
const TW_LOCAL_COUNTIES_GEOJSON_URL = 'data/tw-counties.geojson';
const TW_LOCAL_TOWNS_GEOJSON_URL = 'data/tw-towns.geojson';
const TW_COUNTIES_TOPO_URLS = Object.freeze([
    'https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json',
    'https://unpkg.com/taiwan-atlas@latest/counties-10t.json',
]);
const TW_TOWNS_TOPO_URLS = Object.freeze([
    'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json',
    'https://unpkg.com/taiwan-atlas@latest/towns-10t.json',
]);
const TW_BOUNDARY_LAYER_IDS = Object.freeze({
    countyBoundaries: 'tw-county-boundaries',
    townBoundaries: 'tw-town-boundaries',
});
const TW_MAP_ACCENT = '#F05A28';

/** 跨頁切換保留：避免每次重建地圖都重新 fetch + 競態 */
let twBoundaryGeoCache = null;
let twBoundaryFetchPromise = null;

function q(root, id) {
    if (!root) return null;
    const raw = String(id).replace(/^#/, '').replace(/'/g, '');
    return root.querySelector('#' + raw);
}

function waitForMapStyleReady(map) {
    if (!map) return Promise.resolve();
    if (map.loaded()) return Promise.resolve();
    return new Promise((resolve) => {
        map.once('load', resolve);
    });
}

function hasTwBoundaryLayers(map) {
    return Boolean(
        map?.getLayer(TW_BOUNDARY_LAYER_IDS.countyBoundaries)
        && map?.getLayer(TW_BOUNDARY_LAYER_IDS.townBoundaries)
    );
}

function setTwBoundaryLayersVisible(map) {
    [TW_BOUNDARY_LAYER_IDS.countyBoundaries, TW_BOUNDARY_LAYER_IDS.townBoundaries].forEach((layerId) => {
        if (!map.getLayer(layerId)) return;
        map.setLayoutProperty(layerId, 'visibility', 'visible');
    });
}

function applyTwBoundaryLayersToMap(map, counties, towns) {
    if (!map?.getStyle()) return;

    if (!map.getSource('tw-counties')) {
        map.addSource('tw-counties', { type: 'geojson', data: counties });
    }
    if (!map.getLayer(TW_BOUNDARY_LAYER_IDS.countyBoundaries)) {
        map.addLayer({
            id: TW_BOUNDARY_LAYER_IDS.countyBoundaries,
            type: 'line',
            source: 'tw-counties',
            minzoom: 6,
            paint: {
                'line-color': TW_MAP_ACCENT,
                'line-opacity': 0.88,
                'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.15, 10, 1.45, 14, 1.85],
            },
        });
    }

    if (!map.getSource('tw-towns')) {
        map.addSource('tw-towns', { type: 'geojson', data: towns });
    }
    if (!map.getLayer(TW_BOUNDARY_LAYER_IDS.townBoundaries)) {
        map.addLayer({
            id: TW_BOUNDARY_LAYER_IDS.townBoundaries,
            type: 'line',
            source: 'tw-towns',
            minzoom: 7,
            paint: {
                'line-color': TW_MAP_ACCENT,
                'line-opacity': 0.88,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 11, 0.85, 14, 1.1],
                'line-dasharray': [3, 2],
            },
        });
    }

    setTwBoundaryLayersVisible(map);
}

async function fetchGeoJsonResource(url, label) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status} @ ${url}`);
    const data = await res.json();
    if (!data?.features?.length) throw new Error(`${label} empty`);
    return data;
}

async function fetchFirstOkJson(urls, label) {
    let lastErr = null;
    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                lastErr = new Error(`${label} HTTP ${res.status} @ ${url}`);
                continue;
            }
            return await res.json();
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error(`${label} load failed`);
}

async function fetchTwBoundaryGeoJson() {
    if (twBoundaryGeoCache) return twBoundaryGeoCache;
    if (twBoundaryFetchPromise) return twBoundaryFetchPromise;

    twBoundaryFetchPromise = (async () => {
        try {
            const [counties, towns] = await Promise.all([
                fetchGeoJsonResource(TW_LOCAL_COUNTIES_GEOJSON_URL, 'local counties'),
                fetchGeoJsonResource(TW_LOCAL_TOWNS_GEOJSON_URL, 'local towns'),
            ]);
            twBoundaryGeoCache = { counties, towns, source: 'local' };
            return twBoundaryGeoCache;
        } catch (localErr) {
            console.warn('[dashboard-map] 本地行政區界線載入失敗，嘗試 CDN', localErr);
        }

        if (typeof topojson === 'undefined' || typeof topojson.feature !== 'function') {
            throw new Error('topojson-client 未載入，無法使用 CDN 行政區界線');
        }

        const [countyTopo, townTopo] = await Promise.all([
            fetchFirstOkJson(TW_COUNTIES_TOPO_URLS, 'county boundaries'),
            fetchFirstOkJson(TW_TOWNS_TOPO_URLS, 'town boundaries'),
        ]);
        const counties = topojson.feature(countyTopo, countyTopo.objects.counties);
        const towns = topojson.feature(townTopo, townTopo.objects.towns);
        twBoundaryGeoCache = { counties, towns, source: 'cdn' };
        return twBoundaryGeoCache;
    })();

    try {
        return await twBoundaryFetchPromise;
    } finally {
        twBoundaryFetchPromise = null;
    }
}

async function ensureTwBoundaryLayersOnMap(map) {
    if (!map) return;

    await waitForMapStyleReady(map);
    if (!map.getStyle()) return;

    if (hasTwBoundaryLayers(map)) {
        setTwBoundaryLayersVisible(map);
        return;
    }

    const { counties, towns } = await fetchTwBoundaryGeoJson();
    if (!map.getStyle()) return;
    applyTwBoundaryLayersToMap(map, counties, towns);
}

function scheduleTwBoundaryLayers(map, isAlive) {
    const run = async () => {
        if (!isAlive()) return;
        try {
            await ensureTwBoundaryLayersOnMap(map);
        } catch (err) {
            console.warn('[dashboard-map] 鄉鎮市區界載入失敗', err);
        }
    };

    void run();
    if (typeof map.once === 'function') {
        map.once('idle', () => { void run(); });
    }
}

export function useDashboardMapView({
    rootRef,
    isActiveRef,
    getWorkspaceId,
    workMapDocRef,
    agencyLayerDocRef,
    currentLocationRef,
    pendingViewRef,
}) {
    let disposed = false;
    let mapInstance = null;
    let weatherApi = null;
    let airQualityApi = null;
    let waterReservoirApi = null;
    let policeApi = null;
    let judicialApi = null;
    let currentLocationApi = null;
    let populationApi = null;
    let nlscApi = null;
    let urbanPlanApi = null;
    let layerHealthApi = null;
    const caseStatsCharts = [];
    let resizeHandler = null;
    let layoutResizeHandler = null;
    let ro = null;
    let syncTopKpiLayoutWidthsFn = null;
    let stopWatchWorkMapDoc = null;
    let stopWatchAgencyDoc = null;
    let stopWatchCurrentLocation = null;
    let layerToggleAbort = null;
    let mountedMapRoot = null;
    let twTownsGeoJson = null;

    const MAP_SETTINGS_STORAGE_KEY = 'jcms.dashboard-map.settings';

    function normalizeDefaultView(view) {
        if (!view || typeof view !== 'object') return null;
        const center = view.center;
        const zoom = Number(view.zoom);
        if (!Array.isArray(center) || center.length < 2) return null;
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return null;
        return { center: [lng, lat], zoom };
    }

    function normalizeCurrentLocation(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const lng = Number(raw.lng ?? raw.coordinates?.[0]);
        const lat = Number(raw.lat ?? raw.coordinates?.[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            title: String(raw.title || '').trim() || '現在位置',
            description: String(raw.description || '').trim(),
        };
    }

    function getCurrentLocation() {
        const raw = currentLocationRef?.value ?? currentLocationRef;
        return normalizeCurrentLocation(raw);
    }

    function loadPersistedMapSettings() {
        try {
            const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return null;
            return data;
        } catch (err) {
            console.warn('[dashboard-map] 讀取地圖設定失敗', err);
            return null;
        }
    }

    function hydrateCurrentLocationFromStorage() {
        const persisted = loadPersistedMapSettings();
        const loc = normalizeCurrentLocation(persisted?.currentLocation);
        if (!loc || !currentLocationRef) return;
        if (currentLocationRef?.value !== undefined) {
            Object.assign(currentLocationRef.value, loc);
        } else if (typeof currentLocationRef === 'object') {
            Object.assign(currentLocationRef, loc);
        }
    }

    function createDefaultMapLayerState() {
        return {
            adminLabels: false,
            populationLabels: false,
            majorTransport: false,
            rainAdvisory: false,
            satelliteCloud: false,
            radarEcho: false,
            airQuality: false,
            waterReservoir: false,
            policeAgencies: false,
            judicialAgencies: false,
            nlscOrthophoto: false,
            nlscLandsect: false,
            urbanPlan: false,
            defaultView: null,
        };
    }

    function buildMapLayerStateFromStorage() {
        const state = createDefaultMapLayerState();
        const persisted = loadPersistedMapSettings();
        state.defaultView = normalizeDefaultView(persisted?.defaultView);
        state.majorTransport = Boolean(persisted?.majorTransport);
        state.nlscOrthophoto = Boolean(persisted?.nlscOrthophoto);
        state.adminLabels = Boolean(persisted?.adminLabels);
        return state;
    }

    const mapLayerState = buildMapLayerStateFromStorage();

    function resetMapLayerTogglesToDefault() {
        const defaults = createDefaultMapLayerState();
        mapLayerState.adminLabels = defaults.adminLabels;
        mapLayerState.populationLabels = defaults.populationLabels;
        mapLayerState.majorTransport = defaults.majorTransport;
        mapLayerState.rainAdvisory = defaults.rainAdvisory;
        mapLayerState.satelliteCloud = defaults.satelliteCloud;
        mapLayerState.radarEcho = defaults.radarEcho;
        mapLayerState.airQuality = defaults.airQuality;
        mapLayerState.waterReservoir = defaults.waterReservoir;
        mapLayerState.policeAgencies = defaults.policeAgencies;
        mapLayerState.judicialAgencies = defaults.judicialAgencies;
        mapLayerState.nlscOrthophoto = defaults.nlscOrthophoto;
        mapLayerState.nlscLandsect = defaults.nlscLandsect;
        mapLayerState.urbanPlan = defaults.urbanPlan;
    }

    function hydrateDefaultViewFromStorage() {
        const persisted = loadPersistedMapSettings();
        mapLayerState.defaultView = normalizeDefaultView(persisted?.defaultView);
    }

    function persistMapSettings() {
        try {
            const loc = getCurrentLocation();
            const persisted = loadPersistedMapSettings();
            localStorage.setItem(
                MAP_SETTINGS_STORAGE_KEY,
                JSON.stringify({
                    defaultView: mapLayerState.defaultView,
                    currentLocation: loc ?? persisted?.currentLocation ?? null,
                    majorTransport: mapLayerState.majorTransport,
                    nlscOrthophoto: mapLayerState.nlscOrthophoto,
                    adminLabels: mapLayerState.adminLabels,
                })
            );
        } catch (err) {
            console.warn('[dashboard-map] 儲存地圖設定失敗', err);
        }
    }

    function getCurrentLocationPayload() {
        const loc = getCurrentLocation();
        if (loc) return loc;
        const raw = currentLocationRef?.value ?? currentLocationRef;
        if (!raw || typeof raw !== 'object') return null;
        const lng = Number(raw.lng);
        const lat = Number(raw.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lng,
            lat,
            title: String(raw.title || '').trim() || '現在位置',
            description: String(raw.description || '').trim(),
        };
    }

    function syncCurrentLocationOnMap() {
        if (!mapInstance) return;
        const raw = currentLocationRef?.value ?? currentLocationRef;
        if (typeof globalThis.DashboardMapCurrentLocation?.syncCurrentLocation === 'function') {
            globalThis.DashboardMapCurrentLocation.syncCurrentLocation(mapInstance, raw);
            return;
        }
        if (!currentLocationApi) return;
        currentLocationApi.syncCurrentLocation(mapInstance, getCurrentLocationPayload());
    }

    async function resolveAgencyGeoJson(kind) {
        const doc = agencyLayerDocRef?.value ?? agencyLayerDocRef ?? null;
        const features = await resolveAgencyFeatures(kind, doc);
        return agencyFeaturesToGeoJson(kind, features);
    }

    function syncWorkMapLayersOnMap() {
        if (!mapInstance || !workMapDocRef) return;
        const doc = workMapDocRef?.value ?? workMapDocRef;
        syncWorkMapDocLayers(mapInstance, doc);
        syncCurrentLocationOnMap();
    }

    function applyPendingOverviewView() {
        if (!mapInstance || !pendingViewRef?.pendingView) return;
        const view = normalizeDefaultView(pendingViewRef.pendingView);
        pendingViewRef.pendingView = null;
        if (view) {
            mapInstance.jumpTo({
                center: view.center,
                zoom: view.zoom,
                duration: 0,
            });
            mapLayerState.defaultView = view;
            persistMapSettings();
        }
    }

    function getRoot() {
        return rootRef.value;
    }

    function teardown() {
        disposed = true;
        mountedMapRoot = null;
        if (twBoundaryGeoCache) {
            twTownsGeoJson = twBoundaryGeoCache.towns;
        }
        if (layerToggleAbort) {
            layerToggleAbort.abort();
            layerToggleAbort = null;
        }
        if (layoutResizeHandler) {
            window.removeEventListener('resize', layoutResizeHandler);
            layoutResizeHandler = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (ro) {
            ro.disconnect();
            ro = null;
        }
        if (stopWatchWorkMapDoc) {
            stopWatchWorkMapDoc();
            stopWatchWorkMapDoc = null;
        }
        if (stopWatchAgencyDoc) {
            stopWatchAgencyDoc();
            stopWatchAgencyDoc = null;
        }
        if (stopWatchCurrentLocation) {
            stopWatchCurrentLocation();
            stopWatchCurrentLocation = null;
        }
        if (weatherApi) {
            weatherApi.teardownWeatherRefresh();
            weatherApi = null;
        }
        if (airQualityApi) {
            airQualityApi.teardownAirQualityRefresh();
            airQualityApi = null;
        }
        if (waterReservoirApi) {
            waterReservoirApi.teardownWaterReservoirRefresh();
            waterReservoirApi = null;
        }
        if (policeApi) {
            policeApi.teardownPoliceLayers();
            policeApi = null;
        }
        if (judicialApi) {
            judicialApi.teardownJudicialLayers();
            judicialApi = null;
        }
        if (urbanPlanApi) {
            urbanPlanApi.teardownUrbanPlanLayers();
            urbanPlanApi = null;
        }
        if (mapInstance && typeof globalThis.DashboardMapCurrentLocation?.clearCurrentLocationMarker === 'function') {
            globalThis.DashboardMapCurrentLocation.clearCurrentLocationMarker(mapInstance);
        }
        populationApi = null;
        while (caseStatsCharts.length) {
            const c = caseStatsCharts.pop();
            if (c) c.destroy();
        }
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
        syncTopKpiLayoutWidthsFn = null;
    }

    function boot() {
        disposed = false;
        const root = getRoot();
        if (!root || !isActiveRef.value) return;

        resetMapLayerTogglesToDefault();
        hydrateDefaultViewFromStorage();
        hydrateCurrentLocationFromStorage();
        void fetchTwBoundaryGeoJson().catch(() => { /* 預熱本地界線 */ });

        const workspaceId = typeof getWorkspaceId === 'function' ? getWorkspaceId() : 'WS_001';

const CHART = { ink: '#111111', muted: '#666666', accent: '#F05A28', grid: '#EAEAEA' };

        /** JCMS Neo-Swiss 地圖色票（對齊 tailwind.config / .cursorrules） */
        const MAP_COLORS = Object.freeze({
            surface: '#FFFFFF',
            panel: '#F7F7F5',
            ink900: '#111111',
            ink600: '#666666',
            ink400: '#999999',
            ink100: '#EAEAEA',
            accent: '#F05A28',
        });

        

        /** JCMS Neo-Swiss：panel 陸地、surface 水域、ink 道路與標籤 */
        const MAP_STYLE = {
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
                    filter: ['match', ['get', 'class'], ['minor', 'service', 'path'], true, false],
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
                    filter: ['match', ['get', 'class'], ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'street', 'street_limited'], true, false],
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
                    filter: ['match', ['get', 'class'], ['aerodrome', 'heliport', 'apron'], true, false],
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
                    filter: ['match', ['get', 'class'], ['runway', 'taxiway'], true, false],
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

        /** 內政部縣市／鄉鎮市區界（WGS84）；向量圖磚低縮放不含區級邊界 */
        const NORTH_TW_BOUNDS = [[120.35, 24.55], [122.05, 25.45]];
        const MAP_FIT_PADDING = { top: 420, bottom: 90, left: 200, right: 200 };

        function applyDefaultMapView(map, { animate = false } = {}) {
            if (mapLayerState.defaultView) {
                map.jumpTo({
                    center: mapLayerState.defaultView.center,
                    zoom: mapLayerState.defaultView.zoom,
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

        function getTargetDefaultView(map) {
            if (mapLayerState.defaultView) return mapLayerState.defaultView;
            if (!map || typeof map.cameraForBounds !== 'function') return null;
            const cam = map.cameraForBounds(NORTH_TW_BOUNDS, {
                padding: MAP_FIT_PADDING,
                maxZoom: 10,
            });
            if (!cam?.center) return null;
            return {
                center: [cam.center.lng, cam.center.lat],
                zoom: cam.zoom,
            };
        }

        function isAtDefaultMapView(map) {
            if (!map) return false;
            const target = getTargetDefaultView(map);
            if (!target) return false;
            const c = map.getCenter();
            const zoom = map.getZoom();
            return (
                Math.abs(c.lng - target.center[0]) <= 0.002 &&
                Math.abs(c.lat - target.center[1]) <= 0.002 &&
                Math.abs(zoom - target.zoom) <= 0.08
            );
        }

        function syncRestoreDefaultViewButton() {
            const restoreViewBtn = q(root, 'map-restore-default-view');
            if (!restoreViewBtn) return;
            const atDefault = isAtDefaultMapView(mapInstance);
            restoreViewBtn.disabled = atDefault;
            restoreViewBtn.setAttribute('aria-disabled', atDefault ? 'true' : 'false');
        }

        function bindRestoreDefaultViewSync(map) {
            if (!map) return;
            const onViewChange = () => syncRestoreDefaultViewButton();
            map.on('moveend', onViewChange);
            map.on('resize', onViewChange);
        }

        const LAYER_IDS = Object.freeze({
            adminLabels: 'tw-town-labels',
            populationLabels: 'tw-town-population-labels',
            countyBoundaries: 'tw-county-boundaries',
            townBoundaries: 'tw-town-boundaries',
            detailRoads: 'road-detail-minor',
            rainAdvisoryFill: 'cwa-rain-advisory-fill',
            rainAdvisoryLabel: 'cwa-rainfall-label',
            rainAdvisoryLine: 'cwa-rain-advisory-line',
            satelliteCloud: 'cwa-satellite-cloud',
            radarEcho: 'cwa-radar-echo',
            airQualityCircle: 'epa-aq-station-circle',
            airQualityLabel: 'epa-aq-station-label',
            waterReservoirCircle: 'wra-reservoir-circle',
            waterReservoirLabel: 'wra-reservoir-label',
            waterReservoirSupplyFill: 'wra-reservoir-supply-fill',
            waterReservoirSupplyLine: 'wra-reservoir-supply-line',
            policeCircle: 'police-agency-circle',
            judicialCircle: 'judicial-agency-circle',
            judicialJurisdictionFill: 'judicial-jurisdiction-fill',
            judicialJurisdictionLine: 'judicial-jurisdiction-line',
        });

        function setWeatherMeta(message) {
            const el = q(root, 'map-weather-meta');
            if (el) el.textContent = message || '';
        }

        function setAirQualityMeta(message) {
            const el = q(root, 'map-air-quality-meta');
            if (el) el.textContent = message || '';
        }

        function setWaterReservoirMeta(message) {
            const el = q(root, 'map-water-reservoir-meta');
            if (el) el.textContent = message || '';
        }

        function updateNlscLayerMeta() {
            const el = q(root, 'map-nlsc-layer-meta');
            if (!el) return;
            if (mapLayerState.nlscOrthophoto || mapLayerState.nlscLandsect) {
                const parts = [];
                if (mapLayerState.nlscOrthophoto) parts.push('正射影像');
                if (mapLayerState.nlscLandsect) parts.push('地段外圍');
                el.textContent = `${parts.join(' · ')}\n內政部國土測繪中心`;
            } else {
                el.textContent = '';
            }
        }

        function setUrbanPlanMeta(message) {
            const el = q(root, 'map-urban-plan-meta');
            if (!el) return;
            const text = String(message || '').trim();
            el.textContent = text;
            el.hidden = !text;
        }

        function updatePopulationSourceMeta(state) {
            const el = q(root, 'map-population-source-meta');
            if (!el) return;

            const idle = !state || state.phase === 'idle' || !mapLayerState.populationLabels;
            if (idle) {
                el.textContent = '';
                el.hidden = true;
                return;
            }

            el.hidden = false;
            if (state.phase === 'loading') {
                el.textContent = '人口資料載入中…';
                return;
            }
            if (state.phase === 'error') {
                el.textContent = '人口資料載入失敗';
                return;
            }
            if (state.phase === 'ready' && state.data) {
                const fmt = globalThis.DashboardMapPopulation?.formatPopulationSourceMeta;
                el.textContent = typeof fmt === 'function'
                    ? fmt(state.data)
                    : `${state.data.sourceAgency || '內政部戶政司'}\n${state.data.statisticYyymm || ''}`;
            }
        }

        function isWeatherLayerActive() {
            return Boolean(isActiveRef.value && mapInstance && !disposed);
        }

        function isAirQualityLayerActive() {
            return Boolean(isActiveRef.value && mapInstance && !disposed && mapLayerState.airQuality);
        }

        function isWaterReservoirLayerActive() {
            return Boolean(isActiveRef.value && mapInstance && !disposed && mapLayerState.waterReservoir);
        }

        if (typeof globalThis.DashboardMapWeather !== 'undefined') {
            weatherApi = globalThis.DashboardMapWeather.createWeatherLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getMapLayerState: () => mapLayerState,
                setWeatherMeta,
            });
        }

        function resolveTwTownsGeoJson() {
            if (twTownsGeoJson) return twTownsGeoJson;
            if (twBoundaryGeoCache?.towns) {
                twTownsGeoJson = twBoundaryGeoCache.towns;
            }
            return twTownsGeoJson;
        }

        async function ensureTwTownsGeoJsonReady(map) {
            let data = resolveTwTownsGeoJson();
            if (data) return data;
            if (!map) return null;
            try {
                await ensureTwBoundaryLayersOnMap(map);
            } catch (err) {
                console.warn('[dashboard-map] 鄉鎮界線載入失敗', err);
                return null;
            }
            data = resolveTwTownsGeoJson();
            if (data) return data;
            if (map.getSource('tw-towns')) {
                try {
                    const src = map.getSource('tw-towns');
                    const raw = typeof src.serialize === 'function'
                        ? src.serialize()?.data
                        : src._data;
                    if (raw?.type === 'FeatureCollection') {
                        twTownsGeoJson = raw;
                    }
                } catch (_) {
                    /* ignore */
                }
            }
            return twTownsGeoJson;
        }

        if (typeof globalThis.DashboardMapPopulation !== 'undefined') {
            populationApi = globalThis.DashboardMapPopulation.createPopulationLabelsApi({
                mapColors: MAP_COLORS,
                getTwTownsGeoJson: () => resolveTwTownsGeoJson(),
                featureCentroid,
                getMapLayerState: () => mapLayerState,
                setPopulationMeta: updatePopulationSourceMeta,
            });
        }

        if (typeof globalThis.DashboardMapNlsc !== 'undefined') {
            nlscApi = globalThis.DashboardMapNlsc.createNlscLayersApi({
                getMapLayerState: () => mapLayerState,
            });
        }

        if (typeof globalThis.DashboardMapLayerHealth !== 'undefined') {
            layerHealthApi = globalThis.DashboardMapLayerHealth.createLayerHealthApi({
                getRoot: () => getRoot(),
            });
        }

        const HEALTH = layerHealthApi?.STATUS || { idle: 'idle', ok: 'ok', warn: 'warn', error: 'error' };

        function setLayerHealth(key, patch) {
            layerHealthApi?.setLayerHealth(key, patch);
        }

        function clearInactiveLayerHealth() {
            if (!layerHealthApi) return;
            if (!mapLayerState.adminLabels) layerHealthApi.clearLayerHealth('admin');
            if (!mapLayerState.populationLabels) layerHealthApi.clearLayerHealth('population');
            if (!mapLayerState.majorTransport) layerHealthApi.clearLayerHealth('transport');
            if (!mapLayerState.nlscOrthophoto) layerHealthApi.clearLayerHealth('orthophoto');
            if (!mapLayerState.nlscLandsect) layerHealthApi.clearLayerHealth('landsect');
        }

        function getDashboardMapApiBase() {
            if (typeof window.jcmsResolveApiBase === 'function') return window.jcmsResolveApiBase();
            if (typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()) {
                const s = window.JCMS_API_BASE.trim().replace(/\/+$/, '');
                return /\/api$/i.test(s) ? s : `${s}/api`;
            }
            return '/api';
        }

        if (typeof globalThis.DashboardMapAirQuality !== 'undefined') {
            airQualityApi = globalThis.DashboardMapAirQuality.createAirQualityLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getMapLayerState: () => mapLayerState,
                setAirQualityMeta,
                getApiBase: getDashboardMapApiBase,
            });
        }

        if (typeof globalThis.DashboardMapWaterReservoir !== 'undefined') {
            waterReservoirApi = globalThis.DashboardMapWaterReservoir.createWaterReservoirLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getMapLayerState: () => mapLayerState,
                setWaterReservoirMeta,
                getApiBase: getDashboardMapApiBase,
                getTwTownsGeoJson: () => resolveTwTownsGeoJson(),
                ensureTwTownsGeoJson: () => ensureTwTownsGeoJsonReady(mapInstance),
            });
        }

        if (typeof globalThis.DashboardMapPolice !== 'undefined') {
            policeApi = globalThis.DashboardMapPolice.createPoliceLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getMapLayerState: () => mapLayerState,
                getGeoJsonUrl: () => 'data/police-agencies.geojson',
                getResolvedGeoJson: () => resolveAgencyGeoJson(AGENCY_LAYER_KINDS.police),
            });
        }

        if (typeof globalThis.DashboardMapJudicial !== 'undefined') {
            judicialApi = globalThis.DashboardMapJudicial.createJudicialLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getMapLayerState: () => mapLayerState,
                getGeoJsonUrl: () => 'data/judicial-agencies.geojson',
                getTwTownsGeoJson: () => resolveTwTownsGeoJson(),
                getResolvedGeoJson: () => resolveAgencyGeoJson(AGENCY_LAYER_KINDS.judicial),
            });
        }

        if (typeof globalThis.DashboardMapUrbanPlan !== 'undefined') {
            urbanPlanApi = globalThis.DashboardMapUrbanPlan.createUrbanPlanLayersApi({
                getMapLayerState: () => mapLayerState,
                getGeoJsonUrls: () => [
                    'data/urban-plan.geojson',
                    '/api/map/urban-plan.geojson',
                ],
                setUrbanPlanMeta,
            });
        }

        if (typeof globalThis.DashboardMapCurrentLocation !== 'undefined') {
            currentLocationApi = globalThis.DashboardMapCurrentLocation.createCurrentLocationApi({
                mapColors: MAP_COLORS,
            });
        }

        /** 交通：主要路網＋詳細道路（國省道縣道、鐵路／捷運、渡輪、機場、港口等） */
        const MAJOR_TRANSPORT_LAYER_IDS = Object.freeze([
            'transp-major-roads',
            'transp-rail',
            'transp-transit',
            'transp-ferry',
            'aeroway-airport-fill',
            'aeroway-airport-line',
            'poi-harbor',
        ]);

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

        function syncTwTownsGeoJsonFromMap(map) {
            if (resolveTwTownsGeoJson()) return;
            if (!map.getSource('tw-towns')) return;
            try {
                const src = map.getSource('tw-towns');
                const data = typeof src.serialize === 'function'
                    ? src.serialize()?.data
                    : src._data;
                if (data && data.type === 'FeatureCollection') {
                    twTownsGeoJson = data;
                }
            } catch (_) {
                /* ignore */
            }
        }

        function isMapAlive(map) {
            return Boolean(!disposed && mapInstance && mapInstance === map);
        }

        function waitMapSettled(map) {
            return new Promise((resolve) => {
                if (!isMapAlive(map)) {
                    resolve();
                    return;
                }
                const finish = () => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(resolve);
                    });
                };
                if (typeof map.isMoving === 'function' && map.isMoving()) {
                    map.once('moveend', finish);
                    return;
                }
                finish();
            });
        }

        function waitMapStyleReady(map) {
            return waitForMapStyleReady(map);
        }

        async function ensureTaiwanAdminBoundaries(map) {
            if (!isMapAlive(map)) return;
            await ensureTwBoundaryLayersOnMap(map);
            if (!isMapAlive(map)) return;
            syncTwTownsGeoJsonFromMap(map);
        }

        function ensureAdminLabelLayer(map) {
            if (map.getLayer(LAYER_IDS.adminLabels) || !twTownsGeoJson) return;

            const labelFeatures = (twTownsGeoJson?.features || [])
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

        function raiseAdminLabelLayer(map) {
            if (!map.getLayer(LAYER_IDS.adminLabels)) return;
            try {
                map.moveLayer(LAYER_IDS.adminLabels);
            } catch (e) {
                /* 已在最上層 */
            }
        }

        function reconcileLayerStack(map) {
            if (!map || typeof globalThis.DashboardMapLayerStack?.reconcileDashboardLayerStack !== 'function') {
                return;
            }
            globalThis.DashboardMapLayerStack.reconcileDashboardLayerStack(map, mapLayerState, LAYER_IDS);
            syncCurrentLocationOnMap();
        }

        async function applyAdminLayerState(map) {
            if (!map) return false;
            try {
                await ensureTaiwanAdminBoundaries(map);
            } catch (err) {
                setLayerHealth('admin', {
                    status: HEALTH.error,
                    detail: mapLayerState.adminLabels ? '界線資料載入失敗' : '界線未就緒',
                });
                console.warn('[dashboard-map] 鄉鎮市區界載入失敗', err);
                return false;
            }

            ensureAdminLabelLayer(map);
            const labelCount = twTownsGeoJson?.features?.length ?? 0;

            if (map.getLayer(LAYER_IDS.adminLabels)) {
                map.setLayoutProperty(
                    LAYER_IDS.adminLabels,
                    'visibility',
                    mapLayerState.adminLabels ? 'visible' : 'none'
                );
                if (mapLayerState.adminLabels) {
                    raiseAdminLabelLayer(map);
                }
            }

            if (mapLayerState.adminLabels) {
                if (!map.getLayer(LAYER_IDS.adminLabels)) {
                    setLayerHealth('admin', { status: HEALTH.error, detail: '標籤圖層未建立' });
                } else {
                    setLayerHealth('admin', {
                        status: HEALTH.ok,
                        detail: `${labelCount} 個鄉鎮`,
                    });
                }
            } else {
                layerHealthApi?.clearLayerHealth('admin');
            }
            return true;
        }

        async function applyPopulationLayerState(map, adminReady) {
            if (!map || !populationApi) return;
            try {
                populationApi.ensurePopulationLabelLayer(map);
                populationApi.applyPopulationVisibility(map);
                if (adminReady && mapLayerState.populationLabels) {
                    await populationApi.refreshPopulationLabels(map);
                    const src = map.getSource('tw-town-population-labels');
                    const featureCount = src?._data?.features?.length ?? 0;
                    setLayerHealth('population', {
                        status: featureCount > 0 ? HEALTH.ok : HEALTH.warn,
                        detail: featureCount > 0 ? `${featureCount} 個標籤` : '無可顯示資料',
                    });
                } else if (mapLayerState.populationLabels && !adminReady) {
                    setLayerHealth('population', {
                        status: HEALTH.error,
                        detail: '需先載入行政區界線',
                    });
                } else {
                    layerHealthApi?.clearLayerHealth('population');
                }
            } catch (err) {
                setLayerHealth('population', { status: HEALTH.error, detail: '套用失敗' });
                console.warn('[dashboard-map] 人口圖層套用失敗', err);
            }
        }

        function applyTransportLayerState(map) {
            if (!map) return;
            try {
                let visibleLayers = 0;
                MAJOR_TRANSPORT_LAYER_IDS.forEach((layerId) => {
                    if (!map.getLayer(layerId)) return;
                    map.setLayoutProperty(
                        layerId,
                        'visibility',
                        mapLayerState.majorTransport ? 'visible' : 'none'
                    );
                    if (mapLayerState.majorTransport) visibleLayers += 1;
                });
                if (map.getLayer(LAYER_IDS.detailRoads)) {
                    map.setLayoutProperty(
                        LAYER_IDS.detailRoads,
                        'visibility',
                        mapLayerState.majorTransport ? 'visible' : 'none'
                    );
                    if (mapLayerState.majorTransport) visibleLayers += 1;
                }

                if (mapLayerState.majorTransport) {
                    setLayerHealth('transport', {
                        status: visibleLayers > 0 ? HEALTH.ok : HEALTH.error,
                        detail: visibleLayers > 0 ? `${visibleLayers} 個子圖層` : '子圖層不存在',
                    });
                } else {
                    layerHealthApi?.clearLayerHealth('transport');
                }
            } catch (err) {
                setLayerHealth('transport', { status: HEALTH.error, detail: '套用失敗' });
                console.warn('[dashboard-map] 交通圖層套用失敗', err);
            }
        }

        function applyNlscLayerState(map) {
            if (!map || !nlscApi) return;
            try {
                nlscApi.applyNlscLayerVisibility(map);
                updateNlscLayerMeta();

                const orthoId = nlscApi.LAYER_IDS?.orthophoto || 'nlsc-photo2';
                const landId = nlscApi.LAYER_IDS?.landsect || 'nlsc-landsect';

                if (mapLayerState.nlscOrthophoto) {
                    setLayerHealth('orthophoto', {
                        status: map.getLayer(orthoId) ? HEALTH.ok : HEALTH.error,
                        detail: layerHealthApi?.describeMapLayer(map, orthoId) || '圖層未建立',
                    });
                } else {
                    layerHealthApi?.clearLayerHealth('orthophoto');
                }

                if (mapLayerState.nlscLandsect) {
                    setLayerHealth('landsect', {
                        status: map.getLayer(landId) ? HEALTH.ok : HEALTH.error,
                        detail: layerHealthApi?.describeMapLayer(map, landId) || '圖層未建立',
                    });
                } else {
                    layerHealthApi?.clearLayerHealth('landsect');
                }
            } catch (err) {
                if (mapLayerState.nlscOrthophoto) {
                    setLayerHealth('orthophoto', { status: HEALTH.error, detail: '套用失敗' });
                }
                if (mapLayerState.nlscLandsect) {
                    setLayerHealth('landsect', { status: HEALTH.error, detail: '套用失敗' });
                }
                console.warn('[dashboard-map] NLSC 圖層套用失敗', err);
            }
        }

        async function applyMapLayerVisibility() {
            if (!mapInstance) return;

            const adminReady = await applyAdminLayerState(mapInstance);
            if (!mapInstance) return;

            await applyPopulationLayerState(mapInstance, adminReady);
            if (!mapInstance) return;

            applyTransportLayerState(mapInstance);
            applyNlscLayerState(mapInstance);
            reconcileLayerStack(mapInstance);
            clearInactiveLayerHealth();
        }

        async function applyWeatherLayerVisibility() {
            if (!mapInstance || !weatherApi) return;
            try {
                await weatherApi.refreshWeatherLayers(mapInstance);
                weatherApi.scheduleWeatherRefresh(mapInstance, isWeatherLayerActive);
                reconcileLayerStack(mapInstance);
            } catch (err) {
                console.warn('[dashboard-map] 氣象圖層載入失敗', err);
            }
        }

        async function applyAirQualityLayerVisibility() {
            if (!mapInstance || !airQualityApi) return;
            try {
                await airQualityApi.refreshAirQualityLayers(mapInstance);
                if (mapLayerState.airQuality) {
                    airQualityApi.scheduleAirQualityRefresh(mapInstance, isAirQualityLayerActive);
                }
            } catch (err) {
                console.warn('[dashboard-map] 空氣品質圖層載入失敗', err);
            }
        }

        async function applyWaterReservoirLayerVisibility() {
            if (!mapInstance || !waterReservoirApi) return;
            try {
                await waterReservoirApi.refreshWaterReservoirLayers(mapInstance);
                if (mapLayerState.waterReservoir) {
                    waterReservoirApi.scheduleWaterReservoirRefresh(mapInstance, isWaterReservoirLayerActive);
                } else {
                    waterReservoirApi.teardownWaterReservoirRefresh();
                    waterReservoirApi.clearSupplyHighlight(mapInstance);
                }
                reconcileLayerStack(mapInstance);
            } catch (err) {
                console.warn('[dashboard-map] 水庫水情圖層載入失敗', err);
            }
        }

        async function applyPoliceLayerVisibility() {
            if (!mapInstance || !policeApi) return;
            try {
                await policeApi.refreshPoliceLayers(mapInstance);
            } catch (err) {
                console.warn('[dashboard-map] 警察機關圖層載入失敗', err);
            }
        }

        async function applyJudicialLayerVisibility() {
            if (!mapInstance || !judicialApi) return;
            try {
                await judicialApi.refreshJudicialLayers(mapInstance);
            } catch (err) {
                console.warn('[dashboard-map] 司法機關圖層載入失敗', err);
            }
        }

        async function applyUrbanPlanLayerVisibility() {
            if (!mapInstance || !urbanPlanApi) return;
            try {
                await urbanPlanApi.refreshUrbanPlanLayers(mapInstance);
                reconcileLayerStack(mapInstance);
            } catch (err) {
                console.warn('[dashboard-map] 都市計畫圖層載入失敗', err);
            }
        }

        async function applyAllMapLayerState() {
            if (!mapInstance || disposed) return;
            syncMapLayerToggleUi();
            await applyMapLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyWeatherLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyAirQualityLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyWaterReservoirLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyPoliceLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyJudicialLayerVisibility();
            if (!mapInstance || disposed) return;
            await applyUrbanPlanLayerVisibility();
            if (!mapInstance || disposed) return;
            reconcileLayerStack(mapInstance);
        }

        async function onMapReady(map) {
            if (!isMapAlive(map)) return;

            if (nlscApi) {
                try {
                    nlscApi.ensureNlscLayers(map);
                } catch (err) {
                    console.warn('[dashboard-map] NLSC 圖層初始化失敗', err);
                }
            }
            if (weatherApi) {
                try {
                    weatherApi.ensureRainAdvisoryLayers(map);
                    weatherApi.ensureSatelliteLayer(map);
                    weatherApi.ensureRadarLayer(map);
                } catch (err) {
                    console.warn('[dashboard-map] 氣象圖層初始化失敗', err);
                }
            }

            try {
                await ensureTaiwanAdminBoundaries(map);
            } catch (err) {
                console.warn('[dashboard-map] 鄉鎮市區界載入失敗', err);
            }
            if (!isMapAlive(map)) return;

            try {
                ensureAdminLabelLayer(map);
                if (populationApi) {
                    populationApi.ensurePopulationLabelLayer(map);
                }
            } catch (err) {
                console.warn('[dashboard-map] 標籤圖層初始化失敗', err);
            }

            syncWorkMapLayersOnMap();
            syncCurrentLocationOnMap();
            if (pendingViewRef?.pendingView) {
                applyPendingOverviewView();
            } else {
                applyDefaultMapView(map);
            }
            syncRestoreDefaultViewButton();
            map.resize();

            await waitMapSettled(map);
            if (!isMapAlive(map)) return;
            await applyAllMapLayerState();
            if (!isMapAlive(map)) return;
            syncCurrentLocationOnMap();
            map.once('idle', () => {
                if (isMapAlive(map)) syncCurrentLocationOnMap();
            });
        }

        function syncMapLayerSwitch(input) {
            if (!input) return;
            input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
        }

        function syncMapLayerToggleUi() {
            const adminInput = q(root, 'map-toggle-admin-labels');
            const populationInput = q(root, 'map-toggle-population-labels');
            const majorTransportInput = q(root, 'map-toggle-major-transport');
            const rainInput = q(root, 'map-toggle-rain-advisory');
            const radarInput = q(root, 'map-toggle-radar-echo');
            const airQualityInput = q(root, 'map-toggle-air-quality');
            const waterReservoirInput = q(root, 'map-toggle-water-reservoir');
            const policeInput = q(root, 'map-toggle-police-agencies');
            const judicialInput = q(root, 'map-toggle-judicial-agencies');
            const nlscOrthophotoInput = q(root, 'map-toggle-nlsc-orthophoto');
            const nlscLandsectInput = q(root, 'map-toggle-nlsc-landsect');
            const urbanPlanInput = q(root, 'map-toggle-urban-plan');
            if (!adminInput || !majorTransportInput) return;

            adminInput.checked = mapLayerState.adminLabels;
            if (populationInput) populationInput.checked = mapLayerState.populationLabels;
            majorTransportInput.checked = mapLayerState.majorTransport;
            if (rainInput) rainInput.checked = mapLayerState.rainAdvisory;
            if (radarInput) radarInput.checked = mapLayerState.radarEcho;
            if (airQualityInput) airQualityInput.checked = mapLayerState.airQuality;
            if (waterReservoirInput) waterReservoirInput.checked = mapLayerState.waterReservoir;
            if (policeInput) policeInput.checked = mapLayerState.policeAgencies;
            if (judicialInput) judicialInput.checked = mapLayerState.judicialAgencies;
            if (nlscOrthophotoInput) nlscOrthophotoInput.checked = mapLayerState.nlscOrthophoto;
            if (nlscLandsectInput) nlscLandsectInput.checked = mapLayerState.nlscLandsect;
            if (urbanPlanInput) urbanPlanInput.checked = mapLayerState.urbanPlan;
            syncMapLayerSwitch(adminInput);
            if (populationInput) syncMapLayerSwitch(populationInput);
            syncMapLayerSwitch(majorTransportInput);
            if (rainInput) syncMapLayerSwitch(rainInput);
            if (radarInput) syncMapLayerSwitch(radarInput);
            if (airQualityInput) syncMapLayerSwitch(airQualityInput);
            if (waterReservoirInput) syncMapLayerSwitch(waterReservoirInput);
            if (policeInput) syncMapLayerSwitch(policeInput);
            if (judicialInput) syncMapLayerSwitch(judicialInput);
            if (nlscOrthophotoInput) syncMapLayerSwitch(nlscOrthophotoInput);
            if (nlscLandsectInput) syncMapLayerSwitch(nlscLandsectInput);
            if (urbanPlanInput) syncMapLayerSwitch(urbanPlanInput);
        }

        function bindMapLayerToggles() {
            if (layerToggleAbort) {
                layerToggleAbort.abort();
            }
            layerToggleAbort = new AbortController();
            const { signal } = layerToggleAbort;

            syncMapLayerToggleUi();
            requestAnimationFrame(() => {
                syncMapLayerToggleUi();
            });

            const adminInput = q(root, 'map-toggle-admin-labels');
            const populationInput = q(root, 'map-toggle-population-labels');
            const majorTransportInput = q(root, 'map-toggle-major-transport');
            const rainInput = q(root, 'map-toggle-rain-advisory');
            const radarInput = q(root, 'map-toggle-radar-echo');
            const airQualityInput = q(root, 'map-toggle-air-quality');
            const waterReservoirInput = q(root, 'map-toggle-water-reservoir');
            const policeInput = q(root, 'map-toggle-police-agencies');
            const judicialInput = q(root, 'map-toggle-judicial-agencies');
            const nlscOrthophotoInput = q(root, 'map-toggle-nlsc-orthophoto');
            const nlscLandsectInput = q(root, 'map-toggle-nlsc-landsect');
            const urbanPlanInput = q(root, 'map-toggle-urban-plan');
            if (!adminInput || !majorTransportInput) return;

            adminInput.addEventListener('change', () => {
                mapLayerState.adminLabels = adminInput.checked;
                syncMapLayerSwitch(adminInput);
                persistMapSettings();
                void applyMapLayerVisibility().then(() => {
                    if (populationApi && mapLayerState.populationLabels && mapInstance) {
                        populationApi.onAdminLabelsChanged(mapInstance);
                    }
                });
            }, { signal });
            if (populationInput) {
                populationInput.addEventListener('change', () => {
                    mapLayerState.populationLabels = populationInput.checked;
                    syncMapLayerSwitch(populationInput);
                    if (!populationInput.checked) {
                        updatePopulationSourceMeta({ phase: 'idle' });
                    }
                    void applyMapLayerVisibility();
                }, { signal });
            }
            majorTransportInput.addEventListener('change', () => {
                mapLayerState.majorTransport = majorTransportInput.checked;
                syncMapLayerSwitch(majorTransportInput);
                persistMapSettings();
                void applyMapLayerVisibility();
            }, { signal });
            if (rainInput) {
                rainInput.addEventListener('change', () => {
                    mapLayerState.rainAdvisory = rainInput.checked;
                    syncMapLayerSwitch(rainInput);
                    void applyWeatherLayerVisibility();
                }, { signal });
            }
            if (radarInput) {
                radarInput.addEventListener('change', () => {
                    mapLayerState.radarEcho = radarInput.checked;
                    syncMapLayerSwitch(radarInput);
                    void applyWeatherLayerVisibility();
                }, { signal });
            }
            if (airQualityInput) {
                airQualityInput.addEventListener('change', () => {
                    mapLayerState.airQuality = airQualityInput.checked;
                    syncMapLayerSwitch(airQualityInput);
                    if (!airQualityInput.checked) setAirQualityMeta('');
                    void applyAirQualityLayerVisibility();
                }, { signal });
            }
            if (waterReservoirInput) {
                waterReservoirInput.addEventListener('change', () => {
                    mapLayerState.waterReservoir = waterReservoirInput.checked;
                    syncMapLayerSwitch(waterReservoirInput);
                    if (!waterReservoirInput.checked) setWaterReservoirMeta('');
                    void applyWaterReservoirLayerVisibility();
                }, { signal });
            }
            if (policeInput) {
                policeInput.addEventListener('change', () => {
                    mapLayerState.policeAgencies = policeInput.checked;
                    syncMapLayerSwitch(policeInput);
                    void applyPoliceLayerVisibility();
                }, { signal });
            }
            if (judicialInput) {
                judicialInput.addEventListener('change', () => {
                    mapLayerState.judicialAgencies = judicialInput.checked;
                    syncMapLayerSwitch(judicialInput);
                    void applyJudicialLayerVisibility();
                }, { signal });
            }
            if (nlscOrthophotoInput) {
                nlscOrthophotoInput.addEventListener('change', () => {
                    mapLayerState.nlscOrthophoto = nlscOrthophotoInput.checked;
                    syncMapLayerSwitch(nlscOrthophotoInput);
                    persistMapSettings();
                    void applyMapLayerVisibility();
                }, { signal });
            }
            if (nlscLandsectInput) {
                nlscLandsectInput.addEventListener('change', () => {
                    mapLayerState.nlscLandsect = nlscLandsectInput.checked;
                    syncMapLayerSwitch(nlscLandsectInput);
                    void applyMapLayerVisibility();
                }, { signal });
            }
            if (urbanPlanInput) {
                urbanPlanInput.addEventListener('change', () => {
                    mapLayerState.urbanPlan = urbanPlanInput.checked;
                    syncMapLayerSwitch(urbanPlanInput);
                    if (!urbanPlanInput.checked) setUrbanPlanMeta('');
                    void applyUrbanPlanLayerVisibility();
                }, { signal });
            }
        }

        function showWorkMapSettingsStatus(message) {
            const statusEl = q(root, 'work-map-settings-status');
            if (!statusEl) return;
            statusEl.textContent = message;
            if (!message) return;
            window.clearTimeout(showWorkMapSettingsStatus._timer);
            showWorkMapSettingsStatus._timer = window.setTimeout(() => {
                statusEl.textContent = '';
            }, 2800);
        }

        function bindWorkMapToolbar() {
            const defaultViewBtn = q(root, 'map-set-default-view');
            const restoreViewBtn = q(root, 'map-restore-default-view');

            if (defaultViewBtn) {
                defaultViewBtn.addEventListener('click', () => {
                    if (!mapInstance) return;
                    const center = mapInstance.getCenter();
                    mapLayerState.defaultView = {
                        center: [center.lng, center.lat],
                        zoom: mapInstance.getZoom(),
                    };
                    persistMapSettings();
                    showWorkMapSettingsStatus('已儲存預設視圖');
                    syncRestoreDefaultViewButton();
                });
            }

            if (restoreViewBtn) {
                restoreViewBtn.addEventListener('click', () => {
                    if (!mapInstance || restoreViewBtn.disabled) return;
                    applyDefaultMapView(mapInstance, { animate: true });
                    showWorkMapSettingsStatus(
                        mapLayerState.defaultView ? '已回到預設視圖' : '已回到預設範圍'
                    );
                });
            }

            syncRestoreDefaultViewButton();
        }

        

        function syncTopRightChartsWidth() {
            const anchor = q(root, 'dash-kpi-right-anchor');
            const notProceeding = q(root, 'dash-kpi-not-proceeding');
            const charts = q(root, 'dash-top-right-charts');
            const column = root.querySelector('.dash-top-right-column');
            if (!anchor || !charts || !column) return;

            const anchorRect = anchor.getBoundingClientRect();
            const rightRect = (notProceeding || anchor).getBoundingClientRect();
            const baseW = Math.max(0, Math.ceil(rightRect.right - anchorRect.left));
            const scaleRaw = getComputedStyle(column).getPropertyValue('--dash-right-block-scale').trim();
            const scale = Number.parseFloat(scaleRaw) || 1.5;
            const w = Math.ceil(baseW * scale);
            const extra = w - baseW;

            column.style.width = `${w}px`;
            column.style.maxWidth = `${w}px`;
            column.style.marginLeft = extra > 0 ? `${-extra}px` : '0';
            charts.style.width = '100%';
            charts.style.maxWidth = '100%';
        }

        function syncTopLeftBodyWidth() {
            const anchor = q(root, 'dash-kpi-left-anchor');
            const unresolved = q(root, 'dash-kpi-unresolved');
            const body = q(root, 'dash-top-left-body');
            const statsMain = q(root, 'dash-top-stats-main');
            const statsRow = root.querySelector('.dash-top-stats-row');
            const todo = root.querySelector('.dash-map-todo-block');
            const column = root.querySelector('.dash-top-left-column');
            if (!anchor || !body) return;

            const anchorRect = anchor.getBoundingClientRect();
            const rightRect = (unresolved || anchor).getBoundingClientRect();
            const pairW = Math.max(0, Math.ceil(rightRect.right - anchorRect.left));

            let totalW = pairW;
            if (statsMain) {
                statsMain.style.width = `${pairW}px`;
                statsMain.style.maxWidth = `${pairW}px`;
                statsMain.style.setProperty('--dash-stats-pair-w', `${pairW}px`);
            }
            if (statsRow && todo) {
                const rowStyle = getComputedStyle(statsRow);
                const rowGap = Number.parseFloat(rowStyle.gap) || Number.parseFloat(rowStyle.columnGap) || 16;
                const todoW = todo.offsetWidth || Number.parseFloat(rowStyle.getPropertyValue('--dash-map-todo-w')) || 148.8;
                totalW = pairW + rowGap + todoW;
            }

            [column, body].forEach((el) => {
                if (!el) return;
                el.style.width = `${Math.ceil(totalW)}px`;
                el.style.maxWidth = `${Math.ceil(totalW)}px`;
            });
        }

        function syncDetailEntryPosition() {
            const entry = root.querySelector('.dash-map-detail-entry');
            const unresolved = q(root, 'dash-kpi-unresolved');
            const proceeding = q(root, 'dash-kpi-proceeding');
            const row = root.querySelector('.dash-kpi-top-row');
            if (!entry || !unresolved || !proceeding || !row) return;

            const u = unresolved.getBoundingClientRect();
            const p = proceeding.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            const centerX = (u.right + p.left) / 2 - r.left;
            entry.style.left = `${Math.round(centerX)}px`;
            entry.style.transform = 'translateX(-50%)';
        }

        function syncTopKpiLayoutWidths() {
            syncTopLeftBodyWidth();
            syncTopRightChartsWidth();
            syncDetailEntryPosition();
            caseStatsCharts.forEach((c) => c.resize());
        }

        function bindTopLeftWidthSync() {
            const anchor = q(root, 'dash-kpi-left-anchor');
            const unresolved = q(root, 'dash-kpi-unresolved');
            if (!anchor || typeof ResizeObserver === 'undefined') return;
            if (ro) ro.disconnect();
            ro = new ResizeObserver(() => {
                syncTopLeftBodyWidth();
                syncTopRightChartsWidth();
                syncDetailEntryPosition();
            });
            ro.observe(anchor);
            if (unresolved) ro.observe(unresolved);
            const statsMain = q(root, 'dash-top-stats-main');
            const todo = root.querySelector('.dash-map-todo-block');
            if (statsMain) ro.observe(statsMain);
            if (todo) ro.observe(todo);
            const rightAnchor = q(root, 'dash-kpi-right-anchor');
            const proceeding = q(root, 'dash-kpi-proceeding');
            const notProceeding = q(root, 'dash-kpi-not-proceeding');
            if (rightAnchor) ro.observe(rightAnchor);
            if (proceeding) ro.observe(proceeding);
            if (notProceeding) ro.observe(notProceeding);
        }

        function initCharts() {
            syncTopKpiLayoutWidths();
            bindTopLeftWidthSync();
            initCaseStatsCharts();
            window.addEventListener('resize', syncTopKpiLayoutWidths);
            window.requestAnimationFrame(() => {
                syncTopKpiLayoutWidths();
                window.requestAnimationFrame(syncTopKpiLayoutWidths);
            });
        }

        /** —— 案件統計圖表（對齊 case-stats-app.jsx）—— */
        const CASE_STATS_LINK = '../JCMS.html?view=caseStats';
        const CHART_PALETTE = ['#111111', '#666666', '#F05A28', '#999999', '#FCA311'];
        const CHART_TYPE_COLORS = Object.freeze({ 士補: '#111111', 士簡: '#666666', 士小: '#F05A28' });
        const CHART_BAR_SLIM = Object.freeze({
            barPercentage: 0.28,
            categoryPercentage: 0.58,
            maxBarThickness: 14,
        });
        const CASE_CHART_LAYOUT = Object.freeze({
            yAxisWidth: 36,
            xAxisHeight: 32,
            padding: { top: 4, right: 6, bottom: 0, left: 0 },
            xTickPadding: 3,
            xMaxTicksLimit: 12,
        });
        const CASE_CHART_MONTHS = 12;

        const MOCK_CASE_STATS = Object.freeze({
            groupLabels: ['士補', '士簡', '士小'],
            settlementRows: [
                { ym: '11310', carryOver: 9, newIntake: 4, closed: 3 },
                { ym: '11311', carryOver: 10, newIntake: 3, closed: 2 },
                { ym: '11312', carryOver: 11, newIntake: 5, closed: 4 },
                { ym: '11401', carryOver: 12, newIntake: 2, closed: 3 },
                { ym: '11402', carryOver: 11, newIntake: 4, closed: 2 },
                { ym: '11403', carryOver: 13, newIntake: 4, closed: 3 },
            ],
            newCaseStats: [
                { ym: '11310', groupLabel: '士補', count: 2 },
                { ym: '11310', groupLabel: '士簡', count: 1 },
                { ym: '11310', groupLabel: '士小', count: 1 },
                { ym: '11311', groupLabel: '士補', count: 1 },
                { ym: '11311', groupLabel: '士簡', count: 2 },
                { ym: '11312', groupLabel: '士補', count: 3 },
                { ym: '11312', groupLabel: '士小', count: 2 },
                { ym: '11401', groupLabel: '士簡', count: 2 },
                { ym: '11402', groupLabel: '士補', count: 2 },
                { ym: '11402', groupLabel: '士簡', count: 1 },
                { ym: '11402', groupLabel: '士小', count: 1 },
                { ym: '11403', groupLabel: '士補', count: 2 },
                { ym: '11403', groupLabel: '士簡', count: 1 },
                { ym: '11403', groupLabel: '士小', count: 1 },
            ],
        });

        function csNormalizeRocMonth5(s) {
            return String(s || '').replace(/\D/g, '').slice(0, 5);
        }

        function csFormatYmLabel(ym) {
            const s = csNormalizeRocMonth5(ym);
            if (s.length !== 5) return s || '—';
            return `${s.slice(0, 3)}/${s.slice(3, 5)}`;
        }

        function csParseCount(raw) {
            const n = parseInt(String(raw || '').replace(/,/g, ''), 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        }

        function csCalcPending(row) {
            return csParseCount(row.carryOver) + csParseCount(row.newIntake) - csParseCount(row.closed);
        }

        function csGetCurrentRocMonth5() {
            const now = new Date();
            const ry = now.getFullYear() - 1911;
            const m = now.getMonth() + 1;
            return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
        }

        function csGetPreviousRocMonth5(ym) {
            const s = csNormalizeRocMonth5(ym);
            if (s.length !== 5) return '';
            let ry = parseInt(s.slice(0, 3), 10);
            let m = parseInt(s.slice(3, 5), 10);
            m -= 1;
            if (m < 1) {
                m = 12;
                ry -= 1;
            }
            if (ry < 0) return '';
            return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
        }

        /** 含當月共 12 個民國年月（由舊到新） */
        function csBuildLast12Months() {
            const months = [];
            let ym = csGetCurrentRocMonth5();
            for (let i = 0; i < CASE_CHART_MONTHS; i += 1) {
                months.unshift(ym);
                const prev = csGetPreviousRocMonth5(ym);
                if (!prev) break;
                ym = prev;
            }
            return months;
        }

        function csBuildAlignedMonths(newCaseStats, settlementRows) {
            return csBuildLast12Months();
        }

        function csGroupChartColor(label, index) {
            if (CHART_TYPE_COLORS[label]) return CHART_TYPE_COLORS[label];
            return CHART_PALETTE[index % CHART_PALETTE.length];
        }

        function csChartAxisOptions() {
            return {
                x: {
                    title: { display: false },
                    ticks: {
                        color: CHART.muted,
                        font: { size: 9, family: 'ui-monospace, monospace' },
                        padding: CASE_CHART_LAYOUT.xTickPadding,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: CASE_CHART_LAYOUT.xMaxTicksLimit,
                    },
                    grid: { color: CHART.grid, drawBorder: false },
                    afterFit(scale) {
                        scale.height = CASE_CHART_LAYOUT.xAxisHeight;
                    },
                },
                y: {
                    beginAtZero: true,
                    title: { display: false },
                    ticks: { color: CHART.muted, font: { size: 9, family: 'ui-monospace, monospace' } },
                    grid: { color: CHART.grid, drawBorder: false },
                    afterFit(scale) {
                        scale.width = CASE_CHART_LAYOUT.yAxisWidth;
                    },
                },
            };
        }

        function destroyCaseStatsCharts() {
            while (caseStatsCharts.length) {
                const c = caseStatsCharts.pop();
                if (c) c.destroy();
            }
        }

        function buildIntakeChartConfig(chartMonths, chartMonthLabels, newCaseStats, groupLabels) {
            if (!chartMonths.length || !groupLabels.length) return null;
            const datasets = groupLabels.map((label, idx) => ({
                label,
                data: chartMonths.map((ym) =>
                    newCaseStats
                        .filter((r) => csNormalizeRocMonth5(r.ym) === ym && r.groupLabel === label)
                        .reduce((sum, r) => sum + r.count, 0)
                ),
                backgroundColor: csGroupChartColor(label, idx),
                borderRadius: 0,
                stack: 'intake',
                ...CHART_BAR_SLIM,
            }));
            const chartBaseOptions = {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { ...CASE_CHART_LAYOUT.padding } },
                plugins: { legend: { display: false } },
            };
            const axis = csChartAxisOptions();
            return {
                type: 'bar',
                data: { labels: chartMonthLabels, datasets },
                options: {
                    ...chartBaseOptions,
                    datasets: { bar: { ...CHART_BAR_SLIM } },
                    scales: {
                        ...axis,
                        x: { ...axis.x, stacked: true },
                        y: { ...axis.y, stacked: true },
                    },
                },
            };
        }

        function buildSettlementChartConfig(chartMonths, chartMonthLabels, settlementRows) {
            if (!chartMonths.length) return null;
            const settlementByYm = new Map();
            for (const r of settlementRows) {
                settlementByYm.set(csNormalizeRocMonth5(r.ym), r);
            }
            const pendingValues = chartMonths.map((ym) => {
                const row = settlementByYm.get(ym);
                return row ? csCalcPending(row) : 0;
            });
            const chartBaseOptions = {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { ...CASE_CHART_LAYOUT.padding } },
                plugins: { legend: { display: false } },
            };
            return {
                type: 'bar',
                data: {
                    labels: chartMonthLabels,
                    datasets: [
                        {
                            type: 'bar',
                            label: '未結',
                            data: pendingValues,
                            backgroundColor: CHART.ink,
                            borderColor: CHART.ink,
                            borderWidth: 0,
                            borderRadius: 0,
                            order: 2,
                            ...CHART_BAR_SLIM,
                        },
                        {
                            type: 'line',
                            label: '新收',
                            data: chartMonths.map((ym) => csParseCount(settlementByYm.get(ym)?.newIntake)),
                            borderColor: CHART.muted,
                            backgroundColor: CHART.muted,
                            borderWidth: 2,
                            pointRadius: 2.5,
                            pointHoverRadius: 3.5,
                            tension: 0.2,
                            fill: false,
                            order: 1,
                        },
                        {
                            type: 'line',
                            label: '已結',
                            data: chartMonths.map((ym) => csParseCount(settlementByYm.get(ym)?.closed)),
                            borderColor: CHART.accent,
                            backgroundColor: CHART.accent,
                            borderWidth: 2,
                            pointRadius: 2.5,
                            pointHoverRadius: 3.5,
                            tension: 0.2,
                            fill: false,
                            order: 0,
                        },
                    ],
                },
                options: {
                    ...chartBaseOptions,
                    datasets: { bar: { ...CHART_BAR_SLIM } },
                    scales: csChartAxisOptions(),
                },
            };
        }

        function renderCaseStatsCharts(data) {
            if (typeof Chart === 'undefined') return;
            destroyCaseStatsCharts();

            const { settlementRows, newCaseStats, groupLabels } = data;
            const chartMonths = csBuildAlignedMonths(newCaseStats, settlementRows);
            const chartMonthLabels = chartMonths.map(csFormatYmLabel);

            const intakeCanvas = q(root, 'chart-intake');
            const settlementCanvas = q(root, 'chart-settlement');
            const intakeCfg = buildIntakeChartConfig(chartMonths, chartMonthLabels, newCaseStats, groupLabels);
            const settlementCfg = buildSettlementChartConfig(chartMonths, chartMonthLabels, settlementRows);
            if (intakeCanvas && intakeCfg) {
                caseStatsCharts.push(new Chart(intakeCanvas, intakeCfg));
            }
            if (settlementCanvas && settlementCfg) {
                caseStatsCharts.push(new Chart(settlementCanvas, settlementCfg));
            }
            syncTopKpiLayoutWidths();
            caseStatsCharts.forEach((c) => c.resize());
        }

        function csNormalizeCaseWord(word) {
            return String(word || '').trim().replace(/\s+/g, '').replace(/年/g, '').replace(/字/g, '');
        }

        function csBuildWordGroupRules(caseWordGroups) {
            return (Array.isArray(caseWordGroups) ? caseWordGroups : [])
                .map((g) => {
                    const name = csNormalizeCaseWord(g?.name || '');
                    const members = Array.isArray(g?.members)
                        ? g.members.map((m) => csNormalizeCaseWord(m)).filter(Boolean)
                        : String(g?.membersText || '').split(/[\s,，、]+/).map(csNormalizeCaseWord).filter(Boolean);
                    return { name, members };
                })
                .filter((g) => g.name);
        }

        function csResolveWordGroupLabel(word, rules) {
            const w = csNormalizeCaseWord(word);
            if (!w) return '其他';
            const hit = rules.find((g) => g.name === w || g.members.includes(w));
            return hit ? hit.name : w;
        }

        function csComputeNewCaseStats(cases, workspaceId, caseWordGroups) {
            const rules = csBuildWordGroupRules(caseWordGroups);
            const ws = String(workspaceId || 'WS_001');
            const map = new Map();
            for (const c of Array.isArray(cases) ? cases : []) {
                if (String(c.workspaceId || 'WS_001') !== ws) continue;
                const digits = String(c?.dates || '').replace(/\D/g, '');
                if (digits.length < 7) continue;
                const ym = digits.slice(0, 5);
                const groupLabel = csResolveWordGroupLabel(c.word, rules);
                const key = `${ym}|${groupLabel}`;
                if (!map.has(key)) map.set(key, { ym, groupLabel, count: 0 });
                map.get(key).count += 1;
            }
            return [...map.values()];
        }

        function csGetOrderedGroupLabels(statsRows, rules) {
            const fromRules = rules.map((r) => r.name);
            const fromData = [...new Set(statsRows.map((r) => r.groupLabel).filter(Boolean))];
            return [...new Set([...fromRules, ...fromData])].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        }

        function csGetApiBase() {
            if (typeof window.jcmsResolveApiBase === 'function') return window.jcmsResolveApiBase();
            if (typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()) {
                const s = window.JCMS_API_BASE.trim().replace(/\/+$/, '');
                return /\/api$/i.test(s) ? s : `${s}/api`;
            }
            return '/api';
        }

        async function loadCaseStatsDashboardData() {
            let settlementRows = [];
            let newCaseStats = [];
            let groupLabels = [...MOCK_CASE_STATS.groupLabels];

            try {
                const raw = localStorage.getItem('jcms_case_stats_v1');
                if (raw) {
                    const blob = JSON.parse(raw);
                    const rows = blob?.byWorkspace?.[workspaceId]?.settlementRows;
                    if (Array.isArray(rows) && rows.length) settlementRows = rows;
                }
            } catch (e) {
                /* 略過 */
            }

            try {
                const base = csGetApiBase();
                const [statsRes, casesRes, settingsRes] = await Promise.all([
                    fetch(`${base}/case-stats`).catch(() => null),
                    fetch(`${base}/cases`).catch(() => null),
                    fetch(`${base}/settings/app`).catch(() => null),
                ]);
                if (statsRes?.ok) {
                    const j = await statsRes.json();
                    const rows = j?.data?.byWorkspace?.[workspaceId]?.settlementRows;
                    if (j?.success && Array.isArray(rows) && rows.length) settlementRows = rows;
                }
                let cases = [];
                let caseWordGroups = MOCK_CASE_STATS.groupLabels.map((name) => ({ name, members: [] }));
                if (casesRes?.ok) {
                    const j = await casesRes.json();
                    if (j?.success && Array.isArray(j.data)) cases = j.data;
                }
                if (settingsRes?.ok) {
                    const j = await settingsRes.json();
                    if (j?.data?.data?.caseWordGroups) caseWordGroups = j.data.data.caseWordGroups;
                }
                if (cases.length) {
                    newCaseStats = csComputeNewCaseStats(cases, workspaceId, caseWordGroups);
                    const rules = csBuildWordGroupRules(caseWordGroups);
                    groupLabels = csGetOrderedGroupLabels(newCaseStats, rules);
                }
            } catch (e) {
                /* 離線預覽 */
            }

            if (!settlementRows.length && !newCaseStats.length) {
                return {
                    settlementRows: [...MOCK_CASE_STATS.settlementRows],
                    newCaseStats: [...MOCK_CASE_STATS.newCaseStats],
                    groupLabels: [...MOCK_CASE_STATS.groupLabels],
                };
            }
            return { settlementRows, newCaseStats, groupLabels };
        }

        function initCaseStatsCharts() {
            renderCaseStatsCharts({
                settlementRows: [...MOCK_CASE_STATS.settlementRows],
                newCaseStats: [...MOCK_CASE_STATS.newCaseStats],
                groupLabels: [...MOCK_CASE_STATS.groupLabels],
            });
            loadCaseStatsDashboardData()
                .then(renderCaseStatsCharts)
                .catch(() => { /* 維持 mock */ });

            window.addEventListener('resize', () => {
                caseStatsCharts.forEach((c) => c.resize());
            });
        }

        function initMap() {
            const mapCanvas = root.querySelector('#dash-map-canvas');
            if (!mapCanvas) {
                console.warn('[dashboard-map] 找不到地圖容器 #dash-map-canvas');
                return;
            }
            if (typeof maplibregl === 'undefined') {
                console.warn('[dashboard-map] MapLibre GL 未載入');
                return;
            }
            if (mapInstance) {
                mapInstance.remove();
                mapInstance = null;
            }

            const initialCenter = mapLayerState.defaultView?.center ?? [121.55, 25.05];
            const initialZoom = mapLayerState.defaultView?.zoom ?? 9.2;

            mapInstance = new maplibregl.Map({
                container: mapCanvas,
                style: MAP_STYLE,
                center: initialCenter,
                zoom: initialZoom,
                minZoom: 7,
                maxZoom: 16,
                attributionControl: true,
            });

            const map = mapInstance;
            let mapReadyStarted = false;
            const startMapReady = () => {
                if (mapReadyStarted || !isMapAlive(map)) return;
                mapReadyStarted = true;
                scheduleTwBoundaryLayers(map, () => isMapAlive(map));
                void onMapReady(map);
            };
            map.once('load', startMapReady);
            if (map.loaded()) {
                startMapReady();
            }
            map.on('load', () => {
                if (isMapAlive(map)) syncCurrentLocationOnMap();
            });

            mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
            bindRestoreDefaultViewSync(mapInstance);
            mountedMapRoot = getRoot();

            resizeHandler = () => {
                if (mapInstance) mapInstance.resize();
            };
            window.addEventListener('resize', resizeHandler);
        }

        bindMapLayerToggles();
        bindWorkMapToolbar();
        if (workMapDocRef) {
            stopWatchWorkMapDoc = watch(workMapDocRef, () => syncWorkMapLayersOnMap(), { deep: true });
        }
        if (agencyLayerDocRef) {
            stopWatchAgencyDoc = watch(agencyLayerDocRef, () => {
                policeApi?.invalidatePoliceGeoJsonCache?.();
                judicialApi?.invalidateJudicialGeoJsonCache?.();
                void applyPoliceLayerVisibility().then(() => syncCurrentLocationOnMap());
                void applyJudicialLayerVisibility().then(() => syncCurrentLocationOnMap());
            }, { deep: true });
        }
        if (currentLocationRef) {
            stopWatchCurrentLocation = watch(currentLocationRef, () => {
                syncCurrentLocationOnMap();
                persistMapSettings();
            }, { deep: true });
        }
        initMap();
        syncTopKpiLayoutWidthsFn = syncTopKpiLayoutWidths;
        layoutResizeHandler = () => {
            try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
        };
        window.addEventListener('resize', layoutResizeHandler);
        bindTopLeftWidthSync();
        initCaseStatsCharts();
        window.requestAnimationFrame(() => {
            try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
            window.requestAnimationFrame(() => {
                try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
                if (mapInstance) mapInstance.resize();
            });
        });
    }

    watch(
        [isActiveRef, rootRef],
        ([active, root]) => {
            teardown();
            disposed = false;
            if (active && root) {
                nextTick(boot);
            }
        },
        { immediate: true, flush: 'post' }
    );

    onUnmounted(teardown);

    return {
        resizeMap: () => {
            if (!mapInstance) return;
            mapInstance.resize();
            scheduleTwBoundaryLayers(mapInstance, () => !disposed && mapInstance);
        },
        syncLayout: () => { try { syncTopKpiLayoutWidthsFn?.(); } catch (_) { /* ignore */ } },
        getView: () => {
            if (!mapInstance) return null;
            const c = mapInstance.getCenter();
            return { center: [c.lng, c.lat], zoom: mapInstance.getZoom() };
        },
        syncCurrentLocation: syncCurrentLocationOnMap,
    };
}
