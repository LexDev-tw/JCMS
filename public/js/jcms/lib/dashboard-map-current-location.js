/** 地圖總覽：現在位置標記（永遠顯示） */
(function (global) {
    const SOURCE_ID = 'jcms-current-location';
    const LAYER_POINT = 'jcms-current-location-point';
    const ACCENT = '#F05A28';
    const BLINK_CYCLE_MS = 2800;

    let blinkRaf = null;
    let blinkMap = null;
    let blinkStart = 0;

    function stopBlink() {
        if (blinkRaf) {
            cancelAnimationFrame(blinkRaf);
            blinkRaf = null;
        }
        blinkMap = null;
    }

    function startBlink(map) {
        if (blinkMap === map && blinkRaf) return;
        stopBlink();
        blinkMap = map;
        blinkStart = performance.now();

        function tick(now) {
            if (blinkMap !== map || !map.getLayer(LAYER_POINT)) {
                stopBlink();
                return;
            }
            const phase = ((now - blinkStart) % BLINK_CYCLE_MS) / BLINK_CYCLE_MS;
            const opacity = 0.3 + 0.65 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
            map.setPaintProperty(LAYER_POINT, 'circle-opacity', opacity);
            blinkRaf = requestAnimationFrame(tick);
        }

        blinkRaf = requestAnimationFrame(tick);
    }

    function createCurrentLocationApi({ mapColors }) {
        function ensureLayers(map) {
            if (map.getSource(SOURCE_ID)) return;

            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: LAYER_POINT,
                type: 'circle',
                source: SOURCE_ID,
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['zoom'],
                        7, 2.5,
                        10, 3.5,
                        13, 4.5,
                    ],
                    'circle-color': ACCENT,
                    'circle-opacity': 0.95,
                    'circle-stroke-color': mapColors?.surface || '#ffffff',
                    'circle-stroke-width': 1,
                },
            });
        }

        function syncCurrentLocation(map, location) {
            if (!map) return;
            ensureLayers(map);

            const lng = Number(location?.lng ?? location?.coordinates?.[0]);
            const lat = Number(location?.lat ?? location?.coordinates?.[1]);
            const hasCoords = Number.isFinite(lng) && Number.isFinite(lat);

            const features = hasCoords
                ? [{
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'Point', coordinates: [lng, lat] },
                }]
                : [];

            map.getSource(SOURCE_ID).setData({
                type: 'FeatureCollection',
                features,
            });

            if (map.getLayer(LAYER_POINT)) {
                map.setLayoutProperty(LAYER_POINT, 'visibility', hasCoords ? 'visible' : 'none');
            }

            if (hasCoords) {
                startBlink(map);
            } else {
                stopBlink();
            }
        }

        return { ensureLayers, syncCurrentLocation, SOURCE_ID, stopBlink };
    }

    global.DashboardMapCurrentLocation = { createCurrentLocationApi };
}(typeof window !== 'undefined' ? window : globalThis));
