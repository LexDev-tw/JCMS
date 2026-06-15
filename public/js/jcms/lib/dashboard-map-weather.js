/** 地圖總覽：CWA 氣象圖層（preview / composable 共用） */
(function (global) {
    const WEATHER_SOURCE_IDS = Object.freeze({
        rainAdvisory: 'cwa-rain-advisory-towns',
        satelliteCloud: 'cwa-satellite-image',
        radarEcho: 'cwa-radar-image',
    });

    function normalizeAreaDesc(text) {
        return String(text || '').replace(/臺/g, '台').trim();
    }

    function townAreaKey(props) {
        if (!props) return '';
        return normalizeAreaDesc(String(props.COUNTYNAME || '') + String(props.TOWNNAME || ''));
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

    function buildRainAdvisoryGeoJson(twTownsGeoJson, areas) {
        if (!twTownsGeoJson || !Array.isArray(areas) || !areas.length) {
            return { type: 'FeatureCollection', features: [] };
        }
        const levelByKey = new Map(
            areas.map((a) => [normalizeAreaDesc(a.areaDesc), a.level || 'moderate'])
        );
        const features = twTownsGeoJson.features
            .filter((f) => levelByKey.has(townAreaKey(f.properties)))
            .map((f) => ({
                ...f,
                properties: {
                    ...f.properties,
                    rainLevel: levelByKey.get(townAreaKey(f.properties)) || 'moderate',
                },
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

    function createWeatherLayersApi({
        mapColors,
        layerIds,
        getTwTownsGeoJson,
        getMapLayerState,
        setWeatherMeta,
    }) {
        const RAIN_LEVEL_PAINT = Object.freeze({
            extreme: { color: mapColors.accent, opacity: 0.38 },
            heavy: { color: mapColors.ink600, opacity: 0.32 },
            moderate: { color: mapColors.ink400, opacity: 0.28 },
        });

        function ensureRainAdvisoryLayers(map) {
            if (map.getSource(WEATHER_SOURCE_IDS.rainAdvisory)) return;
            map.addSource(WEATHER_SOURCE_IDS.rainAdvisory, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: layerIds.rainAdvisoryFill,
                type: 'fill',
                source: WEATHER_SOURCE_IDS.rainAdvisory,
                layout: { visibility: 'none' },
                paint: {
                    'fill-color': [
                        'match',
                        ['get', 'rainLevel'],
                        'extreme', RAIN_LEVEL_PAINT.extreme.color,
                        'heavy', RAIN_LEVEL_PAINT.heavy.color,
                        RAIN_LEVEL_PAINT.moderate.color,
                    ],
                    'fill-opacity': [
                        'match',
                        ['get', 'rainLevel'],
                        'extreme', RAIN_LEVEL_PAINT.extreme.opacity,
                        'heavy', RAIN_LEVEL_PAINT.heavy.opacity,
                        RAIN_LEVEL_PAINT.moderate.opacity,
                    ],
                },
            });
            map.addLayer({
                id: layerIds.rainAdvisoryLine,
                type: 'line',
                source: WEATHER_SOURCE_IDS.rainAdvisory,
                layout: { visibility: 'none' },
                paint: {
                    'line-color': mapColors.ink900,
                    'line-opacity': 0.35,
                    'line-width': 0.6,
                },
            });
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
                    const res = await fetch('/api/weather/rain-advisory');
                    if (!res.ok) throw new Error(`rain HTTP ${res.status}`);
                    const payload = await res.json();
                    ensureRainAdvisoryLayers(map);
                    map.getSource(WEATHER_SOURCE_IDS.rainAdvisory).setData(
                        buildRainAdvisoryGeoJson(getTwTownsGeoJson(), payload.areas || [])
                    );
                    map.setLayoutProperty(layerIds.rainAdvisoryFill, 'visibility', 'visible');
                    map.setLayoutProperty(layerIds.rainAdvisoryLine, 'visibility', 'visible');
                    const headline = payload.advisories?.[0]?.headline || '目前無豪雨特報';
                    const count = payload.areas?.length || 0;
                    metaParts.push(count ? `降雨 ${headline} · ${count} 鄉鎮` : `降雨 ${headline}`);
                } else if (map.getLayer(layerIds.rainAdvisoryFill)) {
                    map.setLayoutProperty(layerIds.rainAdvisoryFill, 'visibility', 'none');
                    map.setLayoutProperty(layerIds.rainAdvisoryLine, 'visibility', 'none');
                }
            } catch (err) {
                console.warn('[dashboard-map] 降雨特報載入失敗', err);
                if (map.getLayer(layerIds.rainAdvisoryFill)) {
                    map.setLayoutProperty(layerIds.rainAdvisoryFill, 'visibility', 'none');
                    map.setLayoutProperty(layerIds.rainAdvisoryLine, 'visibility', 'none');
                }
                metaParts.push('降雨特報載入失敗');
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
            ensureRainAdvisoryLayers,
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
