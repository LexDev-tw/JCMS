/** Chart.js 俸表棒棒糖圖（透明 bar 定位 + canvas 手繪 stem／圓頭） */
import { watch, onMounted, onUnmounted, nextTick } from '../vue-api.js?v=0.1.20260626';
import { payscaleRowTotal } from './personal-admin-shared.js?v=0.1.20260626';

const CHART_INK = '#111111';
const CHART_ACCENT = '#F05A28';
const CHART_MUTED = '#666666';
const CHART_GRID = 'rgba(234, 234, 234, 0.95)';
const CHART_REF_LABEL = '#999999';

/** Y 軸金額參考線（元；刻度不顯示，僅繪水平線） */
const PAYSCALE_Y_REFERENCE_LINES = [120000, 160000, 200000];

function createPayscaleReferenceLinesPlugin(formatMoney) {
    return {
        id: 'payscaleReferenceLines',
        beforeDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const yScale = chart.scales.y;
            const { left, right, top, bottom } = chart.chartArea;

            ctx.save();
            ctx.strokeStyle = CHART_GRID;
            ctx.lineWidth = 1;
            ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
            ctx.fillStyle = CHART_REF_LABEL;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';

            PAYSCALE_Y_REFERENCE_LINES.forEach((amount) => {
                const y = yScale.getPixelForValue(amount);
                if (y < top || y > bottom) return;
                ctx.beginPath();
                ctx.moveTo(left, y + 0.5);
                ctx.lineTo(right, y + 0.5);
                ctx.stroke();
                ctx.fillText(formatMoney(amount), right, y - 3);
            });

            ctx.restore();
        },
    };
}

function headRadiusPx(grade, barHeightPx, markedGrade) {
    if (!barHeightPx) return 0;
    const marked = markedGrade > 0 && grade === markedGrade;
    const want = marked ? 12 : 5;
    return Math.min(want, Math.max(4, barHeightPx));
}

function createPayscaleLollipopPlugin({ totals, getMarkedGrade, getHoverIndex, formatMoney }) {
    return {
        id: 'payscaleLollipop',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            const yScale = chart.scales.y;
            const baseY = yScale.getPixelForValue(0);
            const markedGrade = getMarkedGrade();
            const hoverIndex = getHoverIndex();

            ctx.save();

            ctx.strokeStyle = 'rgba(10, 10, 10, 0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chart.chartArea.left, baseY + 0.5);
            ctx.lineTo(chart.chartArea.right, baseY + 0.5);
            ctx.stroke();

            meta.data.forEach((bar, idx) => {
                if (!bar || bar.skip) return;
                const grade = idx + 1;
                const marked = markedGrade > 0 && grade === markedGrade;
                const color = marked ? CHART_ACCENT : CHART_INK;
                const x = bar.x;
                const topY = bar.y;
                const barHeightPx = Math.max(0, baseY - topY);
                const headR = headRadiusPx(grade, barHeightPx, markedGrade) / 2;
                const headCenterY = topY + headR;
                const stemTop = headCenterY + headR;
                const stemH = Math.max(0, baseY - stemTop);

                if (stemH > 0) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x - 1, stemTop, 2, stemH);
                }

                if (headR > 0) {
                    ctx.beginPath();
                    ctx.arc(x, headCenterY, headR, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                }

                const showAmount = marked || hoverIndex === idx;
                if (showAmount && totals[idx] > 0) {
                    ctx.font = 'bold 10px ui-monospace, SFMono-Regular, Menlo, monospace';
                    ctx.fillStyle = marked ? CHART_ACCENT : CHART_INK;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(formatMoney(totals[idx]), x, topY - 4);
                }
            });

            ctx.restore();
        },
    };
}

/**
 * @param {object} opts
 * @param {import('vue').Ref<HTMLCanvasElement|null>} opts.canvasRef
 * @param {import('vue').ComputedRef<object[]>} opts.rowsRef
 * @param {() => number} opts.getMyGrade
 * @param {(grade: number) => void} opts.setMyGrade
 * @param {(n: number) => string} opts.formatMoney
 * @param {import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>} opts.isActiveRef
 */
export function usePayscaleChart({ canvasRef, rowsRef, getMyGrade, setMyGrade, formatMoney, isActiveRef }) {
    /** @type {import('chart.js').Chart|null} */
    let chartInstance = null;
    let hoverIndex = -1;

    function destroyChart() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        hoverIndex = -1;
    }

    function buildChart() {
        const canvas = canvasRef.value;
        if (!canvas || typeof Chart === 'undefined') return;

        const rows = rowsRef.value || [];
        if (!rows.length) {
            destroyChart();
            return;
        }

        const labels = rows.map((r) => String(r.grade));
        const totals = rows.map((r) => payscaleRowTotal(r));
        const maxTotal = Math.max(...totals, ...PAYSCALE_Y_REFERENCE_LINES, 1);

        destroyChart();

        chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: '合計',
                        data: totals,
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                        borderWidth: 0,
                        barPercentage: 0.92,
                        categoryPercentage: 0.98,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 18, right: 4, bottom: 0, left: 4 } },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: (ctx) => {
                                const g = parseInt(ctx.tick.label, 10);
                                const marked = getMyGrade();
                                return marked > 0 && g === marked ? CHART_ACCENT : CHART_MUTED;
                            },
                            font: {
                                family: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                size: 10,
                                weight: '700',
                            },
                            padding: 4,
                        },
                    },
                    y: {
                        display: false,
                        beginAtZero: true,
                        max: maxTotal * 1.02,
                    },
                },
                onHover: (_evt, elements) => {
                    const next = elements.length ? elements[0].index : -1;
                    if (next !== hoverIndex) {
                        hoverIndex = next;
                        chartInstance?.update('none');
                    }
                    if (canvas) canvas.style.cursor = elements.length ? 'pointer' : 'default';
                },
                onClick: (_evt, elements) => {
                    if (!elements.length) return;
                    const grade = elements[0].index + 1;
                    const cur = getMyGrade();
                    setMyGrade(cur === grade ? 0 : grade);
                    chartInstance?.update('none');
                },
            },
            plugins: [
                createPayscaleReferenceLinesPlugin(formatMoney),
                createPayscaleLollipopPlugin({
                    totals,
                    getMarkedGrade: getMyGrade,
                    getHoverIndex: () => hoverIndex,
                    formatMoney,
                }),
            ],
        });
    }

    function refreshChart() {
        if (chartInstance) {
            chartInstance.resize();
            chartInstance.update('none');
        } else {
            buildChart();
        }
    }

    watch(
        rowsRef,
        () => {
            nextTick(buildChart);
        },
        { deep: true }
    );

    watch(
        () => getMyGrade(),
        () => {
            chartInstance?.update('none');
        }
    );

    watch(isActiveRef, (active) => {
        if (!active) return;
        nextTick(refreshChart);
    });

    onMounted(() => {
        if (isActiveRef.value) nextTick(buildChart);
    });

    onUnmounted(() => {
        destroyChart();
    });

    return { rebuildPayscaleChart: buildChart };
}
