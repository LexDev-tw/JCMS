/** 地圖總覽預覽：MapLibre + 案件統計 + 氣象圖層（無 Vue） */
(function () {
    'use strict';

    let root = null;
    let mapInstance = null;
    let twTownsGeoJson = null;
    let weatherApi = null;
    const caseStatsCharts = [];
    const breakdownCharts = [];
    const cumulativeCharts = [];
    const rowListeners = [];

    function q(id) {
        if (!root) return null;
        const raw = String(id).replace(/^#/, '');
        return root.querySelector(`#${raw}`);
    }

    function boot() {
        root = document.querySelector('.jcms-dash-map-view');
        if (!root) {
            console.warn('[dashboard-map-preview] 找不到 .jcms-dash-map-view');
            return;
        }

        const CHART = { ink: '#111111', muted: '#666666', accent: '#F05A28', grid: '#EAEAEA' };
        const MAP_COLORS = Object.freeze({
            surface: '#FFFFFF',
            panel: '#F7F7F5',
            ink900: '#111111',
            ink600: '#666666',
            ink400: '#999999',
            ink100: '#EAEAEA',
            accent: '#F05A28',
        });

        const MAP_STYLE = {
            version: 8,
            glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
            sources: {
                openmaptiles: {
                    type: 'vector',
                    url: 'https://tiles.openfreemap.org/planet',
                },
            },
            layers: [
                { id: 'background', type: 'background', paint: { 'background-color': MAP_COLORS.surface } },
                { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': MAP_COLORS.surface } },
                {
                    id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
                    paint: { 'fill-color': MAP_COLORS.panel, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.72, 10, 0.9, 14, 1] },
                },
                {
                    id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
                    paint: { 'fill-color': MAP_COLORS.ink100, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.12, 13, 0.28] },
                },
                {
                    id: 'road-detail-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': MAP_COLORS.ink600, 'line-opacity': 0.38, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 14, 0.9] },
                    filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'path']]],
                },
                {
                    id: 'transp-major-roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': MAP_COLORS.ink900, 'line-opacity': 0.82, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 10, 1.1, 14, 2.6] },
                    filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
                },
                {
                    id: 'transp-rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': MAP_COLORS.ink900, 'line-opacity': 0.72, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1, 14, 2] },
                    filter: ['==', ['get', 'class'], 'rail'],
                },
                {
                    id: 'transp-transit', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': MAP_COLORS.ink900, 'line-opacity': 0.68, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.2, 14, 2], 'line-dasharray': [2, 1.5] },
                    filter: ['==', ['get', 'class'], 'transit'],
                },
                {
                    id: 'transp-ferry', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': MAP_COLORS.ink600, 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1, 14, 1.5], 'line-dasharray': [4, 3] },
                    filter: ['==', ['get', 'class'], 'ferry'],
                },
                {
                    id: 'aeroway-airport-fill', type: 'fill', source: 'openmaptiles', 'source-layer': 'aeroway',
                    layout: { visibility: 'none' }, minzoom: 8,
                    paint: { 'fill-color': MAP_COLORS.ink100, 'fill-opacity': 0.45 },
                    filter: ['in', ['get', 'class'], ['literal', ['aerodrome', 'heliport', 'apron']]],
                },
                {
                    id: 'aeroway-airport-line', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway',
                    layout: { visibility: 'none' }, minzoom: 9,
                    paint: { 'line-color': MAP_COLORS.ink600, 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 12, 1, 14, 2] },
                    filter: ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]],
                },
                {
                    id: 'poi-harbor', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi',
                    layout: { visibility: 'none' }, minzoom: 9,
                    paint: {
                        'circle-color': MAP_COLORS.ink600, 'circle-opacity': 0.75,
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 12, 4, 14, 5],
                        'circle-stroke-color': MAP_COLORS.ink900, 'circle-stroke-width': 0.8,
                    },
                    filter: ['==', ['get', 'class'], 'harbor'],
                },
            ],
        };

        const TW_COUNTIES_TOPO_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json';
        const TW_TOWNS_TOPO_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json';
        const isExtendedWeatherPreview = root.dataset.weatherPreview === 'extended';
        const MAP_SETTINGS_STORAGE_KEY = isExtendedWeatherPreview
            ? 'jcms.dashboard-map-weather-preview.settings'
            : 'jcms.dashboard-map-preview.settings';
        const NORTH_TW_BOUNDS = [[120.35, 24.55], [122.05, 25.45]];
        const MAP_FIT_PADDING = { top: 420, bottom: 90, left: 200, right: 200 };

        const MOCK_MARKERS = [
            { lng: 121.551, lat: 25.093, title: '士林地方法院', color: MAP_COLORS.accent },
            { lng: 121.594, lat: 25.079, title: '內湖勘驗現場', color: MAP_COLORS.ink900 },
            { lng: 121.568, lat: 25.033, title: '信義區爭點路段', color: MAP_COLORS.ink900, line: true },
        ];

        const MOCK_BREAKDOWN = Object.freeze({
            word: [
                { label: '士補', count: 5, percentage: 100 },
                { label: '士簡', count: 4, percentage: 80 },
                { label: '士小', count: 2, percentage: 40 },
                { label: '其他', count: 1, percentage: 20 },
            ],
            reason: [
                { label: '損害賠償', count: 4, percentage: 80 },
                { label: '給付票款', count: 3, percentage: 60 },
                { label: '返還得利', count: 2, percentage: 40 },
                { label: '確認債權', count: 2, percentage: 40 },
            ],
        });

        const MOCK_DASH_STATS = Object.freeze({
            cumulativeReceived: 20,
            cumulativeClosed: 8,
        });

        let breakdownMode = 'word';
        let ro = null;

        function loadPersistedMapSettings() {
            try {
                const raw = localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
                if (!raw) return null;
                const data = JSON.parse(raw);
                return data && typeof data === 'object' ? data : null;
            } catch (err) {
                console.warn('[dashboard-map-preview] 讀取地圖設定失敗', err);
                return null;
            }
        }

        function persistMapSettings() {
            try {
                localStorage.setItem(
                    MAP_SETTINGS_STORAGE_KEY,
                    JSON.stringify({
                        adminLabels: mapLayerState.adminLabels,
                        majorTransport: mapLayerState.majorTransport,
                        detailTransport: mapLayerState.detailTransport,
                        rainAdvisory: mapLayerState.rainAdvisory,
                        satelliteCloud: mapLayerState.satelliteCloud,
                        radarEcho: mapLayerState.radarEcho,
                        defaultView: mapLayerState.defaultView,
                    })
                );
            } catch (err) {
                console.warn('[dashboard-map-preview] 儲存地圖設定失敗', err);
            }
        }

        const persistedMapSettings = loadPersistedMapSettings();

        function normalizeDefaultView(view) {
            if (!view || typeof view !== 'object') return null;
            const center = view.center;
            const zoom = Number(view.zoom);
            if (!Array.isArray(center) || center.length < 2) return null;
            const lng = Number(center[0]);
            const lat = Number(center[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(zoom)) return null;
            return { center: [lng, lat], zoom };
        }

        const mapLayerState = {
            adminLabels: Boolean(persistedMapSettings?.adminLabels),
            majorTransport: Boolean(persistedMapSettings?.majorTransport),
            detailTransport: Boolean(persistedMapSettings?.detailTransport),
            rainAdvisory: persistedMapSettings?.rainAdvisory !== undefined
                ? Boolean(persistedMapSettings.rainAdvisory)
                : !isExtendedWeatherPreview,
            satelliteCloud: persistedMapSettings?.satelliteCloud !== undefined
                ? Boolean(persistedMapSettings.satelliteCloud)
                : !isExtendedWeatherPreview,
            radarEcho: persistedMapSettings?.radarEcho !== undefined
                ? Boolean(persistedMapSettings.radarEcho)
                : isExtendedWeatherPreview,
            defaultView: normalizeDefaultView(persistedMapSettings?.defaultView),
        };

        const LAYER_IDS = Object.freeze({
            adminLabels: 'tw-town-labels',
            countyBoundaries: 'tw-county-boundaries',
            townBoundaries: 'tw-town-boundaries',
            detailRoads: 'road-detail-minor',
            rainAdvisoryFill: 'cwa-rain-advisory-fill',
            rainAdvisoryLine: 'cwa-rain-advisory-line',
            satelliteCloud: 'cwa-satellite-cloud',
            radarEcho: 'cwa-radar-echo',
        });

        const MAJOR_TRANSPORT_LAYER_IDS = Object.freeze([
            'transp-major-roads', 'transp-rail', 'transp-transit', 'transp-ferry',
            'aeroway-airport-fill', 'aeroway-airport-line', 'poi-harbor',
        ]);

        function setWeatherMeta(message) {
            const el = q('map-weather-meta');
            if (el) el.textContent = message || '';
        }

        if (typeof DashboardMapWeather !== 'undefined') {
            weatherApi = DashboardMapWeather.createWeatherLayersApi({
                mapColors: MAP_COLORS,
                layerIds: LAYER_IDS,
                getTwTownsGeoJson: () => twTownsGeoJson,
                getMapLayerState: () => mapLayerState,
                setWeatherMeta,
            });
        }

        function applyDefaultMapView(map, { animate = false } = {}) {
            if (mapLayerState.defaultView) {
                map.jumpTo({
                    center: mapLayerState.defaultView.center,
                    zoom: mapLayerState.defaultView.zoom,
                    duration: animate ? 320 : 0,
                });
                return;
            }
            map.fitBounds(NORTH_TW_BOUNDS, {
                padding: MAP_FIT_PADDING,
                maxZoom: 10,
                duration: animate ? 320 : 0,
            });
        }

        function ringCentroid(ring) {
            if (!ring || ring.length < 3) return null;
            let sx = 0;
            let sy = 0;
            const n = ring.length - 1;
            for (let i = 0; i < n; i += 1) {
                sx += ring[i][0];
                sy += ring[i][1];
            }
            return [sx / n, sy / n];
        }

        function featureCentroid(feature) {
            const g = feature && feature.geometry;
            if (!g) return null;
            if (g.type === 'Polygon') return ringCentroid(g.coordinates[0]);
            if (g.type === 'MultiPolygon') {
                let best = null;
                let max = 0;
                g.coordinates.forEach((poly) => {
                    const ring = poly[0];
                    if (ring && ring.length > max) {
                        max = ring.length;
                        best = ring;
                    }
                });
                return ringCentroid(best);
            }
            return null;
        }

        async function loadTaiwanAdminBoundaries(map) {
            if (map.getSource('tw-towns')) return;
            const [countyRes, townRes] = await Promise.all([
                fetch(TW_COUNTIES_TOPO_URL),
                fetch(TW_TOWNS_TOPO_URL),
            ]);
            if (!countyRes.ok) throw new Error(`county boundaries HTTP ${countyRes.status}`);
            if (!townRes.ok) throw new Error(`town boundaries HTTP ${townRes.status}`);
            const countyTopo = await countyRes.json();
            const townTopo = await townRes.json();
            const counties = topojson.feature(countyTopo, countyTopo.objects.counties);
            const towns = topojson.feature(townTopo, townTopo.objects.towns);
            twTownsGeoJson = towns;
            map.addSource('tw-counties', { type: 'geojson', data: counties });
            map.addLayer({
                id: LAYER_IDS.countyBoundaries,
                type: 'line',
                source: 'tw-counties',
                minzoom: 6,
                paint: {
                    'line-color': MAP_COLORS.accent,
                    'line-opacity': 0.88,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.15, 10, 1.45, 14, 1.85],
                },
            });
            map.addSource('tw-towns', { type: 'geojson', data: towns });
            map.addLayer({
                id: LAYER_IDS.townBoundaries,
                type: 'line',
                source: 'tw-towns',
                minzoom: 7,
                paint: {
                    'line-color': MAP_COLORS.accent,
                    'line-opacity': 0.88,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 11, 0.85, 14, 1.1],
                    'line-dasharray': [3, 2],
                },
            });
        }

        function ensureAdminLabelLayer(map) {
            if (map.getLayer(LAYER_IDS.adminLabels) || !twTownsGeoJson) return;
            const labelFeatures = twTownsGeoJson.features
                .map((f) => {
                    const c = featureCentroid(f);
                    const name = String((f.properties && f.properties.TOWNNAME) || '').trim();
                    if (!c || !name) return null;
                    return {
                        type: 'Feature',
                        properties: { name },
                        geometry: { type: 'Point', coordinates: c },
                    };
                })
                .filter(Boolean);
            map.addSource('tw-town-labels', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: labelFeatures },
            });
            map.addLayer({
                id: LAYER_IDS.adminLabels,
                type: 'symbol',
                source: 'tw-town-labels',
                minzoom: 8,
                layout: {
                    visibility: 'none',
                    'text-field': ['get', 'name'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 11, 11, 14, 12],
                    'text-anchor': 'center',
                    'text-letter-spacing': 0.04,
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                },
                paint: {
                    'text-color': MAP_COLORS.ink900,
                    'text-halo-color': 'rgba(255, 255, 255, 0.92)',
                    'text-halo-width': 1.4,
                },
            });
        }

        function raiseAdminLabelLayer(map) {
            if (!map.getLayer(LAYER_IDS.adminLabels)) return;
            try { map.moveLayer(LAYER_IDS.adminLabels); } catch (_) { /* ignore */ }
        }

        function applyMapLayerVisibility() {
            if (!mapInstance) return;
            ensureAdminLabelLayer(mapInstance);
            if (mapInstance.getLayer(LAYER_IDS.adminLabels)) {
                mapInstance.setLayoutProperty(
                    LAYER_IDS.adminLabels,
                    'visibility',
                    mapLayerState.adminLabels ? 'visible' : 'none'
                );
                if (mapLayerState.adminLabels) raiseAdminLabelLayer(mapInstance);
            }
            MAJOR_TRANSPORT_LAYER_IDS.forEach((layerId) => {
                if (!mapInstance.getLayer(layerId)) return;
                mapInstance.setLayoutProperty(
                    layerId,
                    'visibility',
                    mapLayerState.majorTransport ? 'visible' : 'none'
                );
            });
            if (mapInstance.getLayer(LAYER_IDS.detailRoads)) {
                mapInstance.setLayoutProperty(
                    LAYER_IDS.detailRoads,
                    'visibility',
                    mapLayerState.detailTransport ? 'visible' : 'none'
                );
            }
        }

        function applyWeatherLayerVisibility() {
            if (!mapInstance || !weatherApi) return;
            weatherApi.refreshWeatherLayers(mapInstance)
                .then(() => weatherApi.scheduleWeatherRefresh(mapInstance, () => true))
                .catch(() => { /* ignore */ });
        }

        function syncMapLayerSwitch(input) {
            if (!input) return;
            input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
        }

        function syncDetailTransportAvailability() {
            const majorTransportInput = q('map-toggle-major-transport');
            const detailTransportInput = q('map-toggle-detail-transport');
            const detailLabel = root.querySelector('.map-layer-switch--detail');
            if (!majorTransportInput || !detailTransportInput) return;
            const majorOn = majorTransportInput.checked;
            detailTransportInput.disabled = !majorOn;
            if (detailLabel) detailLabel.classList.toggle('map-layer-switch--disabled', !majorOn);
            if (!majorOn && detailTransportInput.checked) {
                detailTransportInput.checked = false;
                mapLayerState.detailTransport = false;
                syncMapLayerSwitch(detailTransportInput);
                applyMapLayerVisibility();
                persistMapSettings();
            }
        }

        function bindMapLayerToggles() {
            const adminInput = q('map-toggle-admin-labels');
            const majorTransportInput = q('map-toggle-major-transport');
            const detailTransportInput = q('map-toggle-detail-transport');
            const rainInput = q('map-toggle-rain-advisory');
            const satelliteInput = q('map-toggle-satellite-cloud');
            const radarInput = q('map-toggle-radar-echo');
            if (!adminInput || !majorTransportInput || !detailTransportInput) return;

            adminInput.checked = mapLayerState.adminLabels;
            majorTransportInput.checked = mapLayerState.majorTransport;
            detailTransportInput.checked = mapLayerState.detailTransport;
            if (rainInput) rainInput.checked = mapLayerState.rainAdvisory;
            if (satelliteInput) satelliteInput.checked = mapLayerState.satelliteCloud;
            if (radarInput) radarInput.checked = mapLayerState.radarEcho;
            syncMapLayerSwitch(adminInput);
            syncMapLayerSwitch(majorTransportInput);
            syncMapLayerSwitch(detailTransportInput);
            if (rainInput) syncMapLayerSwitch(rainInput);
            if (satelliteInput) syncMapLayerSwitch(satelliteInput);
            if (radarInput) syncMapLayerSwitch(radarInput);
            syncDetailTransportAvailability();

            adminInput.addEventListener('change', () => {
                mapLayerState.adminLabels = adminInput.checked;
                syncMapLayerSwitch(adminInput);
                applyMapLayerVisibility();
                persistMapSettings();
            });
            majorTransportInput.addEventListener('change', () => {
                mapLayerState.majorTransport = majorTransportInput.checked;
                syncMapLayerSwitch(majorTransportInput);
                syncDetailTransportAvailability();
                applyMapLayerVisibility();
                persistMapSettings();
            });
            detailTransportInput.addEventListener('change', () => {
                if (detailTransportInput.disabled) return;
                mapLayerState.detailTransport = detailTransportInput.checked;
                syncMapLayerSwitch(detailTransportInput);
                applyMapLayerVisibility();
                persistMapSettings();
            });
            if (rainInput) {
                rainInput.addEventListener('change', () => {
                    mapLayerState.rainAdvisory = rainInput.checked;
                    syncMapLayerSwitch(rainInput);
                    applyWeatherLayerVisibility();
                    persistMapSettings();
                });
            }
            if (satelliteInput) {
                satelliteInput.addEventListener('change', () => {
                    mapLayerState.satelliteCloud = satelliteInput.checked;
                    syncMapLayerSwitch(satelliteInput);
                    applyWeatherLayerVisibility();
                    persistMapSettings();
                });
            }
            if (radarInput) {
                radarInput.addEventListener('change', () => {
                    mapLayerState.radarEcho = radarInput.checked;
                    syncMapLayerSwitch(radarInput);
                    applyWeatherLayerVisibility();
                    persistMapSettings();
                });
            }
        }

        function showWorkMapSettingsStatus(message) {
            const statusEl = q('work-map-settings-status');
            if (!statusEl) return;
            statusEl.textContent = message;
            if (!message) return;
            window.clearTimeout(showWorkMapSettingsStatus._timer);
            showWorkMapSettingsStatus._timer = window.setTimeout(() => {
                statusEl.textContent = '';
            }, 2800);
        }

        function bindWorkMapToolbar() {
            const defaultViewBtn = q('map-set-default-view');
            const restoreViewBtn = q('map-restore-default-view');
            if (defaultViewBtn) {
                defaultViewBtn.addEventListener('click', () => {
                    if (!mapInstance) return;
                    const center = mapInstance.getCenter();
                    mapLayerState.defaultView = {
                        center: [center.lng, center.lat],
                        zoom: mapInstance.getZoom(),
                    };
                    persistMapSettings();
                    showWorkMapSettingsStatus('已儲存預設視圖');
                });
            }
            if (restoreViewBtn) {
                restoreViewBtn.addEventListener('click', () => {
                    if (!mapInstance) return;
                    applyDefaultMapView(mapInstance, { animate: true });
                    showWorkMapSettingsStatus(
                        mapLayerState.defaultView ? '已回到預設視圖' : '已回到預設範圍'
                    );
                });
            }
        }

        function createRowBar(canvas, percentage, color) {
            return new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: [''],
                    datasets: [{
                        data: [percentage],
                        backgroundColor: color,
                        barThickness: 2,
                        maxBarThickness: 2,
                        borderSkipped: false,
                        borderRadius: 0,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    animation: { duration: 220 },
                    datasets: { bar: { grouped: false, categoryPercentage: 1, barPercentage: 1 } },
                    layout: { padding: 0 },
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: { min: 0, max: 100, display: false, grid: { display: false }, border: { display: false } },
                        y: { display: false, grid: { display: false }, border: { display: false } },
                    },
                },
            });
        }

        function clearRowListeners() {
            rowListeners.forEach(({ row, enter, leave }) => {
                row.removeEventListener('mouseenter', enter);
                row.removeEventListener('mouseleave', leave);
            });
            rowListeners.length = 0;
        }

        function bindBarHover(row, chart, baseColor) {
            const enter = () => {
                chart.data.datasets[0].backgroundColor = CHART.accent;
                chart.update('none');
            };
            const leave = () => {
                chart.data.datasets[0].backgroundColor = baseColor;
                chart.update('none');
            };
            row.addEventListener('mouseenter', enter);
            row.addEventListener('mouseleave', leave);
            rowListeners.push({ row, enter, leave });
        }

        function destroyBreakdownCharts() {
            while (breakdownCharts.length) {
                const c = breakdownCharts.pop();
                if (c) c.destroy();
            }
        }

        function destroyCumulativeCharts() {
            while (cumulativeCharts.length) {
                const c = cumulativeCharts.pop();
                if (c) c.destroy();
            }
        }

        function syncBreakdownCharts() {
            if (typeof Chart === 'undefined') return;
            destroyBreakdownCharts();
            const slots = MOCK_BREAKDOWN[breakdownMode] || [];
            root.querySelectorAll('[data-dash-breakdown-canvas]').forEach((canvas) => {
                const idx = Number(canvas.dataset.idx);
                const item = slots[idx];
                if (!item) return;
                const row = canvas.closest('.dash-breakdown-row');
                if (!row || row.classList.contains('dash-breakdown-row--placeholder')) return;
                const labelEl = row.querySelector('.dash-breakdown-label__title');
                const countEl = row.querySelector('.dash-map-block-text--count');
                if (labelEl) {
                    labelEl.textContent = item.label;
                    labelEl.setAttribute('title', item.label);
                }
                if (countEl) countEl.textContent = String(item.count);
                canvas.setAttribute('aria-label', `${item.label} ${item.count}`);
                const chart = createRowBar(canvas, item.percentage, CHART.ink);
                breakdownCharts.push(chart);
                bindBarHover(row, chart, CHART.ink);
            });
        }

        function syncCumulativeCharts() {
            if (typeof Chart === 'undefined') return;
            destroyCumulativeCharts();
            const items = [
                { count: MOCK_DASH_STATS.cumulativeReceived, accent: true },
                { count: MOCK_DASH_STATS.cumulativeClosed, accent: false },
            ];
            const maxVal = Math.max(...items.map((it) => it.count), 1);
            root.querySelectorAll('[data-dash-cumulative-canvas]').forEach((canvas) => {
                const idx = Number(canvas.dataset.idx);
                const item = items[idx];
                if (!item) return;
                const row = canvas.closest('.dash-cum-metric-row, .dash-breakdown-row');
                if (!row) return;
                const pct = Math.min(100, Math.round((item.count / maxVal) * 100));
                const color = item.accent ? CHART.accent : CHART.ink;
                const chart = createRowBar(canvas, pct, color);
                cumulativeCharts.push(chart);
                bindBarHover(row, chart, color);
            });
        }

        function bindBreakdownSeg() {
            const seg = root.querySelector('.dash-breakdown-seg');
            if (!seg) return;
            const thumb = seg.querySelector('.dash-breakdown-seg__thumb');
            const btns = [...seg.querySelectorAll('.dash-breakdown-seg__btn')];
            btns.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const next = btn.textContent.trim() === '字別' ? 'word' : 'reason';
                    if (next === breakdownMode) return;
                    breakdownMode = next;
                    btns.forEach((b) => {
                        const active = (b.textContent.trim() === '字別' && next === 'word')
                            || (b.textContent.trim() === '案由' && next === 'reason');
                        b.classList.toggle('dash-breakdown-seg__btn--active', active);
                        b.setAttribute('aria-pressed', active ? 'true' : 'false');
                    });
                    if (thumb) thumb.classList.toggle('dash-breakdown-seg__thumb--right', next === 'reason');
                    clearRowListeners();
                    syncBreakdownCharts();
                    syncTopKpiLayoutWidths();
                });
            });
        }

        function syncTopRightChartsWidth() {
            const anchor = q('dash-kpi-right-anchor');
            const notProceeding = q('dash-kpi-not-proceeding');
            const charts = q('dash-top-right-charts');
            const column = root.querySelector('.dash-top-right-column');
            if (!anchor || !charts || !column) return;
            const anchorRect = anchor.getBoundingClientRect();
            const rightRect = (notProceeding || anchor).getBoundingClientRect();
            const baseW = Math.max(0, Math.ceil(rightRect.right - anchorRect.left));
            const scaleRaw = getComputedStyle(column).getPropertyValue('--dash-right-block-scale').trim();
            const scale = Number.parseFloat(scaleRaw) || 1.5;
            const w = Math.ceil(baseW * scale);
            const extra = w - baseW;
            column.style.width = `${w}px`;
            column.style.maxWidth = `${w}px`;
            column.style.marginLeft = extra > 0 ? `${-extra}px` : '0';
            charts.style.width = '100%';
            charts.style.maxWidth = '100%';
        }

        function syncTopLeftBodyWidth() {
            const anchor = q('dash-kpi-left-anchor');
            const unresolved = q('dash-kpi-unresolved');
            const body = q('dash-top-left-body');
            const statsMain = q('dash-top-stats-main');
            const statsRow = root.querySelector('.dash-top-stats-row');
            const todo = root.querySelector('.dash-map-todo-block');
            const column = root.querySelector('.dash-top-left-column');
            if (!anchor || !body) return;
            const anchorRect = anchor.getBoundingClientRect();
            const rightRect = (unresolved || anchor).getBoundingClientRect();
            const pairW = Math.max(0, Math.ceil(rightRect.right - anchorRect.left));
            let totalW = pairW;
            if (statsMain) {
                statsMain.style.width = `${pairW}px`;
                statsMain.style.maxWidth = `${pairW}px`;
                statsMain.style.setProperty('--dash-stats-pair-w', `${pairW}px`);
            }
            if (statsRow && todo) {
                const rowStyle = getComputedStyle(statsRow);
                const rowGap = Number.parseFloat(rowStyle.gap) || Number.parseFloat(rowStyle.columnGap) || 16;
                const todoW = todo.offsetWidth || Number.parseFloat(rowStyle.getPropertyValue('--dash-map-todo-w')) || 148.8;
                totalW = pairW + rowGap + todoW;
            }
            [column, body].forEach((el) => {
                if (!el) return;
                el.style.width = `${Math.ceil(totalW)}px`;
                el.style.maxWidth = `${Math.ceil(totalW)}px`;
            });
        }

        function syncDetailEntryPosition() {
            const entry = root.querySelector('.dash-map-detail-entry');
            const unresolved = q('dash-kpi-unresolved');
            const proceeding = q('dash-kpi-proceeding');
            const row = root.querySelector('.dash-kpi-top-row');
            if (!entry || !unresolved || !proceeding || !row) return;
            const u = unresolved.getBoundingClientRect();
            const p = proceeding.getBoundingClientRect();
            const r = row.getBoundingClientRect();
            const centerX = (u.right + p.left) / 2 - r.left;
            entry.style.left = `${Math.round(centerX)}px`;
            entry.style.transform = 'translateX(-50%)';
        }

        function syncTopKpiLayoutWidths() {
            syncTopLeftBodyWidth();
            syncTopRightChartsWidth();
            syncDetailEntryPosition();
            caseStatsCharts.forEach((c) => c && c.resize());
            breakdownCharts.forEach((c) => c && c.resize());
            cumulativeCharts.forEach((c) => c && c.resize());
        }

        function bindTopLeftWidthSync() {
            const anchor = q('dash-kpi-left-anchor');
            const unresolved = q('dash-kpi-unresolved');
            if (!anchor || typeof ResizeObserver === 'undefined') return;
            if (ro) ro.disconnect();
            ro = new ResizeObserver(() => {
                syncTopLeftBodyWidth();
                syncTopRightChartsWidth();
                syncDetailEntryPosition();
            });
            ro.observe(anchor);
            if (unresolved) ro.observe(unresolved);
            const statsMain = q('dash-top-stats-main');
            const todo = root.querySelector('.dash-map-todo-block');
            if (statsMain) ro.observe(statsMain);
            if (todo) ro.observe(todo);
            const rightAnchor = q('dash-kpi-right-anchor');
            const proceeding = q('dash-kpi-proceeding');
            const notProceeding = q('dash-kpi-not-proceeding');
            if (rightAnchor) ro.observe(rightAnchor);
            if (proceeding) ro.observe(proceeding);
            if (notProceeding) ro.observe(notProceeding);
        }

        /** —— 案件統計圖表 —— */
        const CHART_PALETTE = ['#111111', '#666666', '#F05A28', '#999999', '#FCA311'];
        const CHART_TYPE_COLORS = Object.freeze({ 士補: '#111111', 士簡: '#666666', 士小: '#F05A28' });
        const CHART_BAR_SLIM = Object.freeze({ barPercentage: 0.28, categoryPercentage: 0.58, maxBarThickness: 14 });
        const CASE_CHART_LAYOUT = Object.freeze({
            yAxisWidth: 36, xAxisHeight: 32,
            padding: { top: 4, right: 6, bottom: 0, left: 0 },
            xTickPadding: 3, xMaxTicksLimit: 12,
        });
        const CASE_CHART_MONTHS = 12;

        const MOCK_CASE_STATS = Object.freeze({
            groupLabels: ['士補', '士簡', '士小'],
            settlementRows: [
                { ym: '11310', carryOver: 9, newIntake: 4, closed: 3 },
                { ym: '11311', carryOver: 10, newIntake: 3, closed: 2 },
                { ym: '11312', carryOver: 11, newIntake: 5, closed: 4 },
                { ym: '11401', carryOver: 12, newIntake: 2, closed: 3 },
                { ym: '11402', carryOver: 11, newIntake: 4, closed: 2 },
                { ym: '11403', carryOver: 13, newIntake: 4, closed: 3 },
            ],
            newCaseStats: [
                { ym: '11310', groupLabel: '士補', count: 2 },
                { ym: '11310', groupLabel: '士簡', count: 1 },
                { ym: '11310', groupLabel: '士小', count: 1 },
                { ym: '11311', groupLabel: '士簡', count: 2 },
                { ym: '11312', groupLabel: '士補', count: 3 },
                { ym: '11402', groupLabel: '士補', count: 2 },
                { ym: '11403', groupLabel: '士小', count: 1 },
            ],
        });

        function csNormalizeRocMonth5(s) {
            return String(s || '').replace(/\D/g, '').slice(0, 5);
        }

        function csFormatYmLabel(ym) {
            const s = csNormalizeRocMonth5(ym);
            if (s.length !== 5) return s || '—';
            return `${s.slice(0, 3)}/${s.slice(3, 5)}`;
        }

        function csParseCount(raw) {
            const n = parseInt(String(raw || '').replace(/,/g, ''), 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        }

        function csCalcPending(row) {
            return csParseCount(row.carryOver) + csParseCount(row.newIntake) - csParseCount(row.closed);
        }

        function csGetCurrentRocMonth5() {
            const now = new Date();
            const ry = now.getFullYear() - 1911;
            const m = now.getMonth() + 1;
            return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
        }

        function csGetPreviousRocMonth5(ym) {
            const s = csNormalizeRocMonth5(ym);
            if (s.length !== 5) return '';
            let ry = parseInt(s.slice(0, 3), 10);
            let m = parseInt(s.slice(3, 5), 10);
            m -= 1;
            if (m < 1) { m = 12; ry -= 1; }
            if (ry < 0) return '';
            return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
        }

        function csBuildLast12Months() {
            const months = [];
            let ym = csGetCurrentRocMonth5();
            for (let i = 0; i < CASE_CHART_MONTHS; i += 1) {
                months.unshift(ym);
                const prev = csGetPreviousRocMonth5(ym);
                if (!prev) break;
                ym = prev;
            }
            return months;
        }

        function csGroupChartColor(label, index) {
            if (CHART_TYPE_COLORS[label]) return CHART_TYPE_COLORS[label];
            return CHART_PALETTE[index % CHART_PALETTE.length];
        }

        function csChartAxisOptions() {
            return {
                x: {
                    title: { display: false },
                    ticks: {
                        color: CHART.muted,
                        font: { size: 9, family: 'ui-monospace, monospace' },
                        padding: CASE_CHART_LAYOUT.xTickPadding,
                        maxRotation: 0, minRotation: 0, autoSkip: true,
                        maxTicksLimit: CASE_CHART_LAYOUT.xMaxTicksLimit,
                    },
                    grid: { color: CHART.grid, drawBorder: false },
                    afterFit(scale) { scale.height = CASE_CHART_LAYOUT.xAxisHeight; },
                },
                y: {
                    beginAtZero: true,
                    title: { display: false },
                    ticks: { color: CHART.muted, font: { size: 9, family: 'ui-monospace, monospace' } },
                    grid: { color: CHART.grid, drawBorder: false },
                    afterFit(scale) { scale.width = CASE_CHART_LAYOUT.yAxisWidth; },
                },
            };
        }

        function destroyCaseStatsCharts() {
            while (caseStatsCharts.length) {
                const c = caseStatsCharts.pop();
                if (c) c.destroy();
            }
        }

        function buildIntakeChartConfig(chartMonths, chartMonthLabels, newCaseStats, groupLabels) {
            if (!chartMonths.length || !groupLabels.length) return null;
            const datasets = groupLabels.map((label, idx) => ({
                label,
                data: chartMonths.map((ym) =>
                    newCaseStats
                        .filter((r) => csNormalizeRocMonth5(r.ym) === ym && r.groupLabel === label)
                        .reduce((sum, r) => sum + r.count, 0)
                ),
                backgroundColor: csGroupChartColor(label, idx),
                borderRadius: 0,
                stack: 'intake',
                ...CHART_BAR_SLIM,
            }));
            const chartBaseOptions = {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { ...CASE_CHART_LAYOUT.padding } },
                plugins: { legend: { display: false } },
            };
            const axis = csChartAxisOptions();
            return {
                type: 'bar',
                data: { labels: chartMonthLabels, datasets },
                options: {
                    ...chartBaseOptions,
                    datasets: { bar: { ...CHART_BAR_SLIM } },
                    scales: { ...axis, x: { ...axis.x, stacked: true }, y: { ...axis.y, stacked: true } },
                },
            };
        }

        function buildSettlementChartConfig(chartMonths, chartMonthLabels, settlementRows) {
            if (!chartMonths.length) return null;
            const settlementByYm = new Map();
            for (const r of settlementRows) settlementByYm.set(csNormalizeRocMonth5(r.ym), r);
            const pendingValues = chartMonths.map((ym) => {
                const row = settlementByYm.get(ym);
                return row ? csCalcPending(row) : 0;
            });
            const chartBaseOptions = {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { ...CASE_CHART_LAYOUT.padding } },
                plugins: { legend: { display: false } },
            };
            return {
                type: 'bar',
                data: {
                    labels: chartMonthLabels,
                    datasets: [
                        {
                            type: 'bar', label: '未結', data: pendingValues,
                            backgroundColor: CHART.ink, borderColor: CHART.ink, borderWidth: 0,
                            borderRadius: 0, order: 2, ...CHART_BAR_SLIM,
                        },
                        {
                            type: 'line', label: '新收',
                            data: chartMonths.map((ym) => csParseCount(settlementByYm.get(ym)?.newIntake)),
                            borderColor: CHART.muted, backgroundColor: CHART.muted,
                            borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 3.5,
                            tension: 0.2, fill: false, order: 1,
                        },
                        {
                            type: 'line', label: '已結',
                            data: chartMonths.map((ym) => csParseCount(settlementByYm.get(ym)?.closed)),
                            borderColor: CHART.accent, backgroundColor: CHART.accent,
                            borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 3.5,
                            tension: 0.2, fill: false, order: 0,
                        },
                    ],
                },
                options: {
                    ...chartBaseOptions,
                    datasets: { bar: { ...CHART_BAR_SLIM } },
                    scales: csChartAxisOptions(),
                },
            };
        }

        function renderCaseStatsCharts(data) {
            if (typeof Chart === 'undefined') return;
            destroyCaseStatsCharts();
            const { settlementRows, newCaseStats, groupLabels } = data;
            const chartMonths = csBuildLast12Months();
            const chartMonthLabels = chartMonths.map(csFormatYmLabel);
            const intakeCanvas = q('chart-intake');
            const settlementCanvas = q('chart-settlement');
            const intakeCfg = buildIntakeChartConfig(chartMonths, chartMonthLabels, newCaseStats, groupLabels);
            const settlementCfg = buildSettlementChartConfig(chartMonths, chartMonthLabels, settlementRows);
            if (intakeCanvas && intakeCfg) caseStatsCharts.push(new Chart(intakeCanvas, intakeCfg));
            if (settlementCanvas && settlementCfg) caseStatsCharts.push(new Chart(settlementCanvas, settlementCfg));
            syncTopKpiLayoutWidths();
        }

        function csGetApiBase() {
            if (typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()) {
                const s = window.JCMS_API_BASE.trim().replace(/\/+$/, '');
                return /\/api$/i.test(s) ? s : `${s}/api`;
            }
            if (window.location.port === '3000') return '/api';
            return 'http://127.0.0.1:3000/api';
        }

        async function loadCaseStatsDashboardData() {
            const workspaceId = 'WS_001';
            let settlementRows = [];
            let newCaseStats = [];
            let groupLabels = [...MOCK_CASE_STATS.groupLabels];
            try {
                const raw = localStorage.getItem('jcms_case_stats_v1');
                if (raw) {
                    const blob = JSON.parse(raw);
                    const rows = blob?.byWorkspace?.[workspaceId]?.settlementRows;
                    if (Array.isArray(rows) && rows.length) settlementRows = rows;
                }
            } catch (_) { /* ignore */ }
            try {
                const base = csGetApiBase();
                const [statsRes, casesRes] = await Promise.all([
                    fetch(`${base}/case-stats`).catch(() => null),
                    fetch(`${base}/cases`).catch(() => null),
                ]);
                if (statsRes?.ok) {
                    const j = await statsRes.json();
                    const rows = j?.data?.byWorkspace?.[workspaceId]?.settlementRows;
                    if (j?.success && Array.isArray(rows) && rows.length) settlementRows = rows;
                }
            } catch (_) { /* 離線預覽 */ }
            if (!settlementRows.length && !newCaseStats.length) {
                return {
                    settlementRows: [...MOCK_CASE_STATS.settlementRows],
                    newCaseStats: [...MOCK_CASE_STATS.newCaseStats],
                    groupLabels: [...MOCK_CASE_STATS.groupLabels],
                };
            }
            return { settlementRows, newCaseStats, groupLabels };
        }

        function initCaseStatsCharts() {
            renderCaseStatsCharts({
                settlementRows: [...MOCK_CASE_STATS.settlementRows],
                newCaseStats: [...MOCK_CASE_STATS.newCaseStats],
                groupLabels: [...MOCK_CASE_STATS.groupLabels],
            });
            loadCaseStatsDashboardData()
                .then(renderCaseStatsCharts)
                .catch(() => { /* 維持 mock */ });
        }

        function initMap() {
            const mapCanvas = root.querySelector('#dash-map-canvas');
            if (!mapCanvas) {
                console.warn('[dashboard-map-preview] 找不到 #dash-map-canvas');
                return;
            }
            if (typeof maplibregl === 'undefined') {
                console.warn('[dashboard-map-preview] MapLibre GL 未載入');
                return;
            }
            const initialCenter = mapLayerState.defaultView?.center ?? [121.55, 25.05];
            const initialZoom = mapLayerState.defaultView?.zoom ?? 9.2;
            mapInstance = new maplibregl.Map({
                container: mapCanvas,
                style: MAP_STYLE,
                center: initialCenter,
                zoom: initialZoom,
                minZoom: 7,
                maxZoom: 16,
                attributionControl: true,
            });
            mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
            mapInstance.on('load', async () => {
                try {
                    await loadTaiwanAdminBoundaries(mapInstance);
                } catch (err) {
                    console.warn('[dashboard-map-preview] 鄉鎮市區界載入失敗', err);
                }
                if (weatherApi) {
                    weatherApi.ensureRainAdvisoryLayers(mapInstance);
                    weatherApi.ensureSatelliteLayer(mapInstance);
                    weatherApi.ensureRadarLayer(mapInstance);
                }
                MOCK_MARKERS.forEach((m) => {
                    if (m.line) {
                        mapInstance.addSource(`route-${m.title}`, {
                            type: 'geojson',
                            data: {
                                type: 'Feature',
                                geometry: {
                                    type: 'LineString',
                                    coordinates: [
                                        [m.lng - 0.012, m.lat - 0.006],
                                        [m.lng, m.lat],
                                        [m.lng + 0.015, m.lat + 0.004],
                                    ],
                                },
                            },
                        });
                        mapInstance.addLayer({
                            id: `route-layer-${m.title}`,
                            type: 'line',
                            source: `route-${m.title}`,
                            paint: {
                                'line-color': MAP_COLORS.accent,
                                'line-width': 2.5,
                                'line-opacity': 0.88,
                            },
                        });
                        return;
                    }
                    const el = document.createElement('div');
                    el.className = 'w-3 h-3 rounded-full border-2 border-surface';
                    el.style.backgroundColor = m.color;
                    el.style.boxShadow = '0 2px 8px 0 rgba(0, 0, 0, 0.08)';
                    el.title = m.title;
                    new maplibregl.Marker({ element: el, anchor: 'center' })
                        .setLngLat([m.lng, m.lat])
                        .setPopup(
                            new maplibregl.Popup({ offset: 12, closeButton: false })
                                .setHTML(`<p style="margin:0;font-size:11px;font-weight:700;color:#111">${m.title}</p>`)
                        )
                        .addTo(mapInstance);
                });
                ensureAdminLabelLayer(mapInstance);
                applyMapLayerVisibility();
                if (weatherApi) {
                    try {
                        await weatherApi.refreshWeatherLayers(mapInstance);
                        weatherApi.scheduleWeatherRefresh(mapInstance, () => true);
                    } catch (err) {
                        console.warn('[dashboard-map-preview] 氣象圖層載入失敗', err);
                    }
                }
                applyDefaultMapView(mapInstance);
                mapInstance.resize();
            });
            window.addEventListener('resize', () => {
                if (mapInstance) mapInstance.resize();
            });
        }

        bindMapLayerToggles();
        bindWorkMapToolbar();
        bindBreakdownSeg();
        clearRowListeners();
        syncCumulativeCharts();
        syncBreakdownCharts();
        bindTopLeftWidthSync();
        initCaseStatsCharts();
        initMap();
        window.addEventListener('resize', syncTopKpiLayoutWidths);
        window.requestAnimationFrame(() => {
            syncTopKpiLayoutWidths();
            window.requestAnimationFrame(() => {
                syncTopKpiLayoutWidths();
                if (mapInstance) mapInstance.resize();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}());
