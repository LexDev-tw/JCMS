/** 地圖總覽：水利署水庫水情（preview / composable 共用） */
(function (global) {
    const SOURCE_ID = 'wra-reservoirs';

    const WATER_BLUE = '#38BDF8';
    const WATER_BLUE_DEEP = '#0369A1';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatVolumeWanM3(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        return `${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} 萬m³`;
    }

    function formatWaterLevel(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '—';
        return `${n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} m`;
    }

    function formatPercentLabel(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return `${Math.round(n)}%`;
    }

    function formatMonitorMeta(data) {
        if (!data) return '';
        const count = data.reservoirCount || (Array.isArray(data.reservoirs) ? data.reservoirs.length : 0);
        const time = data.observationTime ? ` · ${data.observationTime}` : '';
        return `${data.sourceAgency || '經濟部水利署'}${time} · ${count} 座`;
    }

    function baseCircleRadius(capacity) {
        const c = Number(capacity);
        if (!Number.isFinite(c) || c <= 0) return 10;
        if (c >= 30000) return 28;
        if (c >= 10000) return 22;
        if (c >= 3000) return 16;
        if (c >= 500) return 12;
        return 9;
    }

    function coordKey(lng, lat) {
        return `${lng.toFixed(3)}|${lat.toFixed(3)}`;
    }

    function fillColorForPercent(pct) {
        if (!Number.isFinite(pct)) return '#94A3B8';
        if (pct >= 90) return WATER_BLUE_DEEP;
        if (pct >= 60) return WATER_BLUE;
        if (pct >= 30) return '#60A5FA';
        return '#BAE6FD';
    }

    function buildGeoJson(reservoirs) {
        const features = (Array.isArray(reservoirs) ? reservoirs : [])
            .filter((r) => Number.isFinite(r.lng) && Number.isFinite(r.lat))
            .map((r) => {
                const pct = Number(r.storagePercent);
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [r.lng, r.lat],
                    },
                    properties: {
                        reservoirId: r.reservoirId,
                        name: r.name,
                        effectiveCapacity: r.effectiveCapacity ?? 0,
                        effectiveStorage: r.effectiveStorage,
                        storagePercent: r.storagePercent,
                        waterLevel: r.waterLevel,
                        observationTime: r.observationTime,
                        label: formatPercentLabel(r.storagePercent),
                        circleRadius: baseCircleRadius(r.effectiveCapacity),
                        fillColor: fillColorForPercent(pct),
                    },
                };
            });

        const primaryByCoord = new Map();
        features.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;
            const key = coordKey(lng, lat);
            const prev = primaryByCoord.get(key);
            if (
                !prev
                || (feature.properties.effectiveCapacity || 0) > (prev.properties.effectiveCapacity || 0)
            ) {
                primaryByCoord.set(key, feature);
            }
        });
        features.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;
            const key = coordKey(lng, lat);
            feature.properties.showLabel = primaryByCoord.get(key) === feature;
        });

        features.sort((a, b) => (a.properties.effectiveCapacity || 0) - (b.properties.effectiveCapacity || 0));
        return { type: 'FeatureCollection', features };
    }

    function popupHtml(props) {
        const name = escapeHtml(props?.name || '—');
        const capacity = formatVolumeWanM3(props?.effectiveCapacity);
        const storage = formatVolumeWanM3(props?.effectiveStorage);
        const level = formatWaterLevel(props?.waterLevel);
        const time = escapeHtml(props?.observationTime || '—');
        const row = (text) => `<p style="font-family:ui-monospace,monospace;font-size:9px;color:#444;margin:0;line-height:1.25">${text}</p>`;
        return [
            `<p style="font-size:11px;font-weight:700;color:#111;margin:0 0 2px;line-height:1.25">${name}</p>`,
            row(`庫容量：${capacity}`),
            row(`蓄水量：${storage}`),
            row(`水位高度：${level}`),
            `<p style="font-family:ui-monospace,monospace;font-size:9px;color:#666;margin:0;line-height:1.25">時間：${time}</p>`,
        ].join('');
    }

    function createWaterReservoirLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        setWaterReservoirMeta,
        getApiBase,
        layerStateKey = 'waterReservoir',
    }) {
        let hoverPopup = null;
        let hoverPopupActive = false;
        const boundLayers = new Set();
        let enterHandler = null;
        let moveHandler = null;
        let leaveHandler = null;

        function isLayerActive() {
            const state = getMapLayerState();
            return Boolean(state?.[layerStateKey]);
        }

        function circleRadiusPaint() {
            return [
                'interpolate', ['linear'], ['zoom'],
                7, ['max', 5, ['*', ['to-number', ['get', 'circleRadius']], 0.5]],
                9, ['max', 7, ['*', ['to-number', ['get', 'circleRadius']], 0.68]],
                11, ['to-number', ['get', 'circleRadius']],
                13, ['*', ['to-number', ['get', 'circleRadius']], 1.1],
            ];
        }

        function syncCirclePaint(map) {
            if (!map.getLayer(layerIds.waterReservoirCircle)) return;
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-radius', circleRadiusPaint());
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-color', ['get', 'fillColor']);
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-opacity', 0.86);
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-blur', 0.12);
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-stroke-width', 0);
        }

        function ensureLayers(map) {
            if (!map.isStyleLoaded()) {
                throw new Error('map style not loaded');
            }

            if (!map.getSource(SOURCE_ID)) {
                map.addSource(SOURCE_ID, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                });
            }

            if (!map.getLayer(layerIds.waterReservoirCircle)) {
                map.addLayer({
                    id: layerIds.waterReservoirCircle,
                    type: 'circle',
                    source: SOURCE_ID,
                    layout: { visibility: 'none' },
                    paint: {
                        'circle-radius': circleRadiusPaint(),
                        'circle-color': ['get', 'fillColor'],
                        'circle-opacity': 0.86,
                        'circle-blur': 0.12,
                        'circle-stroke-width': 0,
                    },
                });
            } else {
                syncCirclePaint(map);
            }

            if (!map.getLayer(layerIds.waterReservoirLabel)) {
                map.addLayer({
                    id: layerIds.waterReservoirLabel,
                    type: 'symbol',
                    source: SOURCE_ID,
                    minzoom: 7,
                    filter: ['all', ['has', 'label'], ['==', ['get', 'showLabel'], true]],
                    layout: {
                        visibility: 'none',
                        'text-field': ['get', 'label'],
                        'text-font': ['Noto Sans Regular'],
                        'text-size': [
                            'interpolate', ['linear'], ['zoom'],
                            7, 8,
                            10, 9,
                            13, 10,
                        ],
                        'text-anchor': 'center',
                        'text-allow-overlap': true,
                        'text-ignore-placement': true,
                    },
                    paint: {
                        'text-color': '#FFFFFF',
                        'text-halo-color': 'rgba(3, 105, 161, 0.45)',
                        'text-halo-width': 0.6,
                    },
                });
            }
        }

        function raiseLayers(map) {
            [layerIds.waterReservoirCircle, layerIds.waterReservoirLabel].forEach((layerId) => {
                if (!map.getLayer(layerId)) return;
                try {
                    map.moveLayer(layerId);
                } catch (_) {
                    /* already on top */
                }
            });
        }

        function bindHoverPopup(map) {
            if (!enterHandler) {
                hoverPopup = new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    maxWidth: 'none',
                    className: 'dash-map-water-popup',
                    offset: 8,
                });

                enterHandler = (e) => {
                    if (!isLayerActive()) return;
                    const feature = e.features && e.features[0];
                    if (!feature) return;
                    map.getCanvas().style.cursor = 'pointer';
                    hoverPopupActive = true;
                    hoverPopup
                        .setLngLat(feature.geometry.coordinates)
                        .setHTML(popupHtml(feature.properties))
                        .addTo(map);
                };

                moveHandler = (e) => {
                    if (!isLayerActive() || !hoverPopupActive) return;
                    const feature = e.features && e.features[0];
                    if (!feature) return;
                    hoverPopup.setLngLat(feature.geometry.coordinates);
                };

                leaveHandler = () => {
                    map.getCanvas().style.cursor = '';
                    hoverPopupActive = false;
                    hoverPopup.remove();
                };
            }

            [layerIds.waterReservoirCircle, layerIds.waterReservoirLabel].forEach((layerId) => {
                if (!map.getLayer(layerId) || boundLayers.has(layerId)) return;
                boundLayers.add(layerId);
                map.on('mouseenter', layerId, enterHandler);
                map.on('mousemove', layerId, moveHandler);
                map.on('mouseleave', layerId, leaveHandler);
            });
        }

        function applyVisibility(map) {
            const visible = isLayerActive() ? 'visible' : 'none';
            if (map.getLayer(layerIds.waterReservoirCircle)) {
                map.setLayoutProperty(layerIds.waterReservoirCircle, 'visibility', visible);
            }
            if (map.getLayer(layerIds.waterReservoirLabel)) {
                map.setLayoutProperty(layerIds.waterReservoirLabel, 'visibility', visible);
            }
            if (visible === 'none' && hoverPopup) {
                hoverPopupActive = false;
                hoverPopup.remove();
            }
        }

        async function fetchMapPayload() {
            const base = typeof getApiBase === 'function' ? getApiBase() : '/api';
            const urls = [
                `${base}/water-reservoir/map`,
                '/api/water-reservoir/map',
                'data/wra-reservoir-map-snapshot.json',
            ];
            let lastErr = null;
            for (const url of urls) {
                try {
                    const res = await fetch(url, { headers: { Accept: 'application/json' } });
                    if (!res.ok) {
                        lastErr = new Error(`water-reservoir HTTP ${res.status} @ ${url}`);
                        continue;
                    }
                    const payload = await res.json();
                    if (!payload?.reservoirs?.length) {
                        lastErr = new Error(`water-reservoir empty @ ${url}`);
                        continue;
                    }
                    return payload;
                } catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr || new Error('water-reservoir fetch failed');
        }

        async function refreshWaterReservoirLayers(map) {
            if (!isLayerActive()) {
                applyVisibility(map);
                if (typeof setWaterReservoirMeta === 'function') setWaterReservoirMeta('');
                return;
            }

            try {
                const payload = await fetchMapPayload();
                if (!map.isStyleLoaded()) {
                    await new Promise((resolve) => {
                        if (map.isStyleLoaded()) return resolve();
                        map.once('load', resolve);
                    });
                }
                ensureLayers(map);
                bindHoverPopup(map);
                map.getSource(SOURCE_ID).setData(buildGeoJson(payload.reservoirs));
                raiseLayers(map);
                applyVisibility(map);
                if (typeof setWaterReservoirMeta === 'function') {
                    setWaterReservoirMeta(formatMonitorMeta(payload));
                }
            } catch (err) {
                console.warn('[dashboard-map] 水庫水情載入失敗', err);
                applyVisibility(map);
                if (typeof setWaterReservoirMeta === 'function') {
                    const detail = err?.message ? `（${err.message}）` : '';
                    setWaterReservoirMeta(`水庫水情載入失敗${detail}`);
                }
            }
        }

        function scheduleWaterReservoirRefresh(map, getActive) {
            if (scheduleWaterReservoirRefresh._timer) {
                global.clearInterval(scheduleWaterReservoirRefresh._timer);
            }
            scheduleWaterReservoirRefresh._timer = null;
            if (!getActive()) return;
            scheduleWaterReservoirRefresh._timer = global.setInterval(() => {
                if (!getActive()) return;
                refreshWaterReservoirLayers(map).catch(() => { /* ignore */ });
            }, 15 * 60 * 1000);
        }

        function teardownWaterReservoirRefresh() {
            if (scheduleWaterReservoirRefresh._timer) {
                global.clearInterval(scheduleWaterReservoirRefresh._timer);
                scheduleWaterReservoirRefresh._timer = null;
            }
        }

        return {
            ensureLayers,
            refreshWaterReservoirLayers,
            scheduleWaterReservoirRefresh,
            teardownWaterReservoirRefresh,
            formatMonitorMeta,
            buildGeoJson,
            popupHtml,
        };
    }

    global.DashboardMapWaterReservoir = {
        createWaterReservoirLayersApi,
        SOURCE_ID,
    };
}(typeof window !== 'undefined' ? window : globalThis));
