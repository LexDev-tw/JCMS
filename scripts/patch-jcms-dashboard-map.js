const fs = require('fs');

const preview = fs.readFileSync('d:/JCMS2/public/previews/dashboard-map-overview-preview.html', 'utf8');
const jcmsPath = 'd:/JCMS2/public/JCMS.html';
let jcms = fs.readFileSync(jcmsPath, 'utf8');

const shellMatch = preview.match(/<div id="map-canvas"[\s\S]*?<p class="map-zoom-hint">[\s\S]*?<\/p>/);
if (!shellMatch) throw new Error('shell not found');

let tpl = shellMatch[0];
tpl = tpl.replace('id="map-canvas"', 'id="dash-map-canvas"');

tpl = tpl.replace(
    '<div class="dash-map-shell">',
    `<div class="dash-map-shell">
                    <div class="dash-map-detail-entry">
                        <button type="button" class="swiss-btn swiss-btn--secondary" @click="switchView('dashboardDetail')" aria-label="開啟詳細資訊總覽">詳細總覽</button>
                    </div>`
);

tpl = tpl.replace(
    /<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0">\s*<div class="swiss-section-heading">\s*<h2 class="swiss-section-heading__title">本月新收<\/h2>[\s\S]*?<span class="dash-kpi-mini__value font-mono text-ink-900">4<\/span>\s*<\/button>/,
    `<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0" @click="gotoDashNewlyReceived" aria-label="前往案件清單並篩選本月新收">
                                    <div class="swiss-section-heading">
                                        <h2 class="swiss-section-heading__title">本月新收</h2>
                                        <p class="swiss-section-subtitle">RECEIVED</p>
                                    </div>
                                    <span class="dash-kpi-mini__value font-mono text-ink-900">{{ dashStats.newlyReceived }}</span>
                                </button>`
);

tpl = tpl.replace(
    /<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity">\s*<div class="swiss-section-heading">\s*<h2 class="swiss-section-heading__title">本月已結<\/h2>[\s\S]*?<span class="dash-kpi-mini__value font-mono text-ink-900">3<\/span>\s*<\/button>/,
    `<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity" @click="gotoDashClosedThisMonth" aria-label="前往案件清單並篩選本月已結">
                                        <div class="swiss-section-heading">
                                            <h2 class="swiss-section-heading__title">本月已結</h2>
                                            <p class="swiss-section-subtitle">CLOSED</p>
                                        </div>
                                        <span class="dash-kpi-mini__value font-mono text-ink-900">{{ dashStats.closed }}</span>
                                    </button>`
);

tpl = tpl.replace(
    /<span class="dash-kpi-mini__amount font-mono text-ink-900">2,640,000<\/span>/,
    `<span class="dash-kpi-mini__amount font-mono text-ink-900">{{ util.formatMoney(dashStats.monthClosedTarget) }}</span>`
);

tpl = tpl.replace(
    /<span class="dash-kpi-mini__value font-mono text-ink-900">75%<\/span>/,
    `<span class="dash-kpi-mini__value font-mono text-ink-900">{{ dashStats.clearanceRate }}%</span>`
);

tpl = tpl.replace(
    /<button type="button" id="dash-kpi-unresolved"[\s\S]*?<span class="dash-kpi-mini__value dash-kpi-mini__value--accent font-mono">12<\/span>\s*<\/button>/,
    `<button type="button" id="dash-kpi-unresolved" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0" @click="gotoDashUnresolved" aria-label="前往案件清單並篩選未結">
                                    <div class="swiss-section-heading">
                                        <h2 class="swiss-section-heading__title">未結案件</h2>
                                        <p class="swiss-section-subtitle">UNRESOLVED</p>
                                    </div>
                                    <span class="dash-kpi-mini__value dash-kpi-mini__value--accent font-mono">{{ dashStats.unresolved }}</span>
                                </button>`
);

tpl = tpl.replace(
    /<span class="text-xs font-mono font-bold tabular-nums text-accent">20<\/span>/,
    `<span class="text-xs font-mono font-bold tabular-nums text-accent">{{ dashStats.cumulativeReceived }}</span>`
);
tpl = tpl.replace(
    /<div class="dash-cumulative-bar"><canvas id="cum-0"><\/canvas><\/div>/,
    `<div class="dash-cumulative-bar"><canvas data-dash-cumulative-canvas data-idx="0" role="img" :aria-label="'累計收案 ' + dashStats.cumulativeReceived"></canvas></div>`
);
tpl = tpl.replace(
    /<span class="dash-kpi-mini__amount font-mono text-accent">8,520,000<\/span>/,
    `<span class="dash-kpi-mini__amount font-mono text-accent">{{ util.formatMoney(dashStats.cumulativeReceivedAmount) }}</span>`
);
tpl = tpl.replace(
    /<span class="text-xs font-mono font-bold tabular-nums text-ink-900">8<\/span>/,
    `<span class="text-xs font-mono font-bold tabular-nums text-ink-900">{{ dashStats.cumulativeClosed }}</span>`
);
tpl = tpl.replace(
    /<div class="dash-cumulative-bar"><canvas id="cum-1"><\/canvas><\/div>/,
    `<div class="dash-cumulative-bar"><canvas data-dash-cumulative-canvas data-idx="1" role="img" :aria-label="'累計結案 ' + dashStats.cumulativeClosed"></canvas></div>`
);
tpl = tpl.replace(
    /<span class="dash-kpi-mini__amount font-mono text-ink-900">5,240,000<\/span>/,
    `<span class="dash-kpi-mini__amount font-mono text-ink-900">{{ util.formatMoney(dashStats.cumulativeClosedAmount) }}</span>`
);

tpl = tpl.replace(
    /<div class="dash-toggle" role="group">\s*<button type="button" class="dash-toggle__btn dash-toggle__btn--active" data-mode="word">字別<\/button>\s*<button type="button" class="dash-toggle__btn" data-mode="reason">案由<\/button>\s*<\/div>/,
    `<div class="dash-toggle shrink-0" role="group" aria-label="未結結構維度">
                                        <button type="button" class="dash-toggle__btn" :class="dashBreakdownMode === 'word' ? 'dash-toggle__btn--active' : ''" @click="dashBreakdownMode = 'word'">字別</button>
                                        <button type="button" class="dash-toggle__btn" :class="dashBreakdownMode === 'reason' ? 'dash-toggle__btn--active' : ''" @click="dashBreakdownMode = 'reason'">案由</button>
                                    </div>`
);

tpl = tpl.replace(
    /<div id="breakdown-list" class="dash-breakdown-list"><\/div>/,
    `<div class="dash-breakdown-list" aria-label="未結結構前五大">
                                        <div
                                            v-for="(item, i) in dashBreakdownSlots"
                                            :key="dashBreakdownMode + '-map-' + i"
                                            class="dash-breakdown-row group"
                                            :class="item.empty ? 'dash-breakdown-row--placeholder' : ''"
                                        >
                                            <span class="dash-breakdown-label__title font-mono" :title="item.empty ? '' : item.label">{{ item.label }}</span>
                                            <div class="dash-breakdown-bar min-w-0">
                                                <canvas v-if="!item.empty" data-dash-breakdown-canvas :data-idx="i" role="img" :aria-label="item.label + ' ' + item.count"></canvas>
                                            </div>
                                            <span class="text-[11px] font-mono font-bold tabular-nums text-right text-ink-900">{{ item.empty ? '' : item.count }}</span>
                                        </div>
                                    </div>`
);

tpl = tpl.replace(
    /<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0">\s*<div class="swiss-section-heading">\s*<h2 class="swiss-section-heading__title">本月進行<\/h2>[\s\S]*?<span class="dash-kpi-mini__value font-mono text-ink-900">7<\/span>\s*<\/button>/,
    `<button type="button" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0" @click="gotoDashProceedingThisMonth" aria-label="前往案件清單並篩選本月進行">
                                    <div class="swiss-section-heading">
                                        <h2 class="swiss-section-heading__title">本月進行</h2>
                                        <p class="swiss-section-subtitle">PROCEEDING</p>
                                    </div>
                                    <span class="dash-kpi-mini__value font-mono text-ink-900">{{ dashStats.proceedingThisMonth }}</span>
                                </button>`
);

tpl = tpl.replace(
    /<button type="button" id="dash-kpi-not-proceeding"[\s\S]*?<span class="dash-kpi-mini__value dash-kpi-mini__value--accent font-mono">5<\/span>\s*<\/button>/,
    `<button type="button" id="dash-kpi-not-proceeding" class="dash-kpi-mini text-left hover:opacity-80 transition-opacity shrink-0" @click="gotoDashNotProceeding" aria-label="前往案件清單並篩選未進行">
                                    <div class="swiss-section-heading">
                                        <h2 class="swiss-section-heading__title">未進行案件</h2>
                                        <p class="swiss-section-subtitle">NOT PROCEEDING</p>
                                    </div>
                                    <span class="dash-kpi-mini__value dash-kpi-mini__value--accent font-mono">{{ dashStats.notProceeding }}</span>
                                </button>`
);

tpl = tpl.replace(/href="\.\.\/JCMS\.html\?view=caseStats"/g, 'href="#" @click.prevent="switchView(\'caseStats\')"');

tpl = tpl.replace(
    /<header class="dash-section-head">\s*<div class="swiss-section-heading min-w-0">\s*<h2 class="swiss-section-heading__title">待辦事項<\/h2>[\s\S]*?<span class="dash-section-head__extra">2 PENDING<\/span>\s*<\/header>\s*<div class="dash-todo-list">[\s\S]*?<\/div>\s*<\/div>\s*<div class="dash-top-right-stack-block" aria-label="本週行事曆">/,
    `<header class="dash-section-head">
                                    <div class="swiss-section-heading min-w-0">
                                        <h2 class="swiss-section-heading__title">待辦事項</h2>
                                        <p class="swiss-section-subtitle">TO-DO LIST</p>
                                    </div>
                                    <span class="dash-section-head__extra">{{ dashMapTodoPendingCount }} PENDING</span>
                                </header>
                                <div class="dash-todo-list">
                                    <div
                                        v-for="todo in personalAdmin.todos.slice(0, 6)"
                                        :key="'map-todo-' + todo.id"
                                        class="flex items-center gap-2 group"
                                        :class="todo.done ? 'opacity-60' : ''"
                                    >
                                        <div class="w-3 h-3 border shrink-0" :class="todo.done ? 'border-ink-900 bg-ink-900' : 'border-ink-400'"></div>
                                        <span class="text-[12px] font-bold flex-1" :class="todo.done ? 'text-ink-400 line-through' : 'text-ink-900'">{{ todo.text }}</span>
                                    </div>
                                    <div v-if="personalAdmin.todos.length === 0" class="text-[11px] font-mono font-bold uppercase tracking-widest text-ink-400">List is empty.</div>
                                </div>
                            </div>
                            <div class="dash-top-right-stack-block" aria-label="本週行事曆">`
);

tpl = tpl.replace(
    /<header class="dash-section-head">\s*<div class="swiss-section-heading min-w-0">\s*<h2 class="swiss-section-heading__title">行事曆<\/h2>[\s\S]*?<span class="dash-section-head__extra font-mono tabular-nums">1140407—13<\/span>\s*<\/header>\s*<div class="dash-week-compact" id="week-compact"><\/div>/,
    `<header class="dash-section-head">
                                    <div class="swiss-section-heading min-w-0">
                                        <h2 class="swiss-section-heading__title">行事曆</h2>
                                        <p class="swiss-section-subtitle">WEEKLY SCHEDULE</p>
                                    </div>
                                    <span class="dash-section-head__extra font-mono tabular-nums">{{ events.weekRange }}</span>
                                </header>
                                <div class="dash-week-compact" aria-label="本週精簡行事曆">
                                    <div
                                        v-for="day in dashMapWeekCompactDays"
                                        :key="'map-week-' + day.fullDate"
                                        class="dash-week-compact__day"
                                        :class="day.isToday ? 'dash-week-compact__day--today' : ''"
                                    >
                                        <div class="font-mono text-lg font-light tabular-nums leading-none" :class="day.isToday ? 'text-accent' : 'text-ink-900'">{{ day.dayNum }}</div>
                                        <div v-if="day.eventCount > 0" class="mt-1 text-[9px] font-bold text-ink-900 truncate">{{ day.eventCount }} 項</div>
                                        <div v-else class="mt-1 text-[9px] font-mono text-ink-400">—</div>
                                    </div>
                                </div>`
);

const mapViewBlock = `                <!-- ==========================================
                     View: 總覽 (地圖總覽)
                =========================================== -->
                <div v-if="currentView === 'dashboard'" ref="dashMapRootRef" class="jcms-dash-map-view flex-1 min-h-0 animate-fade-in-up">
${tpl.split('\n').map((line) => '                    ' + line).join('\n')}
                </div>

`;

if (!jcms.includes("currentView === 'dashboardDetail'")) {
    jcms = jcms.replace(
        `<div v-if="currentView === 'dashboard'" ref="dashRootRef"`,
        `${mapViewBlock}<div v-else-if="currentView === 'dashboardDetail'" ref="dashRootRef"`
    );
    jcms = jcms.replace(
        `View: 總覽 (Dashboard)`,
        `View: 詳細資訊總覽 (Dashboard Detail)`
    );
    // insert map view header comment before detail block
    jcms = jcms.replace(
        mapViewBlock + `<div v-else-if="currentView === 'dashboardDetail'"`,
        `                <!-- ==========================================
                     View: 總覽 (地圖總覽)
                =========================================== -->
${mapViewBlock}                <!-- ==========================================
                     View: 詳細資訊總覽 (Dashboard Detail)
                =========================================== -->
                <div v-else-if="currentView === 'dashboardDetail'"`
    );
}

// head links
if (!jcms.includes('jcms-dashboard-map.css')) {
    jcms = jcms.replace(
        '<link rel="stylesheet" href="css/jcms.css">',
        `<link rel="stylesheet" href="css/jcms.css">
    <link rel="stylesheet" href="css/jcms-dashboard-map.css">
    <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet">
    <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"><\/script>
    <script src="https://unpkg.com/topojson-client@3.1.0/dist/topojson-client.min.js"><\/script>`
    );
}

fs.writeFileSync(jcmsPath, jcms);
console.log('JCMS.html patched');
