/** 地圖總覽：水利署水庫水情（preview / composable 共用） */
(function (global) {
    const SOURCE_ID = 'wra-reservoirs';
    const SUPPLY_SOURCE_ID = 'wra-reservoir-supply-towns';
    const SUPPLY_DISTRICTS_URL = 'data/wra-supply-districts.json';

    const WATER_BLUE = '#38BDF8';
    const WATER_BLUE_DEEP = '#0369A1';
    const SUPPLY_HIGHLIGHT = '#0284C7';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeAreaText(text) {
        return String(text || '')
            .replace(/\u3000/g, '')
            .replace(/臺/g, '台')
            .replace(/巿/g, '市')
            .replace(/\s+/g, '')
            .trim();
    }

    function districtMatches(townName, districtName) {
        const town = normalizeAreaText(townName);
        const district = normalizeAreaText(districtName);
        if (!town || !district) return false;
        if (town === district) return true;
        const townBase = town.replace(/(區|鄉|鎮|市)$/, '');
        const districtBase = district.replace(/(區|鄉|鎮|市)$/, '');
        return townBase === districtBase;
    }

    function townMatchesRule(props, rule) {
        if (!props || !rule) return false;
        const county = normalizeAreaText(props.COUNTYNAME);
        const ruleCounty = normalizeAreaText(rule.county);
        if (!county || county !== ruleCounty) return false;
        if (rule.wholeCounty) return true;
        const towns = Array.isArray(rule.towns) ? rule.towns : [];
        return towns.some((town) => districtMatches(props.TOWNNAME, town));
    }

    function townInDistrictRules(props, rules) {
        if (!Array.isArray(rules) || !rules.length) return false;
        return rules.some((rule) => townMatchesRule(props, rule));
    }

    function buildSupplyDistrictGeoJson(twTownsGeoJson, districtDefs, districtIds) {
        if (!twTownsGeoJson?.features?.length || !districtDefs || !districtIds?.length) {
            return { type: 'FeatureCollection', features: [] };
        }

        const mergedRules = [];
        const labels = [];
        districtIds.forEach((id) => {
            const def = districtDefs[id];
            if (!def) return;
            if (def.label) labels.push(def.label);
            if (Array.isArray(def.rules)) mergedRules.push(...def.rules);
        });
        if (!mergedRules.length) {
            return { type: 'FeatureCollection', features: [], labels };
        }

        const seen = new Set();
        const features = [];
        twTownsGeoJson.features.forEach((feature) => {
            if (!townInDistrictRules(feature.properties, mergedRules)) return;
            const key = `${normalizeAreaText(feature.properties?.COUNTYNAME)}|${normalizeAreaText(feature.properties?.TOWNNAME)}`;
            if (seen.has(key)) return;
            seen.add(key);
            features.push(feature);
        });

        return { type: 'FeatureCollection', features, labels };
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
        return `${data.sourceAgency || '經濟部水利署'}${time} · ${count} 座 · 點擊水庫顯示供水區`;
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

    function popupHtml(props, supplyLabels) {
        const name = escapeHtml(props?.name || '—');
        const capacity = formatVolumeWanM3(props?.effectiveCapacity);
        const storage = formatVolumeWanM3(props?.effectiveStorage);
        const level = formatWaterLevel(props?.waterLevel);
        const time = escapeHtml(props?.observationTime || '—');
        const row = (text) => `<p style="font-family:ui-monospace,monospace;font-size:9px;color:#444;margin:0;line-height:1.25">${text}</p>`;
        const supplyLine = Array.isArray(supplyLabels) && supplyLabels.length
            ? `<p style="font-size:10px;color:#0369A1;margin:4px 0 0;line-height:1.35">供水區：${supplyLabels.map(escapeHtml).join('、')}</p>`
            : '';
        return [
            `<p style="font-size:11px;font-weight:700;color:#111;margin:0 0 2px;line-height:1.25">${name}</p>`,
            row(`庫容量：${capacity}`),
            row(`蓄水量：${storage}`),
            row(`水位高度：${level}`),
            `<p style="font-family:ui-monospace,monospace;font-size:9px;color:#666;margin:0;line-height:1.25">時間：${time}</p>`,
            supplyLine,
        ].join('');
    }

    function createWaterReservoirLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        setWaterReservoirMeta,
        getApiBase,
        getTwTownsGeoJson,
        ensureTwTownsGeoJson,
        layerStateKey = 'waterReservoir',
    }) {
        let hoverPopup = null;
        let hoverPopupActive = false;
        const boundLayers = new Set();
        let enterHandler = null;
        let moveHandler = null;
        let leaveHandler = null;
        let clickHandler = null;
        let mapClickHandler = null;
        let interactionsBound = false;
        let selectedReservoirKey = null;
        let selectedSupplyLabels = [];
        let supplyDistrictsCache = null;
        let supplyDistrictsPromise = null;

        function isLayerActive() {
            const state = getMapLayerState();
            return Boolean(state?.[layerStateKey]);
        }

        async function loadSupplyDistricts() {
            if (supplyDistrictsCache) return supplyDistrictsCache;
            if (!supplyDistrictsPromise) {
                supplyDistrictsPromise = fetch(SUPPLY_DISTRICTS_URL, {
                    headers: { Accept: 'application/json' },
                })
                    .then((res) => {
                        if (!res.ok) throw new Error(`supply-districts HTTP ${res.status}`);
                        return res.json();
                    })
                    .then((data) => {
                        supplyDistrictsCache = data;
                        return data;
                    })
                    .catch((err) => {
                        supplyDistrictsPromise = null;
                        throw err;
                    });
            }
            return supplyDistrictsPromise;
        }

        function resolveSupplyDistrictIds(config, reservoirName) {
            if (!config?.reservoirs || !reservoirName) return [];
            const direct = config.reservoirs[reservoirName];
            if (Array.isArray(direct) && direct.length) return direct;
            const normalized = normalizeAreaText(reservoirName);
            for (const [key, ids] of Object.entries(config.reservoirs)) {
                if (normalizeAreaText(key) === normalized) return ids;
            }
            return [];
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
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-stroke-color', [
                'case',
                ['==', ['get', 'reservoirId'], selectedReservoirKey || ''],
                mapColors?.ink900 || '#111111',
                'rgba(255,255,255,0.55)',
            ]);
            map.setPaintProperty(layerIds.waterReservoirCircle, 'circle-stroke-width', [
                'case',
                ['==', ['get', 'reservoirId'], selectedReservoirKey || ''],
                2.4,
                0,
            ]);
        }

        function ensureSupplyLayers(map) {
            if (map.getSource(SUPPLY_SOURCE_ID)) return;

            map.addSource(SUPPLY_SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: layerIds.waterReservoirSupplyFill,
                type: 'fill',
                source: SUPPLY_SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'fill-color': SUPPLY_HIGHLIGHT,
                    'fill-opacity': 0.16,
                },
            });

            map.addLayer({
                id: layerIds.waterReservoirSupplyLine,
                type: 'line',
                source: SUPPLY_SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'line-color': SUPPLY_HIGHLIGHT,
                    'line-opacity': 0.42,
                    'line-width': 1.1,
                },
            });
        }

        function setSupplyHighlightVisibility(map, visible) {
            const layout = visible ? 'visible' : 'none';
            if (map.getLayer(layerIds.waterReservoirSupplyFill)) {
                map.setLayoutProperty(layerIds.waterReservoirSupplyFill, 'visibility', layout);
            }
            if (map.getLayer(layerIds.waterReservoirSupplyLine)) {
                map.setLayoutProperty(layerIds.waterReservoirSupplyLine, 'visibility', layout);
            }
        }

        function clearSupplyHighlight(map) {
            selectedReservoirKey = null;
            selectedSupplyLabels = [];
            if (map?.getSource(SUPPLY_SOURCE_ID)) {
                map.getSource(SUPPLY_SOURCE_ID).setData({
                    type: 'FeatureCollection',
                    features: [],
                });
            }
            if (map) {
                setSupplyHighlightVisibility(map, false);
                syncCirclePaint(map);
            }
        }

        async function setSupplyHighlight(map, reservoirId, reservoirName) {
            let twTownsGeoJson = typeof getTwTownsGeoJson === 'function' ? getTwTownsGeoJson() : null;
            if (!twTownsGeoJson && typeof ensureTwTownsGeoJson === 'function') {
                twTownsGeoJson = await ensureTwTownsGeoJson();
            }
            if (!twTownsGeoJson) {
                console.warn('[dashboard-map] 鄉鎮界線尚未載入，無法顯示供水區');
                if (typeof setWaterReservoirMeta === 'function') {
                    setWaterReservoirMeta('鄉鎮界線載入中，請稍後再點選');
                }
                return;
            }

            let config;
            try {
                config = await loadSupplyDistricts();
            } catch (err) {
                console.warn('[dashboard-map] 供水區對照載入失敗', err);
                if (typeof setWaterReservoirMeta === 'function') {
                    setWaterReservoirMeta('供水區對照資料載入失敗');
                }
                return;
            }

            const districtIds = resolveSupplyDistrictIds(config, reservoirName);
            ensureSupplyLayers(map);
            const data = buildSupplyDistrictGeoJson(twTownsGeoJson, config.districts, districtIds);
            map.getSource(SUPPLY_SOURCE_ID).setData({
                type: 'FeatureCollection',
                features: data.features,
            });
            selectedReservoirKey = reservoirId || null;
            selectedSupplyLabels = data.labels || [];
            setSupplyHighlightVisibility(map, data.features.length > 0);
            syncCirclePaint(map);
            raiseLayers(map);

            if (typeof setWaterReservoirMeta === 'function') {
                if (selectedSupplyLabels.length) {
                    setWaterReservoirMeta(`供水區：${selectedSupplyLabels.join('、')}`);
                } else if (!districtIds.length) {
                    setWaterReservoirMeta('此水庫尚無供水區對照');
                }
            }
        }

        function ensureLayers(map) {
            if (!map.isStyleLoaded()) {
                throw new Error('map style not loaded');
            }

            ensureSupplyLayers(map);

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
            [
                layerIds.waterReservoirSupplyFill,
                layerIds.waterReservoirSupplyLine,
                layerIds.waterReservoirCircle,
                layerIds.waterReservoirLabel,
            ].forEach((layerId) => {
                if (!map.getLayer(layerId)) return;
                try {
                    map.moveLayer(layerId);
                } catch (_) {
                    /* already on top */
                }
            });
        }

        function bindInteractions(map) {
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
                    const showSupply = selectedReservoirKey === feature.properties?.reservoirId
                        ? selectedSupplyLabels
                        : [];
                    hoverPopup
                        .setLngLat(feature.geometry.coordinates)
                        .setHTML(popupHtml(feature.properties, showSupply))
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

                clickHandler = async (e) => {
                    if (!isLayerActive()) return;
                    const feature = e.features && e.features[0];
                    if (!feature) return;

                    const reservoirId = feature.properties?.reservoirId || '';
                    const reservoirName = feature.properties?.name || '';
                    if (!reservoirId && !reservoirName) return;

                    if (selectedReservoirKey === reservoirId) {
                        clearSupplyHighlight(map);
                        if (typeof setWaterReservoirMeta === 'function') setWaterReservoirMeta('');
                        return;
                    }

                    await setSupplyHighlight(map, reservoirId, reservoirName);
                    if (hoverPopupActive) {
                        hoverPopup.setHTML(popupHtml(feature.properties, selectedSupplyLabels));
                    }
                };

                mapClickHandler = (e) => {
                    if (!isLayerActive() || !selectedReservoirKey) return;
                    const layers = [
                        layerIds.waterReservoirCircle,
                        layerIds.waterReservoirLabel,
                    ].filter((id) => map.getLayer(id));
                    const hits = map.queryRenderedFeatures(e.point, { layers });
                    if (hits.length) return;
                    clearSupplyHighlight(map);
                    if (typeof setWaterReservoirMeta === 'function') setWaterReservoirMeta('');
                };
            }

            if (!interactionsBound) {
                interactionsBound = true;
                map.on('click', mapClickHandler);
            }

            [layerIds.waterReservoirCircle, layerIds.waterReservoirLabel].forEach((layerId) => {
                if (!map.getLayer(layerId) || boundLayers.has(layerId)) return;
                boundLayers.add(layerId);
                map.on('mouseenter', layerId, enterHandler);
                map.on('mousemove', layerId, moveHandler);
                map.on('mouseleave', layerId, leaveHandler);
                map.on('click', layerId, clickHandler);
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
            if (!isLayerActive()) {
                clearSupplyHighlight(map);
                if (hoverPopup) {
                    hoverPopupActive = false;
                    hoverPopup.remove();
                }
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
                bindInteractions(map);
                map.getSource(SOURCE_ID).setData(buildGeoJson(payload.reservoirs));
                syncCirclePaint(map);
                raiseLayers(map);
                applyVisibility(map);
                if (typeof setWaterReservoirMeta === 'function' && !selectedReservoirKey) {
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
            selectedReservoirKey = null;
            selectedSupplyLabels = [];
            interactionsBound = false;
            boundLayers.clear();
            enterHandler = null;
            moveHandler = null;
            leaveHandler = null;
            clickHandler = null;
            mapClickHandler = null;
        }

        return {
            ensureLayers,
            refreshWaterReservoirLayers,
            scheduleWaterReservoirRefresh,
            teardownWaterReservoirRefresh,
            clearSupplyHighlight,
            formatMonitorMeta,
            buildGeoJson,
            buildSupplyDistrictGeoJson,
            popupHtml,
        };
    }

    global.DashboardMapWaterReservoir = {
        createWaterReservoirLayersApi,
        buildSupplyDistrictGeoJson,
        SOURCE_ID,
        SUPPLY_SOURCE_ID,
    };
}(typeof window !== 'undefined' ? window : globalThis));
