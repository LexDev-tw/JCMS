/** 總覽頁 Chart.js 橫向 2px 長條（結構分析／累計收結） */
import { watch, onMounted, onUnmounted, nextTick } from '../vue-api.js?v=0.1.20260623g';

const CHART_INK = '#111111';
const CHART_ACCENT = '#F05A28';

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

export function useDashboardCharts({ rootRef, isActiveRef, dashStatsRef, dashBreakdownSlotsRef }) {
    const breakdownCharts = [];
    const cumulativeCharts = [];
    const rowListeners = [];

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

    function clearRowListeners() {
        rowListeners.forEach(({ row, enter, leave }) => {
            row.removeEventListener('mouseenter', enter);
            row.removeEventListener('mouseleave', leave);
        });
        rowListeners.length = 0;
    }

    function bindBarHover(row, chart, baseColor) {
        const enter = () => {
            chart.data.datasets[0].backgroundColor = CHART_ACCENT;
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

    function syncBreakdownCharts(root) {
        destroyBreakdownCharts();
        const slots = dashBreakdownSlotsRef.value || [];
        root.querySelectorAll('[data-dash-breakdown-canvas]').forEach((canvas) => {
            const idx = Number(canvas.dataset.idx);
            const item = slots[idx];
            if (!item || item.empty) return;
            const row = canvas.closest('.dash-breakdown-row');
            if (!row) return;
            const chart = createRowBar(canvas, item.percentage, CHART_INK);
            breakdownCharts.push(chart);
            bindBarHover(row, chart, CHART_INK);
        });
    }

    function syncCumulativeCharts(root) {
        destroyCumulativeCharts();
        const stats = dashStatsRef.value || {};
        const items = [
            { count: stats.cumulativeReceived || 0, accent: true },
            { count: stats.cumulativeClosed || 0, accent: false },
        ];
        const maxVal = Math.max(...items.map((it) => it.count), 1);

        root.querySelectorAll('[data-dash-cumulative-canvas]').forEach((canvas) => {
            const idx = Number(canvas.dataset.idx);
            const item = items[idx];
            if (!item) return;
            const row = canvas.closest('.dash-cumulative-item, .dash-cum-row, .dash-cum-band, .dash-cum-bar-cell, .dash-cum-metric-row, .dash-breakdown-row, .dash-stats-pair__cum');
            if (!row) return;
            const pct = Math.min(100, Math.round((item.count / maxVal) * 100));
            const color = item.accent ? CHART_ACCENT : CHART_INK;
            const chart = createRowBar(canvas, pct, color);
            cumulativeCharts.push(chart);
            bindBarHover(row, chart, color);
        });
    }

    function syncCharts() {
        const root = rootRef.value;
        if (!root || !isActiveRef.value) return;
        clearRowListeners();
        syncBreakdownCharts(root);
        syncCumulativeCharts(root);
    }

    function resizeCharts() {
        breakdownCharts.forEach((c) => c && c.resize());
        cumulativeCharts.forEach((c) => c && c.resize());
    }

    function destroyAll() {
        clearRowListeners();
        destroyBreakdownCharts();
        destroyCumulativeCharts();
    }

    watch(
        [isActiveRef, rootRef, dashBreakdownSlotsRef, dashStatsRef],
        () => {
            if (!isActiveRef.value || !rootRef.value) {
                if (!isActiveRef.value) destroyAll();
                return;
            }
            nextTick(syncCharts);
        },
        { deep: true }
    );

    onMounted(() => {
        if (isActiveRef.value) nextTick(syncCharts);
        window.addEventListener('resize', resizeCharts);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', resizeCharts);
        destroyAll();
    });

    return { syncDashboardCharts: syncCharts };
}
