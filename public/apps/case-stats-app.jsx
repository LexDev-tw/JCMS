/**
 * 案件統計 — JCMS Neo-Swiss
 * 依賴：Chart.js（見 JCMS.html CDN）、React 18 UMD
 */
(function () {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const CHART_PALETTE = ['#111111', '#666666', '#F05A28', '#999999', '#FCA311'];
  const CHART = Object.freeze({
    ink: '#111111',
    muted: '#666666',
    accent: '#F05A28',
    grid: '#EAEAEA',
    panel: '#F7F7F5',
    typeColors: { 士補: '#111111', 士簡: '#666666', 士小: '#F05A28' },
  });

  const CHART_BAR_SLIM = Object.freeze({
    barPercentage: 0.28,
    categoryPercentage: 0.58,
    maxBarThickness: 14,
  });

  const CHART_LAYOUT = Object.freeze({
    yAxisWidth: 44,
    xAxisHeight: 52,
    plotHeightClass: 'h-[228px]',
    headerMinHeightClass: 'min-h-[42px]',
    legendHeightClass: 'h-7',
    padding: { top: 6, right: 8, bottom: 0, left: 0 },
    xTitlePadding: { top: 6, bottom: 0 },
    xTickPadding: 4,
    xTickRotation: 0,
    xMaxTicksLimit: 12,
  });

  const RAW_HEAD =
    'py-1.5 px-1 text-[9px] font-bold uppercase tracking-widest text-ink-900 whitespace-nowrap';
  const RAW_CELL = 'py-1 px-1 flex items-center min-h-8 h-8';
  /** 對齊年度列「民國 YYY 年」文字起點（px-1 + caret 13px + gap-2） */
  const YM_INDENT = 'pl-[var(--swiss-expand-indent-caret)]';
  const RAW_TABLE_PAIR = 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 lg:items-stretch';
  const RAW_TABLE_LEFT = 'grid min-w-0 items-center lg:pr-4';
  const RAW_TABLE_RIGHT = 'grid min-w-0 items-center lg:pl-2';
  const SETTLE_GRID_COLUMNS =
    '4.5rem repeat(4, minmax(2.5rem, 1fr)) minmax(2.75rem, 1fr) minmax(5.5rem, auto)';
  const YM_TEXT = 'font-mono tabular-nums text-[11px] font-bold text-ink-900 whitespace-nowrap';
  const SETTLE_ACTIONS = 'flex shrink-0 items-center justify-end gap-0.5 whitespace-nowrap';

  const TOKENS = Object.freeze({
    input: 'swiss-input rounded-sm min-w-0 font-sans text-ink-900',
    inputMono: 'swiss-input rounded-sm min-w-0 font-mono tabular-nums text-ink-900 text-right',
    select: 'swiss-select rounded-sm min-w-0 font-sans font-bold text-ink-900 h-8',
    btnPrimary: 'swiss-btn swiss-btn--primary',
    btnDanger: 'swiss-btn swiss-btn--danger',
    btnGhost: 'swiss-btn swiss-btn--ghost',
  });

  function newId() {
    return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeRocMonth5(s) {
    return String(s || '').replace(/\D/g, '').slice(0, 5);
  }

  function formatYmLabel(ym) {
    const s = normalizeRocMonth5(ym);
    if (s.length !== 5) return s || '—';
    return `${s.slice(0, 3)}/${s.slice(3, 5)}`;
  }

  function sortByYm(a, b) {
    return normalizeRocMonth5(a.ym).localeCompare(normalizeRocMonth5(b.ym));
  }

  function parseCount(raw) {
    const n = parseInt(String(raw || '').replace(/,/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function calcPending(row) {
    return parseCount(row.carryOver) + parseCount(row.newIntake) - parseCount(row.closed);
  }

  function getPreviousRocMonth5(ym) {
    const s = normalizeRocMonth5(ym);
    if (s.length !== 5) return '';
    let ry = parseInt(s.slice(0, 3), 10);
    let m = parseInt(s.slice(3, 5), 10);
    m -= 1;
    if (m < 1) {
      m = 12;
      ry -= 1;
    }
    if (ry < 0) return '';
    return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
  }

  function formatPendingDelta(currentPending, prevPending) {
    if (currentPending == null || prevPending == null) {
      return { text: '—', increased: false };
    }
    const curr = typeof currentPending === 'number' ? currentPending : parseCount(currentPending);
    const prev = typeof prevPending === 'number' ? prevPending : parseCount(prevPending);
    const delta = curr - prev;
    if (delta > 0) return { text: `+${delta}`, increased: true };
    if (delta === 0) return { text: '+0', increased: false };
    return { text: String(delta), increased: false };
  }

  function calcClosedFromPending(row) {
    return parseCount(row.carryOver) + parseCount(row.newIntake) - parseCount(row.pending);
  }

  function buildSettlementFromInputs(carryOverRaw, newIntakeRaw, pendingRaw) {
    const carryOver = parseCount(carryOverRaw);
    const newIntake = parseCount(newIntakeRaw);
    const pending = parseCount(pendingRaw);
    const closed = carryOver + newIntake - pending;
    if (pending > carryOver + newIntake) {
      return { ok: false, error: '未結不可大於舊受加新收' };
    }
    if (closed < 0) {
      return { ok: false, error: '已結不可為負數，請調整未結數值' };
    }
    return { ok: true, carryOver, newIntake, pending, closed };
  }


  const STORAGE_KEY = 'jcms_case_stats_v1';

  function normalizeCaseWord(word) {
    return String(word || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/年/g, '')
      .replace(/字/g, '');
  }

  function splitCaseWordMembers(text) {
    const s = String(text || '')
      .replace(/[,，、]/g, ' ')
      .trim();
    if (!s) return [];
    return s
      .split(/\s+/)
      .map((m) => normalizeCaseWord(m))
      .filter(Boolean);
  }

  function buildWordGroupRules(caseWordGroups) {
    const groupsRaw = Array.isArray(caseWordGroups) ? caseWordGroups : [];
    return groupsRaw
      .map((g) => {
        const name = normalizeCaseWord(g?.name || '');
        const members = Array.isArray(g?.members)
          ? g.members.map((m) => normalizeCaseWord(m)).filter(Boolean)
          : splitCaseWordMembers(g?.membersText || '');
        return { name, members };
      })
      .filter((g) => g.name);
  }

  function resolveWordGroupLabel(word, rules) {
    const w = normalizeCaseWord(word);
    if (!w) return '其他';
    const hit = rules.find((g) => g.name === w || g.members.includes(w));
    return hit ? hit.name : w;
  }

  function formatCaseNo(c) {
    const y = String(c?.year || '').trim();
    const w = normalizeCaseWord(c?.word);
    const n = String(c?.number || '').replace(/\D/g, '');
    const num = n ? String(parseInt(n, 10) || 0) : '';
    return `${y}${w}${num}` || String(c?.id || '');
  }

  function caseReceiveYm(c) {
    const digits = String(c?.dates || '').replace(/\D/g, '');
    if (digits.length < 7) return '';
    return digits.slice(0, 5);
  }

  function computeNewCaseStats(cases, workspaceId, caseWordGroups) {
    const rules = buildWordGroupRules(caseWordGroups);
    const ws = String(workspaceId || 'WS_001');
    const map = new Map();
    for (const c of Array.isArray(cases) ? cases : []) {
      if (String(c.workspaceId || 'WS_001') !== ws) continue;
      const ym = caseReceiveYm(c);
      if (ym.length !== 5) continue;
      const groupLabel = resolveWordGroupLabel(c.word, rules);
      const key = `${ym}|${groupLabel}`;
      if (!map.has(key)) {
        map.set(key, { ym, groupLabel, count: 0, caseNos: [] });
      }
      const row = map.get(key);
      row.count += 1;
      const no = formatCaseNo(c);
      if (no) row.caseNos.push(no);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ymCmp = normalizeRocMonth5(a.ym).localeCompare(normalizeRocMonth5(b.ym));
      if (ymCmp !== 0) return ymCmp;
      return a.groupLabel.localeCompare(b.groupLabel, 'zh-Hant');
    });
  }

  function getOrderedGroupLabels(statsRows, rules) {
    const fromRules = rules.map((r) => r.name);
    const fromData = [...new Set(statsRows.map((r) => r.groupLabel).filter(Boolean))];
    return [...new Set([...fromRules, ...fromData])].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }

  function getCurrentRocMonth5() {
    const now = new Date();
    const ry = now.getFullYear() - 1911;
    const m = now.getMonth() + 1;
    return `${String(ry).padStart(3, '0')}${String(m).padStart(2, '0')}`;
  }

  function buildAlignedMonths(newCaseStats, settlementRows) {
    const set = new Set();
    for (const r of newCaseStats) {
      const ym = normalizeRocMonth5(r.ym);
      if (ym.length === 5) set.add(ym);
    }
    for (const r of settlementRows) {
      const ym = normalizeRocMonth5(r.ym);
      if (ym.length === 5) set.add(ym);
    }
    const currentYm = getCurrentRocMonth5();
    if (currentYm.length === 5) set.add(currentYm);
    return [...set].sort();
  }

  function defaultCollapsedYears(yearGroups) {
    const currentYear = getCurrentRocMonth5().slice(0, 3);
    return new Set(
      yearGroups.map(([year]) => year).filter((year) => year !== currentYear)
    );
  }

  function groupMonthsByRocYear(months) {
    const map = new Map();
    for (const ym of months) {
      const s = normalizeRocMonth5(ym);
      const year = s.slice(0, 3);
      if (year.length !== 3) continue;
      if (!map.has(year)) map.set(year, []);
      map.get(year).push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function pivotNewCaseByMonth(newCaseStats, groupLabels, months) {
    const lookup = new Map();
    for (const r of newCaseStats) {
      lookup.set(`${normalizeRocMonth5(r.ym)}|${r.groupLabel}`, r.count);
    }
    return months.map((ym) => {
      const counts = {};
      for (const label of groupLabels) {
        const n = lookup.get(`${ym}|${label}`) || 0;
        counts[label] = n;
      }
      return { ym, counts };
    });
  }

  function pivotRowTotal(counts, groupLabels) {
    if (!counts || !groupLabels.length) return 0;
    return groupLabels.reduce((sum, label) => sum + (counts[label] || 0), 0);
  }

  function findPeakYms(rows, getValue) {
    let maxVal = -1;
    const peaks = [];
    for (const row of rows) {
      const raw = getValue(row);
      if (raw == null || raw === '') continue;
      const n = typeof raw === 'number' ? raw : parseCount(raw);
      if (n > maxVal) {
        maxVal = n;
        peaks.length = 0;
        peaks.push(normalizeRocMonth5(row.ym));
      } else if (n === maxVal && maxVal >= 0) {
        peaks.push(normalizeRocMonth5(row.ym));
      }
    }
    return new Set(peaks);
  }

  function createStackBarLabelPlugin(totals) {
    return {
      id: 'stackBarLabels',
      afterDatasetsDraw(chart) {
        if (!totals.length) return;
        const ctx = chart.ctx;
        const lastDsIdx = chart.data.datasets.length - 1;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = CHART.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let idx = 0; idx < totals.length; idx++) {
          const val = totals[idx];
          if (!val || val <= 0) continue;
          const bar = chart.getDatasetMeta(lastDsIdx).data[idx];
          if (!bar || bar.skip) continue;
          ctx.fillText(String(val), bar.x, bar.y - 4);
        }
        ctx.restore();
      },
    };
  }

  function createBarValueLabelPlugin(values, datasetIndex = 0) {
    return {
      id: `barValueLabels-${datasetIndex}`,
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.fillStyle = CHART.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let idx = 0; idx < values.length; idx++) {
          const val = typeof values[idx] === 'number' ? values[idx] : parseCount(values[idx]);
          if (val <= 0) continue;
          const bar = chart.getDatasetMeta(datasetIndex).data[idx];
          if (!bar || bar.skip) continue;
          ctx.fillText(String(val), bar.x, bar.y - 4);
        }
        ctx.restore();
      },
    };
  }

  function settlementRowsByMonths(settlementRows, months) {
    const map = new Map();
    for (const r of settlementRows) {
      map.set(normalizeRocMonth5(r.ym), r);
    }
    return months.map((ym) => {
      const row = map.get(ym);
      if (!row) {
        return {
          ym,
          id: null,
          carryOver: null,
          newIntake: null,
          closed: null,
          pending: null,
          hasRecord: false,
        };
      }
      return {
        ym,
        id: row.id,
        carryOver: parseCount(row.carryOver),
        newIntake: parseCount(row.newIntake),
        closed: parseCount(row.closed),
        pending: calcPending(row),
        hasRecord: true,
      };
    });
  }

  function displayStatCell(value) {
    if (value == null || value === '') return '—';
    const n = typeof value === 'number' ? value : parseCount(value);
    return n === 0 ? '—' : String(n);
  }

  function groupChartColor(label, index) {
    if (CHART.typeColors[label]) return CHART.typeColors[label];
    return CHART_PALETTE[index % CHART_PALETTE.length];
  }

  function getApiBaseUrl() {
    if (typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()) {
      const s = window.JCMS_API_BASE.trim().replace(/\/+$/, '');
      return /\/api$/i.test(s) ? s : `${s}/api`;
    }
    if (window.location.port === '3000') return '/api';
    return 'http://127.0.0.1:3000/api';
  }

  async function fetchCaseSourceFallback() {
    const base = getApiBaseUrl();
    try {
      const [casesRes, settingsRes] = await Promise.all([
        fetch(`${base}/cases`),
        fetch(`${base}/settings/app`),
      ]);
      let cases = [];
      let caseWordGroups = [];
      if (casesRes.ok) {
        const j = await casesRes.json();
        if (j.success && Array.isArray(j.data)) cases = j.data;
      }
      if (settingsRes.ok) {
        const j = await settingsRes.json();
        if (j.success && j.data?.data?.caseWordGroups) {
          caseWordGroups = j.data.data.caseWordGroups;
        }
      }
      return { cases, caseWordGroups };
    } catch {
      return { cases: [], caseWordGroups: [] };
    }
  }

  function readCaseSourceFromHost() {
    if (typeof window.__jcmsGetCaseStatsSource !== 'function') return null;
    const s = window.__jcmsGetCaseStatsSource();
    return {
      cases: Array.isArray(s?.cases) ? s.cases : [],
      caseWordGroups: Array.isArray(s?.caseWordGroups) ? s.caseWordGroups : [],
    };
  }

  function emptyWorkspaceData() {
    return { settlementRows: [] };
  }

  function getWorkspaceId() {
    if (typeof window.__jcmsGetCurrentWorkspaceId === 'function') {
      return String(window.__jcmsGetCurrentWorkspaceId() || 'WS_001');
    }
    return 'WS_001';
  }

  async function checkApiHealth() {
    try {
      const base =
        typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()
          ? window.JCMS_API_BASE.trim()
          : window.location.port === '3000'
            ? '/api'
            : 'http://127.0.0.1:3000/api';
      const res = await fetch(`${base.replace(/\/+$/, '')}/health`);
      if (!res.ok) return false;
      const j = await res.json();
      return j.status === 'ok';
    } catch {
      return false;
    }
  }

  async function fetchBlobFromApi() {
    try {
      const base =
        typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()
          ? window.JCMS_API_BASE.trim().replace(/\/+$/, '')
          : window.location.port === '3000'
            ? '/api'
            : 'http://127.0.0.1:3000/api';
      const url = /\/api$/i.test(base) ? `${base}/case-stats` : `${base}/api/case-stats`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.data) return null;
      return json.data;
    } catch {
      return null;
    }
  }

  async function saveBlobToApi(blob) {
    const base =
      typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()
        ? window.JCMS_API_BASE.trim().replace(/\/+$/, '')
        : window.location.port === '3000'
          ? '/api'
          : 'http://127.0.0.1:3000/api';
    const url = /\/api$/i.test(base) ? `${base}/case-stats` : `${base}/api/case-stats`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blob),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.error || `儲存失敗 (${res.status})`);
    }
    return json.data;
  }

  function sanitizeStatsBlob(raw) {
    if (!raw || typeof raw !== 'object') return { byWorkspace: {} };
    const byWorkspace = {};
    for (const [wsId, data] of Object.entries(raw.byWorkspace || {})) {
      byWorkspace[wsId] = {
        settlementRows: Array.isArray(data?.settlementRows) ? data.settlementRows : [],
      };
    }
    return { byWorkspace };
  }

  function mergeSettlementRows(localRows, remoteRows) {
    const byYm = new Map();
    for (const r of localRows || []) {
      const ym = normalizeRocMonth5(r?.ym);
      if (ym.length === 5) byYm.set(ym, r);
    }
    for (const r of remoteRows || []) {
      const ym = normalizeRocMonth5(r?.ym);
      if (ym.length === 5) byYm.set(ym, r);
    }
    return [...byYm.values()].sort(sortByYm);
  }

  function mergeStatsBlobs(localBlob, remoteBlob) {
    const local = sanitizeStatsBlob(localBlob);
    const remote = sanitizeStatsBlob(remoteBlob);
    const wsIds = new Set([
      ...Object.keys(local.byWorkspace || {}),
      ...Object.keys(remote.byWorkspace || {}),
    ]);
    const byWorkspace = {};
    for (const wsId of wsIds) {
      byWorkspace[wsId] = {
        settlementRows: mergeSettlementRows(
          local.byWorkspace[wsId]?.settlementRows,
          remote.byWorkspace[wsId]?.settlementRows
        ),
      };
    }
    return { byWorkspace };
  }

  function statsBlobRowCount(blob) {
    return Object.values(sanitizeStatsBlob(blob).byWorkspace || {}).reduce(
      (sum, ws) => sum + (Array.isArray(ws.settlementRows) ? ws.settlementRows.length : 0),
      0
    );
  }

  function buildStatsSavePayload(blob) {
    return {
      byWorkspace: Object.fromEntries(
        Object.entries(blob.byWorkspace || {}).map(([wsId, data]) => [
          wsId,
          { settlementRows: Array.isArray(data?.settlementRows) ? data.settlementRows : [] },
        ])
      ),
    };
  }

  function readLocalBlob() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { byWorkspace: {} };
      const v = JSON.parse(raw);
      return sanitizeStatsBlob(v && typeof v === 'object' ? v : { byWorkspace: {} });
    } catch {
      return { byWorkspace: {} };
    }
  }

  function writeLocalBlob(blob) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    } catch (e) {
      console.warn('案件統計 localStorage 寫入失敗', e);
    }
  }

  function CountInput({ value, onChange, onBlur, disabled, className, maxLength }) {
    return (
      <input
        type="text"
        inputMode="numeric"
        maxLength={maxLength}
        className={className || `${TOKENS.inputMono} h-8 w-full min-w-[3.5rem]`}
        value={value === '' || value == null ? '' : String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        onBlur={onBlur}
      />
    );
  }

  const SETTLE_CELL_INPUT =
    'attn-cell-input font-mono tabular-nums text-[11px] text-ink-900 text-right w-full min-w-0 h-8 border-0 bg-transparent outline-none focus:bg-ink-100/50';

  function SettleRowFields({
    ym,
    settleRow,
    prevPending,
    isPendingPeak,
    onCommit,
    onClear,
    actionClass,
  }) {
    const hasRecord = settleRow.hasRecord;
    const rowValues = useMemo(
      () => ({
        carryOver: hasRecord ? String(settleRow.carryOver ?? '') : '',
        newIntake: hasRecord ? String(settleRow.newIntake ?? '') : '',
        pending: hasRecord ? String(settleRow.pending ?? '') : '',
      }),
      [hasRecord, settleRow.carryOver, settleRow.newIntake, settleRow.pending, settleRow.id]
    );

    const [carryOver, setCarryOver] = useState(rowValues.carryOver);
    const [newIntake, setNewIntake] = useState(rowValues.newIntake);
    const [pending, setPending] = useState(rowValues.pending);

    useEffect(() => {
      setCarryOver(rowValues.carryOver);
      setNewIntake(rowValues.newIntake);
      setPending(rowValues.pending);
    }, [rowValues]);

    const closedDisplay = calcClosedFromPending({ carryOver, newIntake, pending });
    const currentPendingForDelta = pending === '' || pending == null ? null : parseCount(pending);
    const pendingDelta = formatPendingDelta(currentPendingForDelta, prevPending);
    const pendingPeakActive =
      isPendingPeak && pending === rowValues.pending && rowValues.pending !== '';

    const commit = () => {
      const allEmpty = carryOver === '' && newIntake === '' && pending === '';
      if (allEmpty) {
        if (hasRecord) onClear(ym, { silent: true });
        return;
      }
      if (!hasRecord && (carryOver === '' || newIntake === '' || pending === '')) {
        return;
      }
      const built = buildSettlementFromInputs(carryOver, newIntake, pending);
      if (!built.ok) {
        onCommit(ym, null, built.error);
        return;
      }
      onCommit(ym, built, null);
    };

    return (
      <>
        <div className={`${RAW_CELL} min-w-0 ${YM_INDENT}`}>
          <span className={YM_TEXT}>{formatYmLabel(ym)}</span>
        </div>
        <div className={`${RAW_CELL} min-w-0 justify-end`}>
          <CountInput
            value={carryOver}
            onChange={setCarryOver}
            onBlur={commit}
            className={SETTLE_CELL_INPUT}
          />
        </div>
        <div className={`${RAW_CELL} justify-end`}>
          <CountInput
            value={newIntake}
            onChange={setNewIntake}
            onBlur={commit}
            className={SETTLE_CELL_INPUT}
          />
        </div>
        <div className={`${RAW_CELL} justify-end`}>
          <span className="font-mono tabular-nums text-[11px] text-ink-900">
            {displayStatCell(closedDisplay)}
          </span>
        </div>
        <div className={`${RAW_CELL} justify-end`}>
          <CountInput
            value={pending}
            onChange={setPending}
            onBlur={commit}
            className={`${SETTLE_CELL_INPUT}${pendingPeakActive ? ' font-bold text-accent' : ''}`}
          />
        </div>
        <div className={`${RAW_CELL} justify-end`}>
          <span
            className={`font-mono tabular-nums text-[11px] font-bold ${
              pendingDelta.text === '—'
                ? 'text-ink-900'
                : pendingDelta.increased
                  ? 'text-accent'
                  : 'text-ink-900'
            }`}
          >
            {pendingDelta.text}
          </span>
        </div>
        <div className={`${RAW_CELL} justify-end`}>
          <div className={SETTLE_ACTIONS}>
            {hasRecord ? (
              <button
                type="button"
                className={`swiss-ghost-action text-[10px] ${actionClass}`}
                onClick={() => onClear(ym)}
              >
                清空
              </button>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  function useChart(canvasRef, buildConfig, deps) {
    const chartRef = useRef(null);
    useEffect(() => {
      const el = canvasRef.current;
      if (!el || typeof Chart === 'undefined') return undefined;
      const cfg = buildConfig();
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      if (!cfg) return undefined;
      chartRef.current = new Chart(el, cfg);
      return () => {
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, deps);
  }

  function ChartBlock({ title, subtitle, legendItems, children }) {
    return (
      <section className="flex min-w-0 flex-col gap-2">
        <div className={`swiss-section-heading ${CHART_LAYOUT.headerMinHeightClass}`}>
          <h3 className="swiss-section-heading__title">{title}</h3>
          {subtitle ? <p className="swiss-section-subtitle">{subtitle}</p> : null}
        </div>
        <div className="flex min-w-0 flex-col">
          {legendItems?.length ? <ChartLegendStrip items={legendItems} /> : null}
          <div className={`relative w-full ${CHART_LAYOUT.plotHeightClass}`}>{children}</div>
        </div>
      </section>
    );
  }

  function ChartLegendStrip({ items }) {
    return (
      <div
        className={`flex ${CHART_LAYOUT.legendHeightClass} flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2`}
        aria-hidden
      >
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 font-sans text-[10px] text-ink-600"
          >
            {item.kind === 'line' ? (
              <span
                className="inline-block h-0 w-3 shrink-0 border-t-2"
                style={{ borderColor: item.color }}
              />
            ) : (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: item.color }}
              />
            )}
            {item.label}
          </span>
        ))}
      </div>
    );
  }

  function chartAxisOptions(yTitle) {
    return {
      x: {
        title: {
          display: true,
          text: '年月',
          color: CHART.muted,
          font: { size: 10, family: 'Inter, "Noto Sans TC", sans-serif' },
          padding: CHART_LAYOUT.xTitlePadding,
        },
        ticks: {
          color: CHART.muted,
          font: { size: 10, family: 'ui-monospace, monospace' },
          padding: CHART_LAYOUT.xTickPadding,
          maxRotation: CHART_LAYOUT.xTickRotation,
          minRotation: CHART_LAYOUT.xTickRotation,
          autoSkip: true,
          maxTicksLimit: CHART_LAYOUT.xMaxTicksLimit,
        },
        grid: { color: CHART.grid, drawBorder: false },
        afterFit(scale) {
          scale.height = CHART_LAYOUT.xAxisHeight;
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: yTitle || '案件數',
          color: CHART.muted,
          font: { size: 10, family: 'Inter, "Noto Sans TC", sans-serif' },
        },
        ticks: { color: CHART.muted, font: { size: 10, family: 'ui-monospace, monospace' } },
        grid: { color: CHART.grid, drawBorder: false },
        afterFit(scale) {
          scale.width = CHART_LAYOUT.yAxisWidth;
        },
      },
    };
  }

  function StatsDashboard({ settlementRows, newCaseStats, groupLabels }) {
    const stackRef = useRef(null);
    const comboRef = useRef(null);

    const sortedSettlement = useMemo(
      () => [...settlementRows].sort(sortByYm),
      [settlementRows]
    );

    const settlementByYm = useMemo(() => {
      const map = new Map();
      for (const r of sortedSettlement) {
        map.set(normalizeRocMonth5(r.ym), r);
      }
      return map;
    }, [sortedSettlement]);

    const chartMonths = useMemo(
      () => buildAlignedMonths(newCaseStats, settlementRows),
      [newCaseStats, settlementRows]
    );

    const chartMonthLabels = useMemo(() => chartMonths.map(formatYmLabel), [chartMonths]);

    const chartBaseOptions = useMemo(
      () => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { ...CHART_LAYOUT.padding } },
        plugins: { legend: { display: false } },
      }),
      []
    );

    const stackLegendItems = useMemo(
      () =>
        groupLabels.map((label, idx) => ({
          label,
          color: groupChartColor(label, idx),
          kind: 'bar',
        })),
      [groupLabels]
    );

    const comboLegendItems = useMemo(
      () => [
        { label: '未結', color: CHART.ink, kind: 'bar' },
        { label: '新收', color: CHART.muted, kind: 'line' },
        { label: '已結', color: CHART.accent, kind: 'line' },
      ],
      []
    );

    useChart(
      stackRef,
      () => {
        if (!chartMonths.length || !groupLabels.length) return null;
        const datasets = groupLabels.map((label, idx) => ({
          label,
          data: chartMonths.map((ym) =>
            newCaseStats
              .filter((r) => normalizeRocMonth5(r.ym) === ym && r.groupLabel === label)
              .reduce((sum, r) => sum + r.count, 0)
          ),
          backgroundColor: groupChartColor(label, idx),
          borderRadius: 0,
          stack: 'intake',
          ...CHART_BAR_SLIM,
        }));
        const stackTotals = chartMonths.map((_, i) =>
          datasets.reduce((sum, ds) => sum + (ds.data[i] || 0), 0)
        );
        return {
          type: 'bar',
          data: { labels: chartMonthLabels, datasets },
          options: {
            ...chartBaseOptions,
            datasets: { bar: { ...CHART_BAR_SLIM } },
            scales: {
              ...chartAxisOptions('案件數'),
              x: { ...chartAxisOptions('案件數').x, stacked: true },
              y: { ...chartAxisOptions('案件數').y, stacked: true },
            },
          },
          plugins: [createStackBarLabelPlugin(stackTotals)],
        };
      },
      [chartMonths, chartMonthLabels, newCaseStats, groupLabels, chartBaseOptions]
    );

    useChart(
      comboRef,
      () => {
        if (!chartMonths.length) return null;
        const pendingValues = chartMonths.map((ym) => {
          const row = settlementByYm.get(ym);
          return row ? calcPending(row) : 0;
        });
        return {
          type: 'bar',
          data: {
            labels: chartMonthLabels,
            datasets: [
              {
                type: 'bar',
                label: '未結',
                data: pendingValues,
                backgroundColor: CHART.ink,
                borderColor: CHART.ink,
                borderWidth: 0,
                borderRadius: 0,
                order: 2,
                ...CHART_BAR_SLIM,
              },
              {
                type: 'line',
                label: '新收',
                data: chartMonths.map((ym) => parseCount(settlementByYm.get(ym)?.newIntake)),
                borderColor: CHART.muted,
                backgroundColor: CHART.muted,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 4,
                tension: 0.2,
                fill: false,
                order: 1,
              },
              {
                type: 'line',
                label: '已結',
                data: chartMonths.map((ym) => parseCount(settlementByYm.get(ym)?.closed)),
                borderColor: CHART.accent,
                backgroundColor: CHART.accent,
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 4,
                tension: 0.2,
                fill: false,
                order: 0,
              },
            ],
          },
          options: {
            ...chartBaseOptions,
            datasets: { bar: { ...CHART_BAR_SLIM } },
            scales: chartAxisOptions('案件數'),
          },
          plugins: [createBarValueLabelPlugin(pendingValues, 0)],
        };
      },
      [chartMonths, chartMonthLabels, settlementByYm, chartBaseOptions]
    );

    const hasAnyChart = chartMonths.length > 0 || newCaseStats.length > 0;

    if (!hasAnyChart) {
      return (
        <div className="py-8 text-center text-[11px] font-mono uppercase tracking-widest text-ink-400">
          尚無圖表資料，請於下方表格新增收結紀錄。
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartBlock title="每月新分案統計" subtitle="CASE LIST INTAKE DATES" legendItems={stackLegendItems}>
          {chartMonths.length && groupLabels.length ? (
            <canvas ref={stackRef} className="block h-full w-full" />
          ) : (
            <EmptyChartHint text="案件清單尚無有效收案日期" />
          )}
        </ChartBlock>
        <ChartBlock title="每月收結情形" subtitle="INTAKE & CLOSURE" legendItems={comboLegendItems}>
          {chartMonths.length ? (
            <canvas ref={comboRef} className="block h-full w-full" />
          ) : (
            <EmptyChartHint text="需收結情形表資料" />
          )}
        </ChartBlock>
      </div>
    );
  }

  function EmptyChartHint({ text }) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] font-mono uppercase tracking-widest text-ink-400">
        {text}
      </div>
    );
  }

  function CaseStatsApp() {
    const [workspaceId, setWorkspaceId] = useState(getWorkspaceId);
    const [blob, setBlob] = useState({ byWorkspace: {} });
    const [caseSource, setCaseSource] = useState({ cases: [], caseWordGroups: [] });
    const [hydrated, setHydrated] = useState(false);
    const [saveState, setSaveState] = useState('idle');
    const [notice, setNotice] = useState('');
    const saveTimerRef = useRef(null);
    const suppressSaveRef = useRef(false);
    const blobRef = useRef({ byWorkspace: {} });
    const hydratedRef = useRef(false);

    const persistStatsBlob = useCallback(async (sourceBlob, { requireApi } = {}) => {
      const payload = buildStatsSavePayload(sourceBlob);
      writeLocalBlob(payload);
      const apiOk = await checkApiHealth();
      if (apiOk) {
        await saveBlobToApi(payload);
        setSaveState('saved');
        setNotice('');
        return { ok: true, apiOk: true };
      }
      if (requireApi) {
        setSaveState('error');
        setNotice('無法連線資料庫，收結資料僅暫存於瀏覽器');
        return { ok: false, apiOk: false };
      }
      setSaveState('local');
      setNotice('離線暫存，連線後將自動同步至資料庫');
      return { ok: true, apiOk: false };
    }, []);

    const flushStatsSave = useCallback(async () => {
      if (!hydratedRef.current || suppressSaveRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setSaveState('saving');
      try {
        await persistStatsBlob(blobRef.current);
      } catch (e) {
        setSaveState('error');
        setNotice(String(e.message || e));
      }
    }, [persistStatsBlob]);

    const wsData = useMemo(() => {
      const ws = blob.byWorkspace?.[workspaceId];
      return ws && typeof ws === 'object' ? ws : emptyWorkspaceData();
    }, [blob, workspaceId]);

    const settlementRows = wsData.settlementRows || [];

    const wordGroupRules = useMemo(
      () => buildWordGroupRules(caseSource.caseWordGroups),
      [caseSource.caseWordGroups]
    );

    const newCaseStats = useMemo(
      () => computeNewCaseStats(caseSource.cases, workspaceId, caseSource.caseWordGroups),
      [caseSource.cases, caseSource.caseWordGroups, workspaceId]
    );

    const groupLabels = useMemo(
      () => getOrderedGroupLabels(newCaseStats, wordGroupRules),
      [newCaseStats, wordGroupRules]
    );

    const alignedMonths = useMemo(
      () => buildAlignedMonths(newCaseStats, settlementRows),
      [newCaseStats, settlementRows]
    );

    const pivotNewCaseRows = useMemo(
      () => pivotNewCaseByMonth(newCaseStats, groupLabels, alignedMonths),
      [newCaseStats, groupLabels, alignedMonths]
    );

    const alignedSettlementRows = useMemo(
      () => settlementRowsByMonths(settlementRows, alignedMonths),
      [settlementRows, alignedMonths]
    );

    const pendingByYm = useMemo(() => {
      const map = new Map();
      for (const r of settlementRows) {
        const ym = normalizeRocMonth5(r.ym);
        if (ym.length === 5) map.set(ym, calcPending(r));
      }
      return map;
    }, [settlementRows]);

    const showNewCaseTotalColumn = groupLabels.length > 1;

    const newCasePeakYms = useMemo(
      () =>
        findPeakYms(pivotNewCaseRows, (row) => pivotRowTotal(row.counts, groupLabels)),
      [pivotNewCaseRows, groupLabels]
    );

    const settlePeakPendingYms = useMemo(
      () =>
        findPeakYms(alignedSettlementRows, (row) =>
          row.hasRecord ? row.pending : null
        ),
      [alignedSettlementRows]
    );

    const newCaseGridColumns = showNewCaseTotalColumn
      ? `4.5rem ${groupLabels.map(() => 'minmax(2.25rem, 1fr)').join(' ')} minmax(2.5rem, 1fr)`
      : `4.5rem ${groupLabels.map(() => 'minmax(2.25rem, 1fr)').join(' ') || '1fr'}`;

    const updateWorkspaceData = useCallback(
      (updater) => {
        setBlob((prev) => {
          const next = { ...prev, byWorkspace: { ...(prev.byWorkspace || {}) } };
          const cur = next.byWorkspace[workspaceId] || emptyWorkspaceData();
          next.byWorkspace[workspaceId] = updater({ ...cur });
          return next;
        });
      },
      [workspaceId]
    );

    useEffect(() => {
      blobRef.current = blob;
    }, [blob]);

    useEffect(() => {
      hydratedRef.current = hydrated;
    }, [hydrated]);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        const ls = sanitizeStatsBlob(readLocalBlob());
        const apiOk = await checkApiHealth();
        let merged = ls;
        if (apiOk) {
          const remote = await fetchBlobFromApi();
          merged = mergeStatsBlobs(ls, remote || { byWorkspace: {} });
          writeLocalBlob(merged);
        }
        if (!cancelled) {
          suppressSaveRef.current = true;
          setBlob(sanitizeStatsBlob(merged));
          setHydrated(true);
          const localRows = statsBlobRowCount(ls);
          const mergedRows = statsBlobRowCount(merged);
          if (apiOk && mergedRows > 0 && mergedRows >= localRows) {
            try {
              await persistStatsBlob(merged);
            } catch (e) {
              setSaveState('error');
              setNotice(String(e.message || e));
            }
          } else if (!apiOk && mergedRows > 0) {
            setSaveState('local');
            setNotice('離線暫存，連線後將自動同步至資料庫');
          }
          setTimeout(() => {
            suppressSaveRef.current = false;
          }, 0);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [persistStatsBlob]);

    useEffect(() => {
      window.__jcmsOnWorkspaceChange = (ws) => {
        setWorkspaceId(String(ws || 'WS_001'));
      };
      return () => {
        if (window.__jcmsOnWorkspaceChange) delete window.__jcmsOnWorkspaceChange;
      };
    }, []);

    useEffect(() => {
      let cancelled = false;
      async function refreshCaseSource() {
        const host = readCaseSourceFromHost();
        if (host) {
          if (!cancelled) setCaseSource(host);
          return;
        }
        const fallback = await fetchCaseSourceFallback();
        if (!cancelled) setCaseSource(fallback);
      }
      refreshCaseSource();
      const timer = setInterval(refreshCaseSource, 3000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [workspaceId]);

    useEffect(() => {
      if (!hydrated || suppressSaveRef.current) return undefined;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveState('saving');
        try {
          await persistStatsBlob(blobRef.current);
        } catch (e) {
          setSaveState('error');
          setNotice(String(e.message || e));
        }
      }, 400);
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, [blob, hydrated, persistStatsBlob]);

    useEffect(() => {
      const onBeforeUnload = () => {
        if (!hydratedRef.current || suppressSaveRef.current) return;
        writeLocalBlob(buildStatsSavePayload(blobRef.current));
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        flushStatsSave();
      };
    }, [flushStatsSave]);

    const alignedMonthGroups = useMemo(
      () => groupMonthsByRocYear(alignedMonths),
      [alignedMonths]
    );

    const [collapsedYears, setCollapsedYears] = useState(null);
    const collapsedYearsKeyRef = useRef('');

    const effectiveCollapsedYears = useMemo(() => {
      if (collapsedYears) return collapsedYears;
      return defaultCollapsedYears(alignedMonthGroups);
    }, [collapsedYears, alignedMonthGroups]);

    useEffect(() => {
      if (!hydrated || !alignedMonthGroups.length) return;
      const key = alignedMonthGroups.map(([year]) => year).join(',');
      if (collapsedYearsKeyRef.current === key) return;
      collapsedYearsKeyRef.current = key;
      setCollapsedYears(defaultCollapsedYears(alignedMonthGroups));
    }, [hydrated, alignedMonthGroups]);

    const allYearsCollapsed =
      alignedMonthGroups.length > 0 &&
      alignedMonthGroups.every(([year]) => effectiveCollapsedYears.has(year));

    const toggleYearSection = useCallback(
      (year) => {
        setCollapsedYears((prev) => {
          const base = prev ?? defaultCollapsedYears(alignedMonthGroups);
          const next = new Set(base);
          if (next.has(year)) next.delete(year);
          else next.add(year);
          return next;
        });
      },
      [alignedMonthGroups]
    );

    const toggleAllYearSections = useCallback(() => {
      if (allYearsCollapsed) {
        setCollapsedYears(new Set());
        return;
      }
      setCollapsedYears(new Set(alignedMonthGroups.map(([year]) => year)));
    }, [allYearsCollapsed, alignedMonthGroups]);

    const collapsePriorYears = useCallback(() => {
      setCollapsedYears(defaultCollapsedYears(alignedMonthGroups));
    }, [alignedMonthGroups]);

    const commitSettleRow = useCallback(
      (ym, built, error) => {
        if (error) {
          setNotice(error);
          return;
        }
        if (!built) return;
        const rowYm = normalizeRocMonth5(ym);
        updateWorkspaceData((cur) => {
          const idx = cur.settlementRows.findIndex((r) => normalizeRocMonth5(r.ym) === rowYm);
          if (idx >= 0) {
            const next = [...cur.settlementRows];
            next[idx] = {
              ...next[idx],
              carryOver: built.carryOver,
              newIntake: built.newIntake,
              closed: built.closed,
            };
            return { ...cur, settlementRows: next };
          }
          return {
            ...cur,
            settlementRows: [
              ...cur.settlementRows,
              {
                id: newId(),
                ym: rowYm,
                carryOver: built.carryOver,
                newIntake: built.newIntake,
                closed: built.closed,
              },
            ].sort(sortByYm),
          };
        });
        setNotice('');
      },
      [updateWorkspaceData]
    );

    const clearSettleRow = useCallback(
      (ym, { silent } = {}) => {
        const rowYm = normalizeRocMonth5(ym);
        const existing = settlementRows.some((r) => normalizeRocMonth5(r.ym) === rowYm);
        if (!existing) return;
        if (!silent && !window.confirm('確定清空此月份收結資料？')) return;
        updateWorkspaceData((cur) => ({
          ...cur,
          settlementRows: cur.settlementRows.filter((r) => normalizeRocMonth5(r.ym) !== rowYm),
        }));
        setNotice('');
      },
      [settlementRows, updateWorkspaceData]
    );

    const settleRowActionClass =
      'whitespace-nowrap opacity-55 transition-opacity group-hover:opacity-100 focus-visible:opacity-100';

    const renderAlignedMonthRow = (ym) => {
      const idx = alignedMonths.indexOf(normalizeRocMonth5(ym));
      if (idx < 0) return null;
      const pivotRow = pivotNewCaseRows[idx];
      const settleRow = alignedSettlementRows[idx];
      const rowYm = normalizeRocMonth5(ym);
      const prevYm = getPreviousRocMonth5(rowYm);
      const prevPending = prevYm && pendingByYm.has(prevYm) ? pendingByYm.get(prevYm) : null;
      const rowNewCaseTotal = pivotRowTotal(pivotRow?.counts, groupLabels);
      const isNewCasePeak = newCasePeakYms.has(rowYm);
      const isPendingPeak = settleRow.hasRecord && settlePeakPendingYms.has(rowYm);
      const isCurrentMonth = rowYm === getCurrentRocMonth5();

      return (
        <div
          key={rowYm}
          className={`group ${RAW_TABLE_PAIR} border-b border-ink-100${
            isCurrentMonth ? ' bg-panel/40' : ''
          }`}
        >
          <div className={RAW_TABLE_LEFT} style={{ gridTemplateColumns: newCaseGridColumns }}>
            <div className={`${RAW_CELL} ${YM_INDENT}`}>
              <span className={YM_TEXT}>{formatYmLabel(rowYm)}</span>
            </div>
            {groupLabels.map((label) => (
              <div key={`${rowYm}-${label}`} className={`${RAW_CELL} justify-end`}>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    !showNewCaseTotalColumn && isNewCasePeak
                      ? 'font-bold text-accent'
                      : 'text-ink-900'
                  }`}
                >
                  {displayStatCell(pivotRow?.counts?.[label])}
                </span>
              </div>
            ))}
            {showNewCaseTotalColumn ? (
              <div className={`${RAW_CELL} justify-end`}>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    isNewCasePeak ? 'font-bold text-accent' : 'text-ink-900'
                  }`}
                >
                  {displayStatCell(rowNewCaseTotal)}
                </span>
              </div>
            ) : null}
          </div>

          <div
            className={`${RAW_TABLE_RIGHT} mt-1 border-t border-ink-100/60 pt-1 lg:mt-0 lg:border-t-0 lg:pt-0`}
            style={{ gridTemplateColumns: SETTLE_GRID_COLUMNS }}
          >
            <SettleRowFields
              ym={rowYm}
              settleRow={settleRow}
              prevPending={prevPending}
              isPendingPeak={isPendingPeak}
              onCommit={commitSettleRow}
              onClear={clearSettleRow}
              actionClass={settleRowActionClass}
            />
          </div>
        </div>
      );
    };

    const saveStatusLabel =
      saveState === 'saving'
        ? '儲存中…'
        : saveState === 'error'
          ? '儲存失敗'
          : saveState === 'local'
            ? '離線未儲存'
            : null;

    return (
      <div className="flex h-full min-h-0 flex-col bg-surface text-ink-900 font-sans">
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 pb-16">
            {notice ? (
              <div
                className="rounded-sm border border-accent/30 bg-panel px-3 py-2 text-[11px] text-ink-900"
                role="alert"
                aria-live="polite"
              >
                {notice}
              </div>
            ) : null}

            <section className="flex flex-col gap-3" aria-label="統計圖表">
              <StatsDashboard
                settlementRows={settlementRows}
                newCaseStats={newCaseStats}
                groupLabels={groupLabels}
              />
            </section>

            <section className="flex flex-col gap-2" aria-label="原始數據">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                {saveStatusLabel ? (
                  <span
                    className={`text-[10px] font-mono uppercase tracking-widest ${
                      saveState === 'local' || saveState === 'error' ? 'text-accent' : 'text-ink-400'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {saveStatusLabel}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <button
                    type="button"
                    className={`${TOKENS.btnGhost} inline-flex items-center gap-1.5`}
                    onClick={toggleAllYearSections}
                    disabled={!alignedMonthGroups.length}
                  >
                    <i
                      className={`ph ph-caret-${allYearsCollapsed ? 'down' : 'right'} text-[13px]`}
                      aria-hidden
                    />
                    {allYearsCollapsed ? '展開全部' : '收合全部'}
                  </button>
                  <button
                    type="button"
                    className={`${TOKENS.btnGhost} inline-flex items-center gap-1.5`}
                    onClick={collapsePriorYears}
                    disabled={!alignedMonthGroups.length}
                  >
                    <i className="ph ph-caret-right text-[13px]" aria-hidden />
                    收合以前年度
                  </button>
                </div>
              </div>

              {alignedMonths.length === 0 ? (
                <div className="py-10 text-center text-[11px] font-mono uppercase tracking-widest text-ink-400">
                  尚無資料
                </div>
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <div className="min-w-[720px]">
                    <div className={`${RAW_TABLE_PAIR} border-b border-ink-100`}>
                      <div
                        className={RAW_TABLE_LEFT}
                        style={{ gridTemplateColumns: newCaseGridColumns }}
                      >
                        <div className={`${RAW_HEAD} text-left ${YM_INDENT}`}>年月</div>
                        {groupLabels.map((label) => (
                          <div key={label} className={`${RAW_HEAD} text-right`}>
                            {label}
                          </div>
                        ))}
                        {showNewCaseTotalColumn ? (
                          <div className={`${RAW_HEAD} text-right`}>合計</div>
                        ) : null}
                      </div>
                      <div
                        className={`${RAW_TABLE_RIGHT} mt-2 border-t border-ink-100 pt-2 lg:mt-0 lg:border-t-0 lg:pt-0`}
                        style={{
                          gridTemplateColumns: SETTLE_GRID_COLUMNS,
                        }}
                      >
                        <div className={`${RAW_HEAD} text-left ${YM_INDENT}`}>年月</div>
                        <div className={`${RAW_HEAD} text-right`}>舊受</div>
                        <div className={`${RAW_HEAD} text-right`}>新收</div>
                        <div className={`${RAW_HEAD} text-right`}>已結</div>
                        <div className={`${RAW_HEAD} text-right`}>未結</div>
                        <div className={`${RAW_HEAD} text-right`}>增減</div>
                        <div className={`${RAW_HEAD} text-right`}>
                          <span className="sr-only">操作</span>
                        </div>
                      </div>
                    </div>

                    {alignedMonthGroups.map(([year, months]) => {
                      const yearCollapsed = effectiveCollapsedYears.has(year);
                      return (
                        <div key={year}>
                          <button
                            type="button"
                            aria-expanded={!yearCollapsed}
                            onClick={() => toggleYearSection(year)}
                            className="flex w-full items-center gap-2 border-b border-ink-100 bg-panel/80 px-1 py-2 text-left hover:bg-panel transition-colors"
                          >
                            <i
                              className={`ph ph-caret-${yearCollapsed ? 'right' : 'down'} text-[13px] text-ink-600`}
                              aria-hidden
                            />
                            <span className="text-[11px] font-bold tracking-[0.12em] text-ink-900">
                              民國 {year} 年
                            </span>
                          </button>
                          {!yearCollapsed ? months.map((ym) => renderAlignedMonthRow(ym)) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  let _jcmsCaseStatsRoot = null;
  window.__jcmsUnmountCaseStats = function __jcmsUnmountCaseStats() {
    if (_jcmsCaseStatsRoot) {
      try {
        _jcmsCaseStatsRoot.unmount();
      } catch (e) {
        /* noop */
      }
      _jcmsCaseStatsRoot = null;
    }
  };

  window.__jcmsMountCaseStats = function __jcmsMountCaseStats() {
    const el = document.getElementById('case-stats-root');
    if (!el) return;
    window.__jcmsUnmountCaseStats();
    _jcmsCaseStatsRoot = ReactDOM.createRoot(el);
    _jcmsCaseStatsRoot.render(<CaseStatsApp />);
  };
})();
