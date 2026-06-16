/** 地圖總覽：CWA 氣象圖層（preview / composable 共用） */
(function (global) {
    const WEATHER_SOURCE_IDS = Object.freeze({
        rainObs: 'cwa-rainfall-stations',
        satelliteCloud: 'cwa-satellite-image',
        radarEcho: 'cwa-radar-image',
    });

    const RAIN_WATER_BLUE = '#38BDF8';
    const RAIN_WATER_BLUE_DEEP = '#0369A1';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatRainLabel(mm) {
        const n = Number(mm) || 0;
        if (n <= 0) return '';
        return n >= 10 ? String(Math.round(n)) : String(Number(n.toFixed(1)));
    }

    function rainfallPopupHtml(props) {
        const name = escapeHtml(props?.name || '雨量站');
        return `<p style="font-size:11px;font-weight:700;color:#111">${name}</p>`;
    }

    function formatObservedAt(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
            if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
            return '';
        }
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function buildRainfallGeoJson(stations) {
        if (!Array.isArray(stations) || !stations.length) {
            return { type: 'FeatureCollection', features: [] };
        }
        const features = stations
            .filter((s) => Number.isFinite(s.lng) && Number.isFinite(s.lat))
            .map((s) => ({
                type: 'Feature',
                properties: {
                    stationId: s.stationId || '',
                    name: s.name || '雨量站',
                    rainMm: Number(s.rainMm) || 0,
                    rainLabel: formatRainLabel(s.rainMm),
                    county: s.county || '',
                    town: s.town || '',
                },
                geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
            }));
        return { type: 'FeatureCollection', features };
    }

    function imageOverlayCoordinates(bounds) {
        const { west, east, south, north } = bounds;
        return [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
        ];
    }

    function formatRainfallMeta(raining, maxRain, obsLabel) {
        const line1 = raining
            ? `降雨 ${raining} 站 · 最大 ${maxRain.toFixed(1)}mm`
            : '降雨 全台無明顯降雨';
        if (!obsLabel) return line1;
        return `${line1}\n${obsLabel}`;
    }

    function createWeatherLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        setWeatherMeta,
    }) {
        let rainHoverPopup = null;
        let rainHoverPopupActive = false;
        const rainBoundLayers = new Set();
        let rainEnterHandler = null;
        let rainMoveHandler = null;
        let rainLeaveHandler = null;

        function setRainLayerVisibility(map, visible) {
            const layout = visible ? 'visible' : 'none';
            if (map.getLayer(layerIds.rainAdvisoryFill)) {
                map.setLayoutProperty(layerIds.rainAdvisoryFill, 'visibility', layout);
            }
            if (map.getLayer(layerIds.rainAdvisoryLabel)) {
                map.setLayoutProperty(layerIds.rainAdvisoryLabel, 'visibility', layout);
            }
            if (!visible && rainHoverPopup) {
                rainHoverPopupActive = false;
                rainHoverPopup.remove();
            }
        }

        function bindRainfallHoverPopup(map) {
            if (!rainEnterHandler) {
                rainHoverPopup = new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    maxWidth: 'none',
                    className: 'dash-map-rainfall-popup',
                    offset: 8,
                });

                rainEnterHandler = (e) => {
                    if (!getMapLayerState()?.rainAdvisory) return;
                    const feature = e.features && e.features[0];
                    if (!feature) return;
                    map.getCanvas().style.cursor = 'pointer';
                    rainHoverPopupActive = true;
                    rainHoverPopup
                        .setLngLat(feature.geometry.coordinates)
                        .setHTML(rainfallPopupHtml(feature.properties))
                        .addTo(map);
                };

                rainMoveHandler = (e) => {
                    if (!getMapLayerState()?.rainAdvisory || !rainHoverPopupActive) return;
                    const feature = e.features && e.features[0];
                    if (!feature) return;
                    rainHoverPopup.setLngLat(feature.geometry.coordinates);
                };

                rainLeaveHandler = () => {
                    map.getCanvas().style.cursor = '';
                    rainHoverPopupActive = false;
                    rainHoverPopup.remove();
                };
            }

            [layerIds.rainAdvisoryFill, layerIds.rainAdvisoryLabel].forEach((layerId) => {
                if (!map.getLayer(layerId) || rainBoundLayers.has(layerId)) return;
                rainBoundLayers.add(layerId);
                map.on('mouseenter', layerId, rainEnterHandler);
                map.on('mousemove', layerId, rainMoveHandler);
                map.on('mouseleave', layerId, rainLeaveHandler);
            });
        }

        function applyRainLabelLayout(map) {
            if (!map.getLayer(layerIds.rainAdvisoryLabel)) return;
            map.setLayoutProperty(layerIds.rainAdvisoryLabel, 'text-field', [
                'case',
                ['>=', ['coalesce', ['get', 'rainMm'], 0], 10],
                ['to-string', ['round', ['get', 'rainMm']]],
                ['to-string', ['/', ['round', ['*', ['get', 'rainMm'], 10]], 10]],
            ]);
            map.setLayoutProperty(layerIds.rainAdvisoryLabel, 'text-font', ['Noto Sans Regular']);
            map.setFilter(layerIds.rainAdvisoryLabel, ['>', ['coalesce', ['get', 'rainMm'], 0], 0]);
        }

        function applyRainCirclePaint(map) {
            if (!map.getLayer(layerIds.rainAdvisoryFill)) return;
            map.setPaintProperty(layerIds.rainAdvisoryFill, 'circle-color', RAIN_WATER_BLUE);
            map.setPaintProperty(layerIds.rainAdvisoryFill, 'circle-opacity', [
                'interpolate', ['linear'], ['get', 'rainMm'],
                0, 0.28,
                0.1, 0.62,
                5, 0.78,
                15, 0.9,
                40, 1,
            ]);
            map.setPaintProperty(layerIds.rainAdvisoryFill, 'circle-stroke-color', mapColors.surface);
            map.setPaintProperty(layerIds.rainAdvisoryFill, 'circle-stroke-width', 1);
        }

        function ensureRainObservationLayers(map) {
            if (!map.getSource(WEATHER_SOURCE_IDS.rainObs)) {
                map.addSource(WEATHER_SOURCE_IDS.rainObs, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] },
                });
            }
            if (!map.getLayer(layerIds.rainAdvisoryFill)) {
                map.addLayer({
                    id: layerIds.rainAdvisoryFill,
                    type: 'circle',
                    source: WEATHER_SOURCE_IDS.rainObs,
                    layout: { visibility: 'none' },
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            7, ['interpolate', ['linear'], ['get', 'rainMm'], 0, 2.5, 10, 4.5, 30, 6.5, 80, 8.5],
                            11, ['interpolate', ['linear'], ['get', 'rainMm'], 0, 3.5, 10, 6, 30, 9, 80, 12],
                        ],
                        'circle-color': RAIN_WATER_BLUE,
                        'circle-opacity': [
                            'interpolate', ['linear'], ['get', 'rainMm'],
                            0, 0.28,
                            0.1, 0.62,
                            5, 0.78,
                            15, 0.9,
                            40, 1,
                        ],
                        'circle-stroke-color': mapColors.surface,
                        'circle-stroke-width': 1,
                    },
                });
            } else {
                applyRainCirclePaint(map);
            }
            if (!map.getLayer(layerIds.rainAdvisoryLabel)) {
                map.addLayer({
                    id: layerIds.rainAdvisoryLabel,
                    type: 'symbol',
                    source: WEATHER_SOURCE_IDS.rainObs,
                    minzoom: 7,
                    filter: ['>', ['coalesce', ['get', 'rainMm'], 0], 0],
                    layout: {
                        visibility: 'none',
                        'text-field': [
                            'case',
                            ['>=', ['coalesce', ['get', 'rainMm'], 0], 10],
                            ['to-string', ['round', ['get', 'rainMm']]],
                            ['to-string', ['/', ['round', ['*', ['get', 'rainMm'], 10]], 10]],
                        ],
                        'text-font': ['Noto Sans Regular'],
                        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 11, 11, 14, 12],
                        'text-offset': [0.9, 0],
                        'text-anchor': 'left',
                        'text-allow-overlap': true,
                        'text-ignore-placement': true,
                    },
                    paint: {
                        'text-color': RAIN_WATER_BLUE_DEEP,
                        'text-halo-color': mapColors.surface,
                        'text-halo-width': 1.4,
                    },
                });
            } else {
                applyRainLabelLayout(map);
            }
            bindRainfallHoverPopup(map);
        }

        function ensureImageOverlayLayer(map, sourceId, layerId, defaultBounds) {
            if (map.getSource(sourceId)) return;
            map.addSource(sourceId, {
                type: 'image',
                url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                coordinates: imageOverlayCoordinates(defaultBounds),
            });
            map.addLayer({
                id: layerId,
                type: 'raster',
                source: sourceId,
                layout: { visibility: 'none' },
                paint: {
                    'raster-opacity': sourceId === WEATHER_SOURCE_IDS.radarEcho ? 0.72 : 0.58,
                    'raster-fade-duration': 0,
                },
            });
        }

        function ensureSatelliteLayer(map) {
            ensureImageOverlayLayer(
                map,
                WEATHER_SOURCE_IDS.satelliteCloud,
                layerIds.satelliteCloud,
                { west: 119, east: 123, south: 21, north: 26 }
            );
        }

        function ensureRadarLayer(map) {
            ensureImageOverlayLayer(
                map,
                WEATHER_SOURCE_IDS.radarEcho,
                layerIds.radarEcho,
                { west: 118, east: 124, south: 20.5, north: 26.5 }
            );
        }

        async function refreshWeatherLayers(map) {
            const mapLayerState = getMapLayerState();
            const metaParts = [];

            try {
                if (mapLayerState.rainAdvisory) {
                    const res = await fetch('/api/weather/rainfall-obs');
                    if (!res.ok) throw new Error(`rainfall HTTP ${res.status}`);
                    const payload = await res.json();
                    ensureRainObservationLayers(map);
                    map.getSource(WEATHER_SOURCE_IDS.rainObs).setData(
                        buildRainfallGeoJson(payload.stations || [])
                    );
                    setRainLayerVisibility(map, true);
                    const raining = payload.rainingCount || 0;
                    const maxRain = payload.maxRainMm || 0;
                    const obsLabel = formatObservedAt(payload.observedAt);
                    metaParts.push(formatRainfallMeta(raining, maxRain, obsLabel));
                } else if (map.getLayer(layerIds.rainAdvisoryFill)) {
                    setRainLayerVisibility(map, false);
                }
            } catch (err) {
                console.warn('[dashboard-map] 雨量觀測載入失敗', err);
                if (map.getLayer(layerIds.rainAdvisoryFill)) {
                    setRainLayerVisibility(map, false);
                }
                metaParts.push('雨量載入失敗');
            }

            try {
                if (mapLayerState.satelliteCloud) {
                    const res = await fetch('/api/weather/satellite/latest?product=ir-tw');
                    if (!res.ok) throw new Error(`sat HTTP ${res.status}`);
                    const payload = await res.json();
                    ensureSatelliteLayer(map);
                    map.getSource(WEATHER_SOURCE_IDS.satelliteCloud).updateImage({
                        url: payload.proxyUrl || payload.imageUrl,
                        coordinates: imageOverlayCoordinates(payload.bounds),
                    });
                    map.setLayoutProperty(layerIds.satelliteCloud, 'visibility', 'visible');
                    metaParts.push(`衛星 ${formatObservedAt(payload.observedAt)}`);
                } else if (map.getLayer(layerIds.satelliteCloud)) {
                    map.setLayoutProperty(layerIds.satelliteCloud, 'visibility', 'none');
                }
            } catch (err) {
                console.warn('[dashboard-map] 衛星雲圖載入失敗', err);
                if (map.getLayer(layerIds.satelliteCloud)) {
                    map.setLayoutProperty(layerIds.satelliteCloud, 'visibility', 'none');
                }
                metaParts.push('衛星載入失敗');
            }

            try {
                if (mapLayerState.radarEcho) {
                    const res = await fetch('/api/weather/satellite/latest?product=radar');
                    if (!res.ok) throw new Error(`radar HTTP ${res.status}`);
                    const payload = await res.json();
                    ensureRadarLayer(map);
                    map.getSource(WEATHER_SOURCE_IDS.radarEcho).updateImage({
                        url: payload.proxyUrl || payload.imageUrl,
                        coordinates: imageOverlayCoordinates(payload.bounds),
                    });
                    map.setLayoutProperty(layerIds.radarEcho, 'visibility', 'visible');
                    metaParts.push(`雷達 ${formatObservedAt(payload.observedAt)}`);
                } else if (map.getLayer(layerIds.radarEcho)) {
                    map.setLayoutProperty(layerIds.radarEcho, 'visibility', 'none');
                }
            } catch (err) {
                console.warn('[dashboard-map] 雷達回波載入失敗', err);
                if (map.getLayer(layerIds.radarEcho)) {
                    map.setLayoutProperty(layerIds.radarEcho, 'visibility', 'none');
                }
                metaParts.push('雷達載入失敗');
            }

            if (typeof setWeatherMeta === 'function') {
                setWeatherMeta(metaParts.filter(Boolean).join(' · ') || '');
            }
        }

        function scheduleWeatherRefresh(map, getActive) {
            if (scheduleWeatherRefresh._timer) window.clearInterval(scheduleWeatherRefresh._timer);
            scheduleWeatherRefresh._timer = null;
            if (!getActive()) return;
            scheduleWeatherRefresh._timer = window.setInterval(() => {
                if (!getActive()) return;
                refreshWeatherLayers(map).catch(() => { /* ignore */ });
            }, 5 * 60 * 1000);
        }

        function teardownWeatherRefresh() {
            if (scheduleWeatherRefresh._timer) {
                window.clearInterval(scheduleWeatherRefresh._timer);
                scheduleWeatherRefresh._timer = null;
            }
        }

        return {
            ensureRainAdvisoryLayers: ensureRainObservationLayers,
            ensureSatelliteLayer,
            ensureRadarLayer,
            refreshWeatherLayers,
            scheduleWeatherRefresh,
            teardownWeatherRefresh,
        };
    }

    global.DashboardMapWeather = {
        createWeatherLayersApi,
        WEATHER_SOURCE_IDS,
    };
}(typeof window !== 'undefined' ? window : globalThis));
