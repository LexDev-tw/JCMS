/** 地圖總覽：鄉鎮市區人口標籤（preview / composable 共用） */
(function (global) {
    const LAYER_ID = 'tw-town-population-labels';
    const SOURCE_ID = 'tw-town-population-labels';

    function normalizeAreaKey(text) {
        return String(text || '').replace(/\u3000/g, '').replace(/臺/g, '台').replace(/\s+/g, '').trim();
    }

    function townAreaKey(props) {
        if (!props) return '';
        return normalizeAreaKey(String(props.COUNTYNAME || '') + String(props.TOWNNAME || ''));
    }

    function formatPopulation(value) {
        const n = parseInt(String(value || '').replace(/,/g, ''), 10);
        if (!Number.isFinite(n) || n < 0) return '';
        return n.toLocaleString('zh-TW');
    }

    function getApiBase() {
        if (typeof global.jcmsResolveApiBase === 'function') return global.jcmsResolveApiBase();
        if (typeof global.JCMS_API_BASE === 'string' && global.JCMS_API_BASE.trim()) {
            const s = global.JCMS_API_BASE.trim().replace(/\/+$/, '');
            return /\/api$/i.test(s) ? s : `${s}/api`;
        }
        return '/api';
    }

    function formatRocYmLabel(yyymm) {
        const s = String(yyymm || '').replace(/\D/g, '');
        if (s.length !== 5) return s || '—';
        return `${s.slice(0, 3)}年${s.slice(3)}月`;
    }

    function formatPopulationSourceMeta(data) {
        if (!data) return '';
        const source = String(data.sourceAgency || '內政部戶政司').trim();
        const dateLabel = formatRocYmLabel(data.statisticYyymm);
        return `${source}\n${dateLabel}`;
    }

    async function fetchTownPopulationLatest() {
        const res = await fetch(`${getApiBase()}/population/towns/latest`, {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`人口 API HTTP ${res.status}`);
        const body = await res.json();
        if (!body?.success || !body.data?.towns) throw new Error('人口 API 回應異常');
        return body.data;
    }

    function buildPopulationLabelFeatures(twTownsGeoJson, townsByKey, featureCentroid) {
        if (!twTownsGeoJson || !townsByKey || typeof featureCentroid !== 'function') {
            return [];
        }
        return twTownsGeoJson.features
            .map((f) => {
                const c = featureCentroid(f);
                const key = townAreaKey(f.properties);
                const raw = townsByKey[key];
                const label = formatPopulation(raw);
                if (!c || !label) return null;
                return {
                    type: 'Feature',
                    properties: { label },
                    geometry: { type: 'Point', coordinates: c },
                };
            })
            .filter(Boolean);
    }

    function populationLayoutBelowAdmin() {
        return {
            'text-anchor': 'top',
            'text-offset': [0, 0.85],
        };
    }

    function populationLayoutStandalone() {
        return {
            'text-anchor': 'center',
            'text-offset': [0, 0],
        };
    }

    function createPopulationLabelsApi({ mapColors, getTwTownsGeoJson, featureCentroid, getMapLayerState, setPopulationMeta }) {
        let populationCache = null;
        let loadPromise = null;

        function applyPopulationLayout(map) {
            if (!map.getLayer(LAYER_ID)) return;
            const adminOn = Boolean(getMapLayerState()?.adminLabels);
            const layout = adminOn ? populationLayoutBelowAdmin() : populationLayoutStandalone();
            map.setLayoutProperty(LAYER_ID, 'text-anchor', layout['text-anchor']);
            map.setLayoutProperty(LAYER_ID, 'text-offset', layout['text-offset']);
        }

        function ensurePopulationLabelLayer(map) {
            if (map.getLayer(LAYER_ID) || !getTwTownsGeoJson()) return;

            map.addSource(SOURCE_ID, {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            });
            map.addLayer({
                id: LAYER_ID,
                type: 'symbol',
                source: SOURCE_ID,
                minzoom: 8,
                layout: {
                    visibility: 'none',
                    'text-field': ['get', 'label'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 11, 10, 14, 11],
                    'text-anchor': 'center',
                    'text-offset': [0, 0],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                },
                paint: {
                    'text-color': mapColors.ink600,
                    'text-halo-color': 'rgba(255, 255, 255, 0.92)',
                    'text-halo-width': 1.2,
                },
            });
        }

        function updatePopulationSource(map, features) {
            const src = map.getSource(SOURCE_ID);
            if (!src) return;
            src.setData({ type: 'FeatureCollection', features: features || [] });
        }

        async function loadPopulationData() {
            if (populationCache) return populationCache;
            if (loadPromise) return loadPromise;
            loadPromise = fetchTownPopulationLatest()
                .then((data) => {
                    populationCache = data;
                    return data;
                })
                .finally(() => {
                    loadPromise = null;
                });
            return loadPromise;
        }

        async function refreshPopulationLabels(map) {
            if (!map || !getMapLayerState()?.populationLabels) return;
            ensurePopulationLabelLayer(map);
            if (!map.getLayer(LAYER_ID)) return;

            setPopulationMeta?.({ phase: 'loading' });
            try {
                const data = await loadPopulationData();
                const features = buildPopulationLabelFeatures(
                    getTwTownsGeoJson(),
                    data.towns,
                    featureCentroid
                );
                updatePopulationSource(map, features);
                applyPopulationLayout(map);
                setPopulationMeta?.({ phase: 'ready', data });
            } catch (err) {
                console.warn('[dashboard-map] 人口資料載入失敗', err);
                updatePopulationSource(map, []);
                setPopulationMeta?.({ phase: 'error' });
            }
        }

        function applyPopulationVisibility(map) {
            if (!map) return;
            ensurePopulationLabelLayer(map);
            if (!map.getLayer(LAYER_ID)) return;
            const visible = Boolean(getMapLayerState()?.populationLabels);
            map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
            if (visible) {
                applyPopulationLayout(map);
                return;
            }
            setPopulationMeta?.({ phase: 'idle' });
        }

        function onAdminLabelsChanged(map) {
            applyPopulationLayout(map);
        }

        return {
            LAYER_ID,
            ensurePopulationLabelLayer,
            refreshPopulationLabels,
            applyPopulationVisibility,
            onAdminLabelsChanged,
            applyPopulationLayout,
        };
    }

    global.DashboardMapPopulation = {
        LAYER_ID,
        normalizeAreaKey,
        townAreaKey,
        formatPopulation,
        formatRocYmLabel,
        formatPopulationSourceMeta,
        createPopulationLabelsApi,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
