const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JCMS_HTML = path.join(ROOT, 'public', 'JCMS.html');
const OUT_HTML = path.join(ROOT, 'public', 'previews', 'dashboard-map-overview-preview.html');
const OUT_WEATHER_HTML = path.join(ROOT, 'public', 'previews', 'dashboard-map-weather-preview.html');

const MUSTACHE_MAP = [
    [/\{\{\s*dashStats\.newlyReceived\s*\}\}/g, '4'],
    [/\{\{\s*dashStats\.closed\s*\}\}/g, '3'],
    [/\{\{\s*dashStats\.clearanceRate\s*\}\}/g, '75'],
    [/\{\{\s*dashStats\.unresolved\s*\}\}/g, '12'],
    [/\{\{\s*dashStats\.proceedingThisMonth\s*\}\}/g, '7'],
    [/\{\{\s*dashStats\.notProceeding\s*\}\}/g, '5'],
    [/\{\{\s*dashStats\.cumulativeReceived\s*\}\}/g, '20'],
    [/\{\{\s*util\.formatMoney\(dashStats\.cumulativeReceivedAmount\)\s*\}\}/g, '8,520,000'],
    [/\{\{\s*dashStats\.cumulativeClosed\s*\}\}/g, '8'],
    [/\{\{\s*util\.formatMoney\(dashStats\.cumulativeClosedAmount\)\s*\}\}/g, '5,240,000'],
    [/\{\{\s*dashMapTodoPendingCount\s*\}\}\s*PENDING/g, '2 PENDING'],
    [/\{\{\s*events\.weekRange\s*\}\}/g, '1140614—20'],
    [/\{\{\s*dashMapOtRegularUsedDisplay\s*\}\}\s*\/\s*\{\{\s*dashMapOtRegularReportableDisplay\s*\}\}/g, '6 / 46'],
    [/\{\{\s*dashMapOtProjectUsedDisplay\s*\}\}\s*\/\s*\{\{\s*dashMapOtProjectReportableDisplay\s*\}\}/g, '2 / 12'],
    [/\{\{\s*[^}]+\s*\}\}/g, ''],
];

const MOCK_BREAKDOWN_ROWS = `
                                                                    <div class="dash-breakdown-row group">
                                                                        <span class="dash-breakdown-label__title font-mono" title="士補">士補</span>
                                                                        <div class="dash-breakdown-bar min-w-0">
                                                                            <canvas data-dash-breakdown-canvas data-idx="0" role="img" aria-label="士補 5"></canvas>
                                                                        </div>
                                                                        <span class="dash-map-block-text dash-map-block-text--mono dash-map-block-text--count">5</span>
                                                                    </div>
                                                                    <div class="dash-breakdown-row group">
                                                                        <span class="dash-breakdown-label__title font-mono" title="士簡">士簡</span>
                                                                        <div class="dash-breakdown-bar min-w-0">
                                                                            <canvas data-dash-breakdown-canvas data-idx="1" role="img" aria-label="士簡 4"></canvas>
                                                                        </div>
                                                                        <span class="dash-map-block-text dash-map-block-text--mono dash-map-block-text--count">4</span>
                                                                    </div>
                                                                    <div class="dash-breakdown-row group">
                                                                        <span class="dash-breakdown-label__title font-mono" title="士小">士小</span>
                                                                        <div class="dash-breakdown-bar min-w-0">
                                                                            <canvas data-dash-breakdown-canvas data-idx="2" role="img" aria-label="士小 2"></canvas>
                                                                        </div>
                                                                        <span class="dash-map-block-text dash-map-block-text--mono dash-map-block-text--count">2</span>
                                                                    </div>
                                                                    <div class="dash-breakdown-row group">
                                                                        <span class="dash-breakdown-label__title font-mono" title="其他">其他</span>
                                                                        <div class="dash-breakdown-bar min-w-0">
                                                                            <canvas data-dash-breakdown-canvas data-idx="3" role="img" aria-label="其他 1"></canvas>
                                                                        </div>
                                                                        <span class="dash-map-block-text dash-map-block-text--mono dash-map-block-text--count">1</span>
                                                                    </div>
                                                                    <div class="dash-breakdown-row group dash-breakdown-row--placeholder">
                                                                        <span class="dash-breakdown-label__title font-mono"></span>
                                                                        <div class="dash-breakdown-bar min-w-0"></div>
                                                                        <span class="dash-map-block-text dash-map-block-text--mono dash-map-block-text--count"></span>
                                                                    </div>`;

const MOCK_TODOS = `
                                                            <div class="dash-map-todo-item">
                                                                <button type="button" class="dash-map-todo-item__grip" title="拖曳排序" draggable="true">
                                                                    <i class="ph ph-dots-six-vertical" aria-hidden="true"></i>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__body">
                                                                    <span class="dash-map-todo-item__mark" aria-hidden="true"></span>
                                                                    <span class="dash-map-todo-item__text">補登 114 年 3 月結算</span>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__remove" title="刪除待辦">
                                                                    <i class="ph ph-x" aria-hidden="true"></i>
                                                                </button>
                                                            </div>
                                                            <div class="dash-map-todo-item">
                                                                <button type="button" class="dash-map-todo-item__grip" title="拖曳排序" draggable="true">
                                                                    <i class="ph ph-dots-six-vertical" aria-hidden="true"></i>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__body">
                                                                    <span class="dash-map-todo-item__mark" aria-hidden="true"></span>
                                                                    <span class="dash-map-todo-item__text">確認士補 128 期日</span>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__remove" title="刪除待辦">
                                                                    <i class="ph ph-x" aria-hidden="true"></i>
                                                                </button>
                                                            </div>
                                                            <div class="dash-map-todo-item dash-map-todo-item--done">
                                                                <button type="button" class="dash-map-todo-item__grip" title="拖曳排序" draggable="true">
                                                                    <i class="ph ph-dots-six-vertical" aria-hidden="true"></i>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__body">
                                                                    <span class="dash-map-todo-item__mark" aria-hidden="true"></span>
                                                                    <span class="dash-map-todo-item__text">更新字軌設定</span>
                                                                </button>
                                                                <button type="button" class="dash-map-todo-item__remove" title="刪除待辦">
                                                                    <i class="ph ph-x" aria-hidden="true"></i>
                                                                </button>
                                                            </div>`;

const WEEK_DAYS = [
    { label: '07', day: 'M', isToday: false, col: 1, allDay: [], timed: [] },
    { label: '08', day: 'T', isToday: false, col: 2, allDay: [], timed: [{ time: '0930', title: '內湖勘驗' }] },
    { label: '09', day: 'W', isToday: true, col: 3, allDay: [{ title: '法院開庭準備' }], timed: [] },
    { label: '10', day: 'T', isToday: false, col: 4, allDay: [], timed: [{ time: '1400', title: '當事人會議' }] },
    { label: '11', day: 'F', isToday: false, col: 5, allDay: [], timed: [] },
    { label: '12', day: 'S', isToday: false, col: 6, allDay: [], timed: [] },
    { label: '13', day: 'S', isToday: false, col: 7, allDay: [], timed: [] },
];

function weekDayHeadsHtml() {
    return WEEK_DAYS.map((d) => `
                                                        <div
                                                            class="dash-map-week-day-head${d.isToday ? ' dash-map-week-day-head--today' : ''}"
                                                            style="grid-column: ${d.col}; grid-row: 1"
                                                        >
                                                            <span class="dash-map-week-day-head__num font-mono tabular-nums${d.isToday ? ' text-accent' : ' text-ink-900'}">${d.label}</span>
                                                            <span class="dash-map-week-day-head__dow">${d.day}</span>
                                                        </div>`).join('');
}

function weekSpanBarHtml() {
    return `
                                                        <div
                                                            class="dash-map-week-span-bar group/bar dash-map-week-span-bar--case"
                                                            style="grid-column: 2 / span 3; grid-row: 2"
                                                        >
                                                            <span class="dash-map-week-span-bar__label truncate" title="114 年士補 128 期日">114 年士補 128 期日</span>
                                                            <span class="dash-map-week-span-bar__line" aria-hidden="true"></span>
                                                        </div>`;
}

function weekDayBodiesHtml() {
    const bodyRow = 3;
    return WEEK_DAYS.map((d) => {
        const allDay = d.allDay.map((ev) => `
                                                                <button type="button" class="dash-map-week-event dash-map-week-event--allday">
                                                                    <span class="dash-map-week-event__title truncate" title="${ev.title}">${ev.title}</span>
                                                                </button>`).join('');
        const timed = d.timed.map((ev) => `
                                                                <button type="button" class="dash-map-week-event">
                                                                    <span class="dash-map-week-event__time font-mono tabular-nums">${ev.time}</span>
                                                                    <span class="dash-map-week-event__title truncate" title="${ev.title}">${ev.title}</span>
                                                                </button>`).join('');
        const empty = !d.allDay.length && !d.timed.length
            ? '<span class="dash-map-week-events__empty font-mono">—</span>'
            : '';
        return `
                                                        <div
                                                            class="dash-map-week-day-body${d.isToday ? ' dash-map-week-day-body--today' : ''}"
                                                            style="grid-column: ${d.col}; grid-row: ${bodyRow}"
                                                        >
                                                            <div class="dash-map-week-events">
                                                                ${allDay}${timed}${empty}
                                                            </div>
                                                        </div>`;
    }).join('');
}

function otDotsHtml(count, onCount, project) {
    const dots = [];
    for (let i = 0; i < count; i += 1) {
        const on = i < onCount;
        const cls = on
            ? (project ? 'dash-map-ot-dot dash-map-ot-dot--on dash-map-ot-dot--project' : 'dash-map-ot-dot dash-map-ot-dot--on')
            : 'dash-map-ot-dot dash-map-ot-dot--off';
        dots.push(`<span class="${cls}" aria-hidden="true"></span>`);
    }
    return dots.join('\n                                                                    ');
}

const MOCK_OT_REGULAR = otDotsHtml(46, 6, false);
const MOCK_OT_PROJECT = otDotsHtml(12, 2, true);

const WEATHER_TOGGLES = `
                            <label class="map-layer-switch" for="map-toggle-rain-advisory">
                                <span class="map-layer-switch__label">降雨特報</span>
                                <input type="checkbox" class="map-layer-switch__input" id="map-toggle-rain-advisory" role="switch" checked />
                                <span class="map-layer-switch__track" aria-hidden="true">
                                    <span class="map-layer-switch__thumb"></span>
                                </span>
                            </label>
                            <label class="map-layer-switch" for="map-toggle-satellite-cloud">
                                <span class="map-layer-switch__label">衛星雲圖</span>
                                <input type="checkbox" class="map-layer-switch__input" id="map-toggle-satellite-cloud" role="switch" checked />
                                <span class="map-layer-switch__track" aria-hidden="true">
                                    <span class="map-layer-switch__thumb"></span>
                                </span>
                            </label>
                            <p id="map-weather-meta" class="dash-map-toolbar__status" aria-live="polite"></p>`;

const WEATHER_TOGGLES_EXTENDED = `
                            <label class="map-layer-switch" for="map-toggle-radar-echo">
                                <span class="map-layer-switch__label">雷達回波</span>
                                <input type="checkbox" class="map-layer-switch__input" id="map-toggle-radar-echo" role="switch" checked />
                                <span class="map-layer-switch__track" aria-hidden="true">
                                    <span class="map-layer-switch__thumb"></span>
                                </span>
                            </label>
                            <label class="map-layer-switch" for="map-toggle-rain-advisory">
                                <span class="map-layer-switch__label">降雨特報</span>
                                <input type="checkbox" class="map-layer-switch__input" id="map-toggle-rain-advisory" role="switch" />
                                <span class="map-layer-switch__track" aria-hidden="true">
                                    <span class="map-layer-switch__thumb"></span>
                                </span>
                            </label>
                            <label class="map-layer-switch" for="map-toggle-satellite-cloud">
                                <span class="map-layer-switch__label">衛星雲圖</span>
                                <input type="checkbox" class="map-layer-switch__input" id="map-toggle-satellite-cloud" role="switch" />
                                <span class="map-layer-switch__track" aria-hidden="true">
                                    <span class="map-layer-switch__thumb"></span>
                                </span>
                            </label>
                            <p id="map-weather-meta" class="dash-map-toolbar__status" aria-live="polite"></p>`;

const PREVIEW_HEAD = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>__PREVIEW_TITLE__</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
    <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
    <script src="https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', '"Noto Sans TC"', 'PingFang TC', 'Microsoft JhengHei', 'sans-serif'],
                    },
                    colors: {
                        surface: '#FFFFFF',
                        panel: '#F7F7F5',
                        ink: { 900: '#111111', 600: '#666666', 400: '#999999', 100: '#EAEAEA' },
                        accent: '#F05A28',
                    },
                },
            },
        };
    </script>
    <link rel="stylesheet" href="../css/jcms.css">
    <link rel="stylesheet" href="../css/jcms-dashboard-map.css">
    <style>
        html, body { height: 100%; margin: 0; overflow: hidden; box-sizing: border-box; }
        body { padding-top: 1.85rem; }
        .jcms-dash-map-view { height: 100%; position: relative; overflow: hidden; }

        .preview-banner {
            position: fixed; top: 0; left: 0; right: 0; z-index: 60;
            background: #111; color: #fff;
            font-size: 0.5625rem; font-weight: 700;
            letter-spacing: 0.14em; text-transform: uppercase;
            padding: 0.45rem 1rem;
        }
    </style>
</head>
<body class="bg-surface text-ink-900 font-sans antialiased">
    <div class="preview-banner">__PREVIEW_BANNER__</div>
    <div class="jcms-dash-map-view flex-1 min-h-0"__WEATHER_PREVIEW_ATTR__>
`;

const PREVIEW_FOOT = `
    </div>
    <script src="../js/jcms/lib/dashboard-map-weather.js"></script>
    <script src="../js/jcms/preview/dashboard-map-preview-boot.js"></script>
</body>
</html>
`;

function extractShell(html) {
    const startMarker = 'id="dash-map-canvas"';
    const startIdx = html.indexOf(startMarker);
    if (startIdx < 0) throw new Error('找不到 #dash-map-canvas');

    const divStart = html.lastIndexOf('<div', startIdx);
    const toolbarIdx = html.indexOf('id="dash-map-toolbar"', startIdx);
    if (toolbarIdx < 0) throw new Error('找不到 #dash-map-toolbar');

    const asideEnd = html.indexOf('</aside>', toolbarIdx);
    if (asideEnd < 0) throw new Error('找不到 dash-map-toolbar 結束標籤');

    return html.slice(divStart, asideEnd + '</aside>'.length);
}

function stripVueDirectives(text) {
    let out = text;
    out = out.replace(/\s@v(?:ue)?:[\w.-]+(?:\.[\w.-]+)*="[^"]*"/g, '');
    out = out.replace(/\s@[\w.-]+(?:\.[\w.-]+)*="[^"]*"/g, '');
    out = out.replace(/\s:v(?:ue)?(?:-[\w-]+)?="[^"]*"/g, '');
    out = out.replace(/\s:v(?:ue)?(?:-[\w-]+)?='[^']*'/g, '');
    out = out.replace(/\sref="[^"]*"/g, '');
    return out;
}

function replaceWeekGrid(text) {
    const start = text.indexOf('<div class="dash-map-week-grid');
    if (start < 0) return text;
    const asideIdx = text.indexOf('<aside class="dash-map-todo-block', start);
    if (asideIdx < 0) return text;
    const mock = `<div class="dash-map-week-grid dash-week-unified-grid" aria-label="本週行事曆格線">${weekDayHeadsHtml()}${weekSpanBarHtml()}${weekDayBodiesHtml()}
                                                    </div>
                                                        </div>
                                                    </div>
                                                    `;
    return text.slice(0, start) + mock + text.slice(asideIdx);
}

function replaceTodoList(text) {
    const start = text.indexOf('<div class="dash-map-todo-list">');
    if (start < 0) return text;
    const asideEnd = text.indexOf('</aside>', start);
    if (asideEnd < 0) return text;
    const listClose = text.lastIndexOf('</div>', asideEnd);
    if (listClose < 0) return text;
    const mock = `<div class="dash-map-todo-list">${MOCK_TODOS}
                                                        </div>`;
    return text.slice(0, start) + mock + text.slice(listClose + '</div>'.length);
}

function replaceVForBlocks(text) {
    let out = text;

    out = out.replace(
        /(<div class="dash-breakdown-list"[^>]*>)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>\s*<div class="dash-map-calendar-block")/,
        `$1${MOCK_BREAKDOWN_ROWS}
                                                                $2`
    );

    out = replaceWeekGrid(out);
    out = replaceTodoList(out);

    out = out.replace(
        /<div\s+v-if="!dashMapOtRegularDotSpec\.inactive"[\s\S]*?<\/div>/,
        `<div
                                                                    class="dash-map-ot-dotgrid"
                                                                    role="img"
                                                                    title="一般加班 6 / 46"
                                                                    aria-label="一般加班 6 / 46"
                                                                    style="--dash-map-ot-cols: 23"
                                                                >
                                                                    ${MOCK_OT_REGULAR}
                                                                </div>`
    );

    out = out.replace(
        /<div\s+v-if="!dashMapOtProjectDotSpec\.inactive"[\s\S]*?<\/div>/,
        `<div
                                                                    class="dash-map-ot-dotgrid"
                                                                    role="img"
                                                                    title="專案加班 2 / 12"
                                                                    aria-label="專案加班 2 / 12"
                                                                    style="--dash-map-ot-cols: 12"
                                                                >
                                                                    ${MOCK_OT_PROJECT}
                                                                </div>`
    );

    return out;
}

function fixBreakdownSeg(text) {
    return text
        .replace(
            /class="dash-breakdown-seg__thumb"[\s\S]*?aria-hidden="true"\s*\n\s*><\/span>/,
            'class="dash-breakdown-seg__thumb"\n                                                                                aria-hidden="true"\n                                                                            ></span>'
        )
        .replace(
            /class="dash-breakdown-seg__btn"[\s\S]*?>字別<\/button>/,
            'class="dash-breakdown-seg__btn dash-breakdown-seg__btn--active"\n                                                                                aria-pressed="true"\n                                                                            >字別</button>'
        )
        .replace(
            /class="dash-breakdown-seg__btn"[\s\S]*?>案由<\/button>/,
            'class="dash-breakdown-seg__btn"\n                                                                                aria-pressed="false"\n                                                                            >案由</button>'
        );
}

function fixButtons(text) {
    let out = text;
    out = out.replace(
        /<button type="button" class="swiss-btn swiss-btn--secondary dash-map-detail-btn"[^>]*>詳細總覽<\/button>/,
        '<a href="../JCMS.html?view=dashboardDetail" class="swiss-btn swiss-btn--secondary dash-map-detail-btn" aria-label="開啟詳細資訊總覽">詳細總覽</a>'
    );
    out = out.replace(
        /<button type="button" @click="openWorkMapEdit"[^>]*>[\s\S]*?<\/button>/,
        '<button type="button" class="swiss-btn swiss-btn--secondary dash-map-detail-btn dash-map-toolbar__action" disabled title="預覽模式不支援">開啟工作地圖</button>'
    );
    out = out.replace(
        /<button type="button" class="swiss-btn swiss-btn--secondary dash-map-detail-btn dash-map-toolbar__action">\s*開啟工作地圖\s*<\/button>/,
        '<button type="button" class="swiss-btn swiss-btn--secondary dash-map-detail-btn dash-map-toolbar__action" disabled title="預覽模式不支援">開啟工作地圖</button>'
    );
    out = out.replace(
        /<a href="#" @click\.prevent="switchView\('caseStats'\)"/g,
        '<a href="../JCMS.html?view=caseStats"'
    );
    out = out.replace(
        /<a href="#" @click\.prevent="gotoOvertimeAdmin\(\)"/g,
        '<a href="../JCMS.html?view=attendance"'
    );
    return out;
}

function stripRemainingVue(text) {
    let out = text;
    out = out.replace(/\s@v(?:ue)?:[\w.-]+(?:\.[\w.-]+)*="[^"]*"/g, '');
    out = out.replace(/\s@[\w.-]+(?:\.[\w.-]+)*="[^"]*"/g, '');
    out = out.replace(/\s:v-[a-z-]+="[^"]*"/g, '');
    out = out.replace(/\s:v-for="[^"]*"/g, '');
    out = out.replace(/\s+v-model="[^"]*"/g, '');
    out = out.replace(/\s:key="[^"]*"/g, '');
    out = out.replace(/\s:class="[^"]*"/g, '');
    out = out.replace(/\s:style="[^"]*"/g, '');
    out = out.replace(/\s:disabled="[^"]*"/g, ' disabled');
    out = out.replace(/\s:aria-pressed="[^"]*"/g, '');
    out = out.replace(/\s:title="[^"]*"/g, '');
    out = out.replace(/<p v-if="[^"]*"[^>]*>[\s\S]*?<\/p>/g, '');
    out = out.replace(
        /class="dash-map-week-nav__today"\s+disabled/,
        'class="dash-map-week-nav__today dash-map-week-nav__today--idle" disabled'
    );
    out = out.replace(/<div class="dash-map-calendar-block<\/div>\s*<\/div>\s*<div class="dash-map-calendar-block"/g, '<div class="dash-map-calendar-block"');
    return out;
}

function injectWeatherToggles(text, togglesHtml) {
    if (text.includes('id="map-toggle-rain-advisory"')) {
        if (text.includes('id="map-toggle-radar-echo"') || !togglesHtml.includes('radar-echo')) {
            return text;
        }
        return text
            .replace(/<p id="map-weather-meta"[\s\S]*?<\/p>\s*(<\/aside>)/, `${togglesHtml}\n                        $1`)
            .replace(/<label class="map-layer-switch" for="map-toggle-rain-advisory">[\s\S]*?<\/label>\s*<label class="map-layer-switch" for="map-toggle-satellite-cloud">[\s\S]*?<\/label>\s*/g, '');
    }
    return text.replace(
        /(<label class="map-layer-switch map-layer-switch--detail"[\s\S]*?<\/label>)\s*(<\/aside>)/,
        `$1${togglesHtml}\n                        $2`
    );
}

function normalizeShell(text, togglesHtml) {
    let out = stripVueDirectives(text);
    out = replaceVForBlocks(out);
    for (const [re, val] of MUSTACHE_MAP) {
        out = out.replace(re, val);
    }
    out = stripVueDirectives(out);
    out = fixBreakdownSeg(out);
    out = fixButtons(out);
    out = injectWeatherToggles(out, togglesHtml);
    out = stripRemainingVue(out);
    out = out.replace(/\s+v-if="[^"]*"/g, '');
    out = out.replace(/\s+v-else(?:-if)?(?:="[^"]*")?/g, '');
    return out.trim();
}

function buildPreviewHtml(shell, variant) {
    const isExtended = variant === 'extended';
    const head = PREVIEW_HEAD
        .replace('__PREVIEW_TITLE__', isExtended
            ? '總覽頁面 — 雷達回波預覽'
            : '總覽頁面 — 地圖底圖 + 氣象圖層預覽')
        .replace('__PREVIEW_BANNER__', isExtended
            ? '總覽頁面 · 雷達回波 O-A0058-003 · 需經 API 伺服器'
            : '總覽頁面 · 對齊現行 JCMS + CWA 氣象 · 需經 API 伺服器')
        .replace('__WEATHER_PREVIEW_ATTR__', isExtended ? ' data-weather-preview="extended"' : '');
    const togglesHtml = isExtended ? WEATHER_TOGGLES_EXTENDED : WEATHER_TOGGLES;
    return head + normalizeShell(shell, togglesHtml) + PREVIEW_FOOT;
}

function main() {
    const html = fs.readFileSync(JCMS_HTML, 'utf8');
    const shell = extractShell(html);
    fs.mkdirSync(path.dirname(OUT_HTML), { recursive: true });

    const overviewOut = buildPreviewHtml(shell, 'overview');
    fs.writeFileSync(OUT_HTML, overviewOut, 'utf8');
    console.log('Generated', OUT_HTML, `(${overviewOut.length} bytes)`);

    const weatherOut = buildPreviewHtml(shell, 'extended');
    fs.writeFileSync(OUT_WEATHER_HTML, weatherOut, 'utf8');
    console.log('Generated', OUT_WEATHER_HTML, `(${weatherOut.length} bytes)`);
}

main();
