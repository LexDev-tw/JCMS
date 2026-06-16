/** 地圖總覽：司法與檢察機關（靜態 GeoJSON + 懸停 popup + 點擊轄區高亮） */
(function (global) {
    const SOURCE_ID = 'judicial-agencies';
    const JURISDICTION_SOURCE_ID = 'judicial-jurisdiction-towns';
    const JUDICIAL_COLOR = 'rgb(37, 74, 125)';
    const PROSECUTION_COLOR = 'rgb(72, 36, 102)';

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
            .replace(/\s+/g, '')
            .trim();
    }

    function splitJurisdictionSegments(text) {
        const segments = [];
        let current = '';
        let depth = 0;
        for (const ch of String(text || '')) {
            if (ch === '（') {
                depth += 1;
                current += ch;
            } else if (ch === '）') {
                depth -= 1;
                current += ch;
            } else if (ch === '、' && depth === 0) {
                if (current.trim()) segments.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) segments.push(current.trim());
        return segments;
    }

    function parseJurisdiction(jurisdictionText) {
        const raw = String(jurisdictionText || '').trim();
        if (!raw || raw === '全國') {
            return { national: true, rules: [] };
        }
        const rules = splitJurisdictionSegments(raw).map((part) => {
            const match = part.match(/^(.+?)（([^）]+)）$/);
            if (match) {
                return {
                    county: normalizeAreaText(match[1]),
                    districts: match[2].split('、').map((d) => normalizeAreaText(d)).filter(Boolean),
                    wholeCounty: false,
                };
            }
            return {
                county: normalizeAreaText(part),
                districts: [],
                wholeCounty: true,
            };
        });
        return { national: false, rules };
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

    function townInJurisdiction(props, parsed) {
        if (!props) return false;
        if (parsed.national) return true;
        const county = normalizeAreaText(props.COUNTYNAME);
        if (!county) return false;
        return parsed.rules.some((rule) => {
            if (county !== rule.county) return false;
            if (rule.wholeCounty) return true;
            return rule.districts.some((district) => districtMatches(props.TOWNNAME, district));
        });
    }

    function buildJurisdictionGeoJson(twTownsGeoJson, jurisdictionText) {
        if (!twTownsGeoJson?.features?.length) {
            return { type: 'FeatureCollection', features: [] };
        }
        const parsed = parseJurisdiction(jurisdictionText);
        const features = twTownsGeoJson.features.filter((f) => townInJurisdiction(f.properties, parsed));
        return { type: 'FeatureCollection', features };
    }

    function colorForAgencyType(type) {
        return type === '檢察' ? PROSECUTION_COLOR : JUDICIAL_COLOR;
    }

    function popupHtml(props) {
        const name = escapeHtml(props?.name || '—');
        const type = escapeHtml(props?.type || '');
        const jurisdiction = escapeHtml(props?.jurisdiction || '');
        const address = escapeHtml(props?.address || '');
        const metaLine = [type, jurisdiction].filter(Boolean).join(' · ');
        return [
            `<p style="font-size:11px;font-weight:700;color:#111">${name}</p>`,
            metaLine
                ? `<p style="font-size:10px;color:#666;line-height:1.3">${metaLine}</p>`
                : '',
            address
                ? `<p style="font-size:10px;color:#666;line-height:1.3">${address}</p>`
                : '',
        ].join('');
    }

    function createJudicialLayersApi({
        mapColors,
        layerIds,
        getMapLayerState,
        getGeoJsonUrl,
        getTwTownsGeoJson,
        getResolvedGeoJson,
    }) {
        let hoverPopup = null;
        let hoverPopupActive = false;
        let enterHandler = null;
        let moveHandler = null;
        let leaveHandler = null;
        let clickHandler = null;
        let mapClickHandler = null;
        let interactionsBound = false;
        let selectedCourtName = null;
        let geoJsonCache = null;
        let geoJsonPromise = null;

        function getDataUrl() {
            if (typeof getGeoJsonUrl === 'function') return getGeoJsonUrl();
            return 'data/judicial-agencies.geojson';
        }

        async function loadGeoJson() {
            if (typeof getResolvedGeoJson === 'function') {
                return getResolvedGeoJson();
            }
            if (geoJsonCache) return geoJsonCache;
            if (!geoJsonPromise) {
                geoJsonPromise = fetch(getDataUrl(), { headers: { Accept: 'application/geo+json, application/json' } })
                    .then((res) => {
                        if (!res.ok) throw new Error(`judicial-agencies HTTP ${res.status}`);
                        return res.json();
                    })
                    .then((data) => {
                        geoJsonCache = data;
                        return data;
                    })
                    .catch((err) => {
                        geoJsonPromise = null;
                        throw err;
                    });
            }
            return geoJsonPromise;
        }

        function ensureJurisdictionLayers(map) {
            if (map.getSource(JURISDICTION_SOURCE_ID)) return;

            map.addSource(JURISDICTION_SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: layerIds.judicialJurisdictionFill,
                type: 'fill',
                source: JURISDICTION_SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'fill-color': JUDICIAL_COLOR,
                    'fill-opacity': 0.14,
                },
            });

            map.addLayer({
                id: layerIds.judicialJurisdictionLine,
                type: 'line',
                source: JURISDICTION_SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'line-color': JUDICIAL_COLOR,
                    'line-opacity': 0.38,
                    'line-width': 0.9,
                },
            });
        }

        function ensureLayers(map) {
            ensureJurisdictionLayers(map);
            if (map.getSource(SOURCE_ID)) return;

            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });

            map.addLayer({
                id: layerIds.judicialCircle,
                type: 'circle',
                source: SOURCE_ID,
                layout: { visibility: 'none' },
                paint: {
                    'circle-radius': [
                        'interpolate', ['linear'], ['zoom'],
                        7, 2.625,
                        10, 3.75,
                        13, 5.25,
                    ],
                    'circle-color': [
                        'match', ['get', 'type'],
                        '檢察', PROSECUTION_COLOR,
                        JUDICIAL_COLOR,
                    ],
                    'circle-opacity': 0.82,
                    'circle-stroke-color': mapColors.surface,
                    'circle-stroke-width': 1.2,
                },
            });
        }

        function syncSelectedCourtStyle(map) {
            if (!map.getLayer(layerIds.judicialCircle)) return;
            const selected = selectedCourtName || '';
            map.setPaintProperty(layerIds.judicialCircle, 'circle-stroke-color', [
                'case',
                ['==', ['get', 'name'], selected],
                mapColors.ink900,
                mapColors.surface,
            ]);
            map.setPaintProperty(layerIds.judicialCircle, 'circle-stroke-width', [
                'case',
                ['==', ['get', 'name'], selected],
                2.4,
                1.2,
            ]);
        }

        function setJurisdictionHighlightVisibility(map, visible) {
            const layout = visible ? 'visible' : 'none';
            if (map.getLayer(layerIds.judicialJurisdictionFill)) {
                map.setLayoutProperty(layerIds.judicialJurisdictionFill, 'visibility', layout);
            }
            if (map.getLayer(layerIds.judicialJurisdictionLine)) {
                map.setLayoutProperty(layerIds.judicialJurisdictionLine, 'visibility', layout);
            }
        }

        function clearJurisdictionHighlight(map) {
            selectedCourtName = null;
            if (map?.getSource(JURISDICTION_SOURCE_ID)) {
                map.getSource(JURISDICTION_SOURCE_ID).setData({
                    type: 'FeatureCollection',
                    features: [],
                });
            }
            if (map) {
                setJurisdictionHighlightVisibility(map, false);
                syncSelectedCourtStyle(map);
            }
        }

        function setJurisdictionHighlight(map, courtName, jurisdictionText, agencyType) {
            const twTownsGeoJson = typeof getTwTownsGeoJson === 'function' ? getTwTownsGeoJson() : null;
            if (!twTownsGeoJson) return;

            const highlightColor = colorForAgencyType(agencyType);
            ensureJurisdictionLayers(map);
            const data = buildJurisdictionGeoJson(twTownsGeoJson, jurisdictionText);
            map.getSource(JURISDICTION_SOURCE_ID).setData(data);
            if (map.getLayer(layerIds.judicialJurisdictionFill)) {
                map.setPaintProperty(layerIds.judicialJurisdictionFill, 'fill-color', highlightColor);
            }
            if (map.getLayer(layerIds.judicialJurisdictionLine)) {
                map.setPaintProperty(layerIds.judicialJurisdictionLine, 'line-color', highlightColor);
            }
            selectedCourtName = courtName;
            setJurisdictionHighlightVisibility(map, data.features.length > 0);
            syncSelectedCourtStyle(map);
        }

        function bindInteractions(map) {
            if (interactionsBound) return;
            interactionsBound = true;

            hoverPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                maxWidth: 'none',
                className: 'dash-map-judicial-popup',
                offset: 8,
            });

            enterHandler = (e) => {
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.judicialAgencies) return;
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
                if (!mapLayerState?.judicialAgencies || !hoverPopupActive) return;
                const feature = e.features && e.features[0];
                if (!feature) return;
                hoverPopup.setLngLat(feature.geometry.coordinates);
            };

            leaveHandler = () => {
                map.getCanvas().style.cursor = '';
                hoverPopupActive = false;
                hoverPopup.remove();
            };

            clickHandler = (e) => {
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.judicialAgencies) return;
                const feature = e.features && e.features[0];
                if (!feature) return;

                const name = feature.properties?.name || '';
                const jurisdiction = feature.properties?.jurisdiction || '';
                const agencyType = feature.properties?.type || '';
                if (!name) return;

                if (selectedCourtName === name) {
                    clearJurisdictionHighlight(map);
                    return;
                }

                setJurisdictionHighlight(map, name, jurisdiction, agencyType);
            };

            mapClickHandler = (e) => {
                const mapLayerState = getMapLayerState();
                if (!mapLayerState?.judicialAgencies || !selectedCourtName) return;
                const hits = map.queryRenderedFeatures(e.point, { layers: [layerIds.judicialCircle] });
                if (hits.length) return;
                clearJurisdictionHighlight(map);
            };

            map.on('mouseenter', layerIds.judicialCircle, enterHandler);
            map.on('mousemove', layerIds.judicialCircle, moveHandler);
            map.on('mouseleave', layerIds.judicialCircle, leaveHandler);
            map.on('click', layerIds.judicialCircle, clickHandler);
            map.on('click', mapClickHandler);
        }

        function applyVisibility(map) {
            const visible = getMapLayerState()?.judicialAgencies ? 'visible' : 'none';
            if (map.getLayer(layerIds.judicialCircle)) {
                map.setLayoutProperty(layerIds.judicialCircle, 'visibility', visible);
            }
            if (!getMapLayerState()?.judicialAgencies) {
                clearJurisdictionHighlight(map);
            }
        }

        async function refreshJudicialLayers(map) {
            const mapLayerState = getMapLayerState();
            if (!mapLayerState?.judicialAgencies) {
                applyVisibility(map);
                return;
            }

            try {
                const data = await loadGeoJson();
                ensureLayers(map);
                bindInteractions(map);
                map.getSource(SOURCE_ID).setData(data);
                syncSelectedCourtStyle(map);
                applyVisibility(map);
            } catch (err) {
                console.warn('[dashboard-map] 司法機關載入失敗', err);
                applyVisibility(map);
            }
        }

        function teardownJudicialLayers() {
            selectedCourtName = null;
            geoJsonCache = null;
            geoJsonPromise = null;
            interactionsBound = false;
            enterHandler = null;
            moveHandler = null;
            leaveHandler = null;
            clickHandler = null;
            mapClickHandler = null;
            hoverPopup = null;
            hoverPopupActive = false;
        }

        function invalidateJudicialGeoJsonCache() {
            geoJsonCache = null;
            geoJsonPromise = null;
        }

        return {
            ensureLayers,
            refreshJudicialLayers,
            teardownJudicialLayers,
            invalidateJudicialGeoJsonCache,
            clearJurisdictionHighlight,
            SOURCE_ID,
            JURISDICTION_SOURCE_ID,
        };
    }

    global.DashboardMapJudicial = {
        createJudicialLayersApi,
        buildJurisdictionGeoJson,
        parseJurisdiction,
        SOURCE_ID,
        JURISDICTION_SOURCE_ID,
        JUDICIAL_COLOR,
        PROSECUTION_COLOR,
    };
}(typeof window !== 'undefined' ? window : globalThis));
