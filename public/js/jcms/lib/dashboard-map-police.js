/** 地圖總覽：警政署所屬機關地址（靜態 GeoJSON + 懸停 popup） */
(function (global) {
    const SOURCE_ID = 'police-agencies';
    const POLICE_COLOR = 'rgb(40, 49, 133)';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function popupHtml(props) {
        const name = escapeHtml(props?.name || '—');
        const unit = escapeHtml(props?.unit || '');
        const phone = escapeHtml(props?.phone || '');
        const address = escapeHtml(props?.address || '—');
        const titleLine = phone ? `${name} ${phone}` : name;
        const unitLine = unit
            ? `<p style="font-size:10px;color:#666;line-height:1.3">${unit}</p>`
            : '';
        return [
            `<p style="font-size:11px;font-weight:700;color:#111">${titleLine}</p>`,
            unitLine,
            `<p style="font-size:10px;color:#666;line-height:1.3">${address}</p>`,
        ].join('');
    }

    function createPoliceLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        getGeoJsonUrl,
        getGeoJsonUrls,
        getResolvedGeoJson,
    }) {
        let hoverPopup = null;
        let hoverPopupActive = false;
        let enterHandler = null;
        let moveHandler = null;
        let leaveHandler = null;
        let geoJsonCache = null;
        let geoJsonPromise = null;

        function getDataUrls() {
            if (typeof getGeoJsonUrls === 'function') {
                const urls = getGeoJsonUrls();
                if (Array.isArray(urls) && urls.length) return urls;
            }
            if (typeof getGeoJsonUrl === 'function') return [getGeoJsonUrl()];
            return ['data/police-agencies.geojson'];
        }

        async function loadGeoJson() {
            if (typeof getResolvedGeoJson === 'function') {
                return getResolvedGeoJson();
            }
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
                id: layerIds.policeCircle,
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
                    'circle-color': POLICE_COLOR,
                    'circle-opacity': 0.82,
                    'circle-stroke-color': mapColors.surface,
                    'circle-stroke-width': 1.2,
                },
            });
        }

        function bindHoverPopup(map) {
            if (enterHandler) return;
            hoverPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                maxWidth: 'none',
                className: 'dash-map-police-popup',
                offset: 8,
            });

            enterHandler = (e) => {
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.policeAgencies) return;
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
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.policeAgencies || !hoverPopupActive) return;
                const feature = e.features && e.features[0];
                if (!feature) return;
                hoverPopup.setLngLat(feature.geometry.coordinates);
            };

            leaveHandler = () => {
                map.getCanvas().style.cursor = '';
                hoverPopupActive = false;
                hoverPopup.remove();
            };

            map.on('mouseenter', layerIds.policeCircle, enterHandler);
            map.on('mousemove', layerIds.policeCircle, moveHandler);
            map.on('mouseleave', layerIds.policeCircle, leaveHandler);
        }

        function applyVisibility(map) {
            const visible = getMapLayerState()?.policeAgencies ? 'visible' : 'none';
            if (map.getLayer(layerIds.policeCircle)) {
                map.setLayoutProperty(layerIds.policeCircle, 'visibility', visible);
            }
        }

        async function refreshPoliceLayers(map) {
            const mapLayerState = getMapLayerState();
            if (!mapLayerState?.policeAgencies) {
                applyVisibility(map);
                return;
            }

            try {
                const data = await loadGeoJson();
                ensureLayers(map);
                bindHoverPopup(map);
                map.getSource(SOURCE_ID).setData(data);
                applyVisibility(map);
            } catch (err) {
                console.warn('[dashboard-map] 警察機關載入失敗', err);
                applyVisibility(map);
            }
        }

        function teardownPoliceLayers() {
            geoJsonCache = null;
            geoJsonPromise = null;
        }

        function invalidatePoliceGeoJsonCache() {
            geoJsonCache = null;
            geoJsonPromise = null;
        }

        return {
            ensureLayers,
            refreshPoliceLayers,
            teardownPoliceLayers,
            invalidatePoliceGeoJsonCache,
            SOURCE_ID,
        };
    }

    global.DashboardMapPolice = {
        createPoliceLayersApi,
        SOURCE_ID,
        POLICE_COLOR,
    };
}(typeof window !== 'undefined' ? window : globalThis));
