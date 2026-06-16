/** 地圖總覽：圖層健康狀態（工具列診斷） */
(function (global) {
    const STATUS = Object.freeze({
        idle: 'idle',
        ok: 'ok',
        warn: 'warn',
        error: 'error',
    });

    const LAYER_LABELS = Object.freeze({
        admin: '行政區',
        population: '人口',
        transport: '交通',
        orthophoto: '正射影像',
        landsect: '地段',
    });

    function createLayerHealthApi({ getRoot }) {
        const health = Object.create(null);

        function setLayerHealth(key, patch) {
            if (!key) return;
            health[key] = { ...(health[key] || {}), ...patch };
            renderHealth();
        }

        function clearLayerHealth(key) {
            if (!key) return;
            delete health[key];
            renderHealth();
        }

        function resetHealth() {
            Object.keys(health).forEach((k) => delete health[k]);
            renderHealth();
        }

        function q(id) {
            const root = typeof getRoot === 'function' ? getRoot() : null;
            if (!root) return null;
            return root.querySelector(`#${String(id).replace(/^#/, '')}`);
        }

        function statusMark(status) {
            if (status === STATUS.ok) return 'OK';
            if (status === STATUS.warn) return '注意';
            if (status === STATUS.error) return '失敗';
            return '';
        }

        function formatLine(key) {
            const entry = health[key];
            if (!entry || entry.status === STATUS.idle) return null;
            const label = LAYER_LABELS[key] || key;
            const mark = statusMark(entry.status);
            const detail = String(entry.detail || '').trim();
            return detail ? `${label}：${mark}（${detail}）` : `${label}：${mark}`;
        }

        function renderHealth() {
            const el = q('map-layer-health-meta');
            if (!el) return;

            const active = Object.values(health).some((entry) => entry?.status && entry.status !== STATUS.idle);
            if (!active) {
                el.textContent = '';
                el.hidden = true;
                return;
            }

            const lines = ['admin', 'population', 'transport', 'orthophoto', 'landsect']
                .map(formatLine)
                .filter(Boolean);

            el.hidden = !lines.length;
            el.textContent = lines.join('\n');
        }

        function describeMapLayer(map, layerId) {
            if (!map || !layerId) return '圖層不存在';
            const layer = map.getLayer(layerId);
            if (!layer) return '圖層不存在';
            const visibility = map.getLayoutProperty(layerId, 'visibility') || 'visible';
            return visibility === 'visible' ? '顯示中' : '已關閉';
        }

        return {
            STATUS,
            setLayerHealth,
            clearLayerHealth,
            resetHealth,
            renderHealth,
            describeMapLayer,
        };
    }

    global.DashboardMapLayerHealth = {
        STATUS,
        LAYER_LABELS,
        createLayerHealthApi,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
