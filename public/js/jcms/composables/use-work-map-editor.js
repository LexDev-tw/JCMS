/** 工作地圖編輯頁：MapLibre + 繪製互動 */
import { watch, onUnmounted, nextTick } from '../vue-api.js';
import {
    createJcmsMapStyle,
    loadTaiwanAdminBoundaries,
    ensureAdminLabelLayer,
    normalizeDefaultView,
    applyDefaultMapView,
} from '../lib/map-jcms-bootstrap.js';
import {
    syncWorkMapDocLayers,
    syncWorkMapDraftLayer,
    clearWorkMapDraftLayer,
    syncWorkMapSelectionLayer,
    syncWorkMapVertexLayer,
    queryWorkMapFeatureAt,
} from '../lib/work-map-maplibre.js';
import {
    syncAgencyEditLayer,
    clearAgencyEditLayer,
    queryAgencyFeatureAt,
} from '../lib/agency-layer-maplibre.js';
import { AGENCY_LAYER_KINDS } from '../lib/agency-layer-model.js';

export function useWorkMapEditor({
    rootRef,
    isActiveRef,
    workMapDocRef,
    workMapUiRef,
    getInitialView,
    getEditTarget,
    getAgencyFeatures,
    getAgencySelectedId,
    getCurrentLocation,
    onMapClick,
    onMapDblClick,
    onMapMouseMove,
    onMapMouseDown,
    onMapMouseUp,
    getSelectedFeature,
    getToolMode,
}) {
    let disposed = false;
    let mapInstance = null;
    let resizeHandler = null;
    let stopWatchDoc = null;
    let stopWatchDraft = null;
    let stopWatchSelection = null;
    let stopWatchFeatureEditor = null;
    let stopWatchVertices = null;
    let stopWatchToolMode = null;
    let stopWatchAgency = null;

    function getRoot() {
        return rootRef.value;
    }

    function teardown() {
        disposed = true;
        if (stopWatchDoc) {
            stopWatchDoc();
            stopWatchDoc = null;
        }
        if (stopWatchDraft) {
            stopWatchDraft();
            stopWatchDraft = null;
        }
        if (stopWatchSelection) {
            stopWatchSelection();
            stopWatchSelection = null;
        }
        if (stopWatchFeatureEditor) {
            stopWatchFeatureEditor();
            stopWatchFeatureEditor = null;
        }
        if (stopWatchVertices) {
            stopWatchVertices();
            stopWatchVertices = null;
        }
        if (stopWatchToolMode) {
            stopWatchToolMode();
            stopWatchToolMode = null;
        }
        if (stopWatchAgency) {
            stopWatchAgency();
            stopWatchAgency = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
    }

    function getUi() {
        const raw = workMapUiRef;
        return raw?.value ?? raw ?? {};
    }

    function syncDraft() {
        if (!mapInstance) return;
        const ui = getUi();
        const drawMode =
            ui.toolMode === 'line' || ui.toolMode === 'polygon' ? ui.toolMode : ui.toolMode;
        syncWorkMapDraftLayer(
            mapInstance,
            ui.draftCoords || [],
            drawMode,
            ui.draftCursor || null
        );
    }

    function syncVertices() {
        if (!mapInstance) return;
        const feat = typeof getSelectedFeature === 'function' ? getSelectedFeature() : null;
        const toolMode =
            typeof getToolMode === 'function' ? getToolMode() : getUi().toolMode;
        syncWorkMapVertexLayer(mapInstance, feat, toolMode);
    }

    function applyMapCursor() {
        const canvas = getRoot()?.querySelector('#work-map-edit-canvas');
        if (!canvas) return;
        const mode = typeof getToolMode === 'function' ? getToolMode() : getUi().toolMode;
        const cursor =
            mode === 'point' || mode === 'line' || mode === 'polygon'
                ? 'crosshair'
                : mode === 'select'
                    ? 'default'
                    : '';
        canvas.style.cursor = cursor;
    }

    function getWorkMapDoc() {
        const raw = workMapDocRef;
        return raw?.value ?? raw ?? null;
    }

    function getTarget() {
        return typeof getEditTarget === 'function' ? getEditTarget() : 'custom';
    }

    function syncAgencyLayers() {
        if (!mapInstance) return;
        const target = getTarget();
        if (target === AGENCY_LAYER_KINDS.judicial || target === AGENCY_LAYER_KINDS.police) {
            const features = typeof getAgencyFeatures === 'function' ? getAgencyFeatures() : [];
            const selectedId = typeof getAgencySelectedId === 'function' ? getAgencySelectedId() : null;
            syncAgencyEditLayer(mapInstance, target, features, selectedId);
            clearWorkMapDraftLayer(mapInstance);
            syncWorkMapSelectionLayer(mapInstance, null);
            syncWorkMapVertexLayer(mapInstance, null, null);
            return;
        }
        clearAgencyEditLayer(mapInstance);
    }

    function syncCurrentLocationMarker() {
        if (!mapInstance || typeof globalThis.DashboardMapCurrentLocation === 'undefined') return;
        const loc = typeof getCurrentLocation === 'function' ? getCurrentLocation() : null;
        const api = globalThis.DashboardMapCurrentLocation.createCurrentLocationApi({
            mapColors: { surface: '#FFFFFF', ink900: '#111111' },
        });
        api.syncCurrentLocation(mapInstance, loc);
    }

    function syncOverlayLayers() {
        syncAgencyLayers();
        syncCurrentLocationMarker();
    }

    function syncDocLayers() {
        if (!mapInstance) return;
        const target = getTarget();
        if (target !== 'custom') {
            syncWorkMapDocLayers(mapInstance, { version: 1, lists: [] });
            syncOverlayLayers();
            return;
        }
        const doc = getWorkMapDoc();
        if (!doc) return;
        syncWorkMapDocLayers(mapInstance, doc);
        syncOverlayLayers();
    }

    function syncSelection() {
        if (!mapInstance) return;
        const feat = typeof getSelectedFeature === 'function' ? getSelectedFeature() : null;
        syncWorkMapSelectionLayer(mapInstance, feat);
    }

    function boot() {
        const root = getRoot();
        if (!root || !isActiveRef.value || disposed) return;
        const canvas = root.querySelector('#work-map-edit-canvas');
        if (!canvas) {
            console.warn('[work-map-edit] 找不到 #work-map-edit-canvas');
            return;
        }
        if (typeof maplibregl === 'undefined') {
            console.warn('[work-map-edit] MapLibre GL 未載入');
            return;
        }

        const initial = normalizeDefaultView(
            typeof getInitialView === 'function' ? getInitialView() : null
        );
        const center = initial?.center ?? [121.55, 25.05];
        const zoom = initial?.zoom ?? 9.2;

        mapInstance = new maplibregl.Map({
            container: canvas,
            style: createJcmsMapStyle(),
            center,
            zoom,
            minZoom: 7,
            maxZoom: 16,
            attributionControl: true,
            doubleClickZoom: false,
        });

        mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

        mapInstance.on('load', async () => {
            try {
                await loadTaiwanAdminBoundaries(mapInstance);
            } catch (err) {
                console.warn('[work-map-edit] 鄉鎮市區界載入失敗', err);
            }
            ensureAdminLabelLayer(mapInstance);
            if (typeof globalThis.DashboardMapNlsc !== 'undefined') {
                try {
                    const raw = localStorage.getItem('jcms.dashboard-map.settings');
                    const persisted = raw ? JSON.parse(raw) : null;
                    globalThis.DashboardMapNlsc.applyNlscLayerVisibility(mapInstance, {
                        nlscOrthophoto: Boolean(persisted?.nlscOrthophoto),
                        nlscLandsect: Boolean(persisted?.nlscLandsect),
                    });
                } catch (err) {
                    console.warn('[work-map-edit] 國測圖層設定載入失敗', err);
                }
            }
            syncDocLayers();
            syncDraft();
            syncSelection();
            syncVertices();
            applyMapCursor();
            mapInstance.resize();
        });

        mapInstance.on('mousedown', (e) => {
            if (typeof onMapMouseDown !== 'function') return;
            const ui = getUi();
            const target = getTarget();
            let hit = null;
            if (target === AGENCY_LAYER_KINDS.judicial || target === AGENCY_LAYER_KINDS.police) {
                hit = queryAgencyFeatureAt(mapInstance, e.point);
            } else {
                hit = queryWorkMapFeatureAt(
                    mapInstance,
                    e.point,
                    ui.activeListId
                );
            }
            onMapMouseDown([e.lngLat.lng, e.lngLat.lat], {
                point: e.point,
                hit,
            });
        });

        mapInstance.on('mouseup', () => {
            if (typeof onMapMouseUp === 'function') {
                onMapMouseUp();
            }
        });

        mapInstance.on('click', (e) => {
            if (typeof onMapClick !== 'function') return;
            const ui = getUi();
            const target = getTarget();
            let hit = null;
            if (target === AGENCY_LAYER_KINDS.judicial || target === AGENCY_LAYER_KINDS.police) {
                hit = queryAgencyFeatureAt(mapInstance, e.point);
            } else {
                hit = queryWorkMapFeatureAt(
                    mapInstance,
                    e.point,
                    ui.activeListId
                );
            }
            onMapClick([e.lngLat.lng, e.lngLat.lat], {
                point: e.point,
                hit,
            });
        });

        mapInstance.on('dblclick', (e) => {
            e.preventDefault();
            if (typeof onMapDblClick === 'function') {
                onMapDblClick([e.lngLat.lng, e.lngLat.lat]);
            }
        });

        mapInstance.on('mousemove', (e) => {
            if (typeof onMapMouseMove === 'function') {
                onMapMouseMove([e.lngLat.lng, e.lngLat.lat], e.point);
            }
        });

        resizeHandler = () => {
            if (mapInstance) mapInstance.resize();
        };
        window.addEventListener('resize', resizeHandler);

        stopWatchDoc = watch(
            workMapDocRef,
            () => syncDocLayers(),
            { deep: true }
        );
        stopWatchDraft = watch(
            () => {
                const ui = getUi();
                return [ui.draftCoords, ui.toolMode, ui.draftCursor];
            },
            () => syncDraft(),
            { deep: true }
        );
        stopWatchSelection = watch(
            () => getUi().selectedFeatureId,
            () => {
                syncSelection();
                syncVertices();
            }
        );
        stopWatchFeatureEditor = watch(
            () => {
                const feat = typeof getSelectedFeature === 'function' ? getSelectedFeature() : null;
                return feat ? [feat.color, feat.title, feat.coordinates] : null;
            },
            () => {
                syncSelection();
                syncVertices();
            },
            { deep: true }
        );
        stopWatchVertices = watch(
            () => getUi().toolMode,
            () => syncVertices()
        );
        stopWatchToolMode = watch(
            () => getUi().toolMode,
            () => applyMapCursor()
        );
        stopWatchAgency = watch(
            () => [
                getTarget(),
                typeof getAgencyFeatures === 'function' ? getAgencyFeatures() : null,
                typeof getAgencySelectedId === 'function' ? getAgencySelectedId() : null,
                typeof getCurrentLocation === 'function' ? getCurrentLocation() : null,
            ],
            () => syncOverlayLayers(),
            { deep: true }
        );
    }

    watch(
        () => ({ active: isActiveRef.value, root: rootRef.value }),
        ({ active, root }) => {
            teardown();
            disposed = false;
            if (active && root) nextTick(boot);
        },
        { immediate: true, flush: 'post' }
    );

    onUnmounted(teardown);

    function getView() {
        if (!mapInstance) return null;
        const c = mapInstance.getCenter();
        return {
            center: [c.lng, c.lat],
            zoom: mapInstance.getZoom(),
        };
    }

    function jumpToView(view, { animate = false } = {}) {
        if (!mapInstance) return;
        applyDefaultMapView(mapInstance, normalizeDefaultView(view), { animate });
    }

    function projectLngLat(lngLat) {
        if (!mapInstance) return null;
        return mapInstance.project(lngLat);
    }

    return {
        getView,
        jumpToView,
        projectLngLat,
        getMap: () => mapInstance,
        setDragPanEnabled: (enabled) => {
            if (!mapInstance) return;
            if (enabled) mapInstance.dragPan.enable();
            else mapInstance.dragPan.disable();
        },
        resizeMap: () => {
            if (mapInstance) mapInstance.resize();
        },
        clearDraftOnMap: () => {
            if (mapInstance) clearWorkMapDraftLayer(mapInstance);
        },
        syncSelectionOnMap: syncSelection,
        syncVerticesOnMap: syncVertices,
        syncOverlayLayers,
    };
}
