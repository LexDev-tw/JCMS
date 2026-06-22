/** 地圖總覽：雙北都市計畫使用分區（GeoJSON + 懸停 popup） */
(function (global) {
    const SOURCE_ID = 'taipei-urban-plan';
    const LAYER_FILL = 'taipei-urban-plan-fill';
    const LAYER_LINE = 'taipei-urban-plan-line';
    const DATA_URLS = Object.freeze([
        'data/taipei-urban-plan.geojson',
        'data/ntpc-urban-plan.geojson',
    ]);
    const ATTRIBUTION = '臺北市資料大平臺 · 新北市資料開放平臺';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function popupHtml(props) {
        const title = escapeHtml(props?.zoneName || props?.zoneAbbr || props?.zoneCode || '使用分區');
        const region = props?.region ? escapeHtml(props.region) : '';
        const abbr = props?.zoneAbbr && props.zoneAbbr !== props?.zoneName
            ? escapeHtml(props.zoneAbbr)
            : '';
        const code = props?.zoneCode ? escapeHtml(props.zoneCode) : '';
        const desc = props?.zoneDesc ? escapeHtml(props.zoneDesc) : '';
        const meta = [region, abbr, code].filter(Boolean).join(' · ');
        return [
            `<p style="font-size:11px;font-weight:700;color:#111">${title}</p>`,
            meta ? `<p style="font-size:10px;color:#666;line-height:1.3">${meta}</p>` : '',
            desc ? `<p style="font-size:10px;color:#666;line-height:1.3">${desc}</p>` : '',
        ].join('');
    }

    function featureCentroid(feature) {
        const geom = feature?.geometry;
        if (!geom) return null;
        const rings = geom.type === 'Polygon'
            ? [geom.coordinates[0]]
            : geom.type === 'MultiPolygon'
                ? geom.coordinates.map((poly) => poly[0])
                : [];
        if (!rings.length || !rings[0]?.length) return null;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        rings.forEach((ring) => {
            const n = ring.length - 1;
            for (let i = 0; i < n; i += 1) {
                sumX += ring[i][0];
                sumY += ring[i][1];
                count += 1;
            }
        });
        if (!count) return null;
        return [sumX / count, sumY / count];
    }

    function createUrbanPlanLayersApi({
        getMapLayerState,
        getGeoJsonUrls,
        setUrbanPlanMeta,
    }) {
        let geoJsonCache = null;
        let geoJsonPromise = null;
        let hoverPopup = null;
        let hoverPopupActive = false;
        let enterHandler = null;
        let moveHandler = null;
        let leaveHandler = null;
        let interactionsBound = false;

        function getDataUrls() {
            if (typeof getGeoJsonUrls === 'function') return getGeoJsonUrls();
            return [...DATA_URLS];
        }

        async function loadGeoJson() {
            if (geoJsonCache) return geoJsonCache;
            if (!geoJsonPromise) {
                geoJsonPromise = Promise.all(
                    getDataUrls().map((url) => fetch(url, { headers: { Accept: 'application/geo+json, application/json' } })
                        .then((res) => {
                            if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
                            return res.json();
                        }))
                )
                    .then((collections) => {
                        const features = collections.flatMap((data) => (
                            Array.isArray(data?.features) ? data.features : []
                        ));
                        geoJsonCache = { type: 'FeatureCollection', features };
                        return geoJsonCache;
                    })
                    .catch((err) => {
                        geoJsonPromise = null;
                        throw err;
                    });
            }
            return geoJsonPromise;
        }

        function ensureLayers(map) {
            if (map.getSource(SOURCE_ID)) return;

            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: LAYER_FILL,
                type: 'fill',
                source: SOURCE_ID,
                minzoom: 11,
                layout: { visibility: 'none' },
                paint: {
                    'fill-color': ['coalesce', ['get', 'fillColor'], '#B0B0B8'],
                    'fill-opacity': 0.42,
                },
            });

            map.addLayer({
                id: LAYER_LINE,
                type: 'line',
                source: SOURCE_ID,
                minzoom: 11,
                layout: { visibility: 'none' },
                paint: {
                    'line-color': '#2A2A2A',
                    'line-opacity': 0.28,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 14, 0.8, 16, 1.2],
                },
            });
        }

        function bindInteractions(map) {
            if (interactionsBound) return;
            interactionsBound = true;

            hoverPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                maxWidth: 'none',
                className: 'dash-map-urban-plan-popup',
                offset: 8,
            });

            enterHandler = (e) => {
                if (!getMapLayerState()?.urbanPlan) return;
                const feature = e.features && e.features[0];
                if (!feature) return;
                const center = featureCentroid(feature);
                if (!center) return;
                map.getCanvas().style.cursor = 'pointer';
                hoverPopupActive = true;
                hoverPopup
                    .setLngLat(center)
                    .setHTML(popupHtml(feature.properties))
                    .addTo(map);
            };

            moveHandler = (e) => {
                if (!getMapLayerState()?.urbanPlan || !hoverPopupActive) return;
                const feature = e.features && e.features[0];
                if (!feature) return;
                const center = featureCentroid(feature);
                if (!center) return;
                hoverPopup.setLngLat(center);
            };

            leaveHandler = () => {
                map.getCanvas().style.cursor = '';
                hoverPopupActive = false;
                hoverPopup.remove();
            };

            map.on('mouseenter', LAYER_FILL, enterHandler);
            map.on('mousemove', LAYER_FILL, moveHandler);
            map.on('mouseleave', LAYER_FILL, leaveHandler);
        }

        function applyVisibility(map) {
            const visible = getMapLayerState()?.urbanPlan ? 'visible' : 'none';
            [LAYER_FILL, LAYER_LINE].forEach((layerId) => {
                if (!map.getLayer(layerId)) return;
                map.setLayoutProperty(layerId, 'visibility', visible);
            });
            if (!getMapLayerState()?.urbanPlan && hoverPopup) {
                hoverPopupActive = false;
                hoverPopup.remove();
                map.getCanvas().style.cursor = '';
            }
        }

        function updateMeta(phase, detail) {
            if (typeof setUrbanPlanMeta !== 'function') return;
            if (!getMapLayerState()?.urbanPlan || phase === 'idle') {
                setUrbanPlanMeta('');
                return;
            }
            if (phase === 'loading') {
                setUrbanPlanMeta('都市計畫資料載入中…');
                return;
            }
            if (phase === 'error') {
                setUrbanPlanMeta('都市計畫資料載入失敗');
                return;
            }
            setUrbanPlanMeta(detail || ATTRIBUTION);
        }

        async function refreshUrbanPlanLayers(map) {
            if (!getMapLayerState()?.urbanPlan) {
                updateMeta('idle');
                applyVisibility(map);
                return;
            }

            updateMeta('loading');
            try {
                const data = await loadGeoJson();
                ensureLayers(map);
                bindInteractions(map);
                map.getSource(SOURCE_ID).setData(data);
                applyVisibility(map);
                const count = Array.isArray(data?.features) ? data.features.length : 0;
                updateMeta('ready', count > 0 ? `${ATTRIBUTION}\n${count} 分區` : ATTRIBUTION);
            } catch (err) {
                console.warn('[dashboard-map] 都市計畫圖層載入失敗', err);
                updateMeta('error');
                applyVisibility(map);
                throw err;
            }
        }

        function teardownUrbanPlanLayers() {
            geoJsonCache = null;
            geoJsonPromise = null;
            interactionsBound = false;
            enterHandler = null;
            moveHandler = null;
            leaveHandler = null;
            hoverPopup = null;
            hoverPopupActive = false;
        }

        return {
            SOURCE_ID,
            LAYER_FILL,
            LAYER_LINE,
            ATTRIBUTION,
            ensureLayers,
            refreshUrbanPlanLayers,
            teardownUrbanPlanLayers,
        };
    }

    global.DashboardMapUrbanPlan = {
        SOURCE_ID,
        LAYER_FILL,
        LAYER_LINE,
        DATA_URLS,
        ATTRIBUTION,
        createUrbanPlanLayersApi,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
