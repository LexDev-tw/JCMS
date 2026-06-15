const fs = require('fs');
const previewPath = 'd:/JCMS2/public/previews/dashboard-map-overview-preview.html';
const outPath = 'd:/JCMS2/public/js/jcms/composables/use-dashboard-map-view.js';

const html = fs.readFileSync(previewPath, 'utf8');
const m = html.match(/<script>\s*\(function \(\) \{([\s\S]*)\}\)\(\);\s*<\/script>/);
if (!m) throw new Error('script block not found');

let body = m[1];
body = body.replace(/const MOCK_BREAKDOWN[\s\S]*?const MOCK_WEEK[\s\S]*?\];/, '');
body = body.replace(/function renderBreakdown\(\)[\s\S]*?function renderWeek\(\)[\s\S]*?\n        \}/, '');
body = body.replace(/function initCharts\(\)[\s\S]*?\n        \}\n\n        \/\*\* —— 案件統計/, '/** —— 案件統計');
body = body.replace(
    /document\.querySelectorAll\('\.dash-toggle__btn'\)[\s\S]*?\n        initMap\(\);/,
    'initMap();'
);
body = body.replace(
    /MAP_SETTINGS_STORAGE_KEY = 'jcms\.dashboard-map-preview\.settings'/,
    "MAP_SETTINGS_STORAGE_KEY = 'jcms.dashboard-map.settings'"
);
body = body.replace(/\[dashboard-map-preview\]/g, '[dashboard-map]');
body = body.replace(/console\.warn\('\[dashboard-map-preview\]/g, "console.warn('[dashboard-map]");
body = body.replace(/document\.getElementById\('map-canvas'\)/g, "root.querySelector('#dash-map-canvas')");
body = body.replace(/document\.getElementById\(/g, 'q(root, ');
body = body.replace(/document\.querySelector\(/g, 'root.querySelector(');
body = body.replace(/document\.querySelectorAll\(/g, 'root.querySelectorAll(');

const header = `/** 地圖總覽：MapLibre + 案件統計圖 + 版面寬度同步 */
import { watch, onUnmounted, nextTick } from '../vue-api.js';

function q(root, id) {
    if (!root) return null;
    const raw = String(id).replace(/^#/, '').replace(/'/g, '');
    return root.querySelector('#' + raw);
}

export function useDashboardMapView({ rootRef, isActiveRef, getWorkspaceId }) {
    let disposed = false;
    let resizeHandler = null;
    let layoutResizeHandler = null;
    let ro = null;

    function getRoot() {
        return rootRef.value;
    }

    function teardown() {
        disposed = true;
        if (layoutResizeHandler) {
            window.removeEventListener('resize', layoutResizeHandler);
            layoutResizeHandler = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (ro) {
            ro.disconnect();
            ro = null;
        }
        try {
            if (typeof destroyCaseStatsCharts === 'function') destroyCaseStatsCharts();
        } catch (_) { /* ignore */ }
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
    }

    function boot() {
        const root = getRoot();
        if (!root || !isActiveRef.value || disposed) return;

        const workspaceId = typeof getWorkspaceId === 'function' ? getWorkspaceId() : 'WS_001';

`;

const footer = `
        layoutResizeHandler = () => {
            try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
        };
        window.addEventListener('resize', layoutResizeHandler);
        bindTopLeftWidthSync();
        initCaseStatsCharts();
        window.requestAnimationFrame(() => {
            try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
            window.requestAnimationFrame(() => {
                try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ }
            });
        });
    }

    watch([isActiveRef, rootRef], () => {
        teardown();
        disposed = false;
        if (isActiveRef.value && rootRef.value) nextTick(boot);
    }, { immediate: true });

    onUnmounted(teardown);

    return {
        resizeMap: () => { if (mapInstance) mapInstance.resize(); },
        syncLayout: () => { try { syncTopKpiLayoutWidths(); } catch (_) { /* ignore */ } },
    };
}
`;

// Patch loadCaseStatsDashboardData to use workspaceId from closure
body = body.replace(
    /async function loadCaseStatsDashboardData\(\) \{\s*const workspaceId = 'WS_001';/,
    'async function loadCaseStatsDashboardData() {\n            const workspaceId = workspaceIdArg;'
);
body = body.replace(
    /function initCaseStatsCharts\(\) \{/,
    'function initCaseStatsCharts() {\n            const workspaceIdArg = workspaceId;'
);

const out = header + body.trim() + footer;
fs.writeFileSync(outPath, out);
console.log('written', outPath, fs.statSync(outPath).size);
