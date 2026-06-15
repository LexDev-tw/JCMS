/** 地圖總覽：環境部空氣品質監測站 + 小時 AQI（preview / composable 共用） */
(function (global) {
    const SOURCE_ID = 'epa-aq-stations';

    function formatMonitorMeta(data) {
        if (!data) return '';
        const date = String(data.monitorDate || '').replace(/-/g, '/');
        const hour = Number.isFinite(data.monitorHour)
            ? String(data.monitorHour).padStart(2, '0')
            : '—';
        const count = data.stationCount || (Array.isArray(data.stations) ? data.stations.length : 0);
        return `${data.sourceAgency || '環境部'} · ${date} ${hour}:00 · ${count} 站`;
    }

    function buildGeoJson(stations) {
        const features = (Array.isArray(stations) ? stations : [])
            .filter((s) => Number.isFinite(s.lng) && Number.isFinite(s.lat))
            .map((s) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [s.lng, s.lat],
                },
                properties: {
                    siteId: s.siteId,
                    name: s.name,
                    county: s.county,
                    township: s.township,
                    siteType: s.siteType,
                    pm25: s.pm25,
                    aqi: s.aqi,
                    band: s.band || 'unknown',
                    status: s.status || '—',
                    label: s.aqi != null && Number.isFinite(s.aqi) ? String(s.aqi) : '',
                },
            }));
        return { type: 'FeatureCollection', features };
    }

    function popupHtml(props) {
        const name = String(props?.name || '—');
        const county = String(props?.county || '');
        const aqiNum = props?.aqi != null && Number.isFinite(Number(props.aqi)) ? Number(props.aqi) : null;
        const aqi = aqiNum != null ? String(aqiNum) : '—';
        const aqiColor = aqiNum != null && aqiNum >= 151 ? '#F05A28' : '#111111';
        const status = String(props?.status || '—');
        const pm25 = props?.pm25 != null && Number.isFinite(props.pm25) ? String(props.pm25) : '—';
        const siteType = String(props?.siteType || '');
        return [
            `<p style="margin:0 0 0.2rem;font-size:11px;font-weight:700;color:#111">${name}</p>`,
            county ? `<p style="margin:0 0 0.35rem;font-size:9px;color:#666">${county}${siteType ? ` · ${siteType}` : ''}</p>` : '',
            `<p style="margin:0;font-family:ui-monospace,monospace;font-size:10px;color:#111">AQI <span style="font-weight:700;color:${aqiColor}">${aqi}</span> · ${status}</p>`,
            `<p style="margin:0.2rem 0 0;font-family:ui-monospace,monospace;font-size:9px;color:#666">PM2.5 ${pm25} μg/m³</p>`,
        ].join('');
    }

    function createAirQualityLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        setAirQualityMeta,
        getApiBase,
    }) {
        let clickHandler = null;
        let popup = null;

        function ensureLayers(map) {
            if (map.getSource(SOURCE_ID)) return;

            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: layerIds.airQualityCircle,
                type: 'circle',
                source: SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['zoom'],
                        7, 1.75,
                        10, 2.5,
                        13, 3.5,
                    ],
                    'circle-color': [
                        'match',
                        ['get', 'band'],
                        'good', mapColors.ink600,
                        'moderate', mapColors.ink900,
                        'sensitive', mapColors.ink900,
                        'unhealthy', mapColors.accent,
                        'hazardous', mapColors.accent,
                        mapColors.ink400,
                    ],
                    'circle-opacity': 0.82,
                    'circle-stroke-color': mapColors.surface,
                    'circle-stroke-width': 1.2,
                },
            });

            map.addLayer({
                id: layerIds.airQualityLabel,
                type: 'symbol',
                source: SOURCE_ID,
                minzoom: 9,
                layout: {
                    visibility: 'none',
                    'text-field': ['get', 'label'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 9, 8, 12, 9],
                    'text-offset': [0, -1.35],
                    'text-anchor': 'bottom',
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                },
                paint: {
                    'text-color': [
                        'case',
                        ['all', ['has', 'aqi'], ['>=', ['to-number', ['get', 'aqi']], 151]],
                        mapColors.accent,
                        mapColors.ink900,
                    ],
                    'text-halo-color': 'rgba(255, 255, 255, 0.92)',
                    'text-halo-width': 1.2,
                },
            });
        }

        function bindClickPopup(map) {
            if (clickHandler) return;
            popup = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true,
                maxWidth: '220px',
                className: 'dash-map-aq-popup',
            });
            clickHandler = (e) => {
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.airQuality) return;
                const feature = e.features && e.features[0];
                if (!feature) return;
                popup
                    .setLngLat(feature.geometry.coordinates)
                    .setHTML(popupHtml(feature.properties))
                    .addTo(map);
            };
            map.on('click', layerIds.airQualityCircle, clickHandler);
            map.on('mouseenter', layerIds.airQualityCircle, () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', layerIds.airQualityCircle, () => {
                map.getCanvas().style.cursor = '';
            });
        }

        function applyVisibility(map) {
            const visible = getMapLayerState()?.airQuality ? 'visible' : 'none';
            if (map.getLayer(layerIds.airQualityCircle)) {
                map.setLayoutProperty(layerIds.airQualityCircle, 'visibility', visible);
            }
            if (map.getLayer(layerIds.airQualityLabel)) {
                map.setLayoutProperty(layerIds.airQualityLabel, 'visibility', visible);
            }
        }

        async function refreshAirQualityLayers(map) {
            const mapLayerState = getMapLayerState();
            if (!mapLayerState?.airQuality) {
                applyVisibility(map);
                if (typeof setAirQualityMeta === 'function') setAirQualityMeta('');
                return;
            }

            try {
                const base = typeof getApiBase === 'function' ? getApiBase() : '/api';
                const res = await fetch(`${base}/air-quality/map`, {
                    headers: { Accept: 'application/json' },
                });
                if (!res.ok) throw new Error(`air-quality HTTP ${res.status}`);
                const payload = await res.json();
                ensureLayers(map);
                bindClickPopup(map);
                map.getSource(SOURCE_ID).setData(buildGeoJson(payload.stations));
                applyVisibility(map);
                if (typeof setAirQualityMeta === 'function') {
                    const meta = formatMonitorMeta(payload);
                    setAirQualityMeta(
                        payload.readingsUnavailable
                            ? `${meta} · 未設定 MOENV_API_KEY`
                            : meta
                    );
                }
            } catch (err) {
                console.warn('[dashboard-map] 空氣品質載入失敗', err);
                applyVisibility(map);
                if (typeof setAirQualityMeta === 'function') {
                    setAirQualityMeta('空氣品質載入失敗');
                }
            }
        }

        function scheduleAirQualityRefresh(map, getActive) {
            if (scheduleAirQualityRefresh._timer) global.clearInterval(scheduleAirQualityRefresh._timer);
            scheduleAirQualityRefresh._timer = null;
            if (!getActive()) return;
            scheduleAirQualityRefresh._timer = global.setInterval(() => {
                if (!getActive()) return;
                refreshAirQualityLayers(map).catch(() => { /* ignore */ });
            }, 10 * 60 * 1000);
        }

        function teardownAirQualityRefresh() {
            if (scheduleAirQualityRefresh._timer) {
                global.clearInterval(scheduleAirQualityRefresh._timer);
                scheduleAirQualityRefresh._timer = null;
            }
        }

        return {
            ensureLayers,
            refreshAirQualityLayers,
            scheduleAirQualityRefresh,
            teardownAirQualityRefresh,
            formatMonitorMeta,
        };
    }

    global.DashboardMapAirQuality = {
        createAirQualityLayersApi,
        SOURCE_ID,
    };
}(typeof window !== 'undefined' ? window : globalThis));
