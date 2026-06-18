/** Vue 根應用：setup 與 mount */
import {
  createApp,
  ref,
  computed,
  reactive,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
} from '../vue-api.js';
import { util } from '../utils.js';
import { apiService } from '../api/client.js';
import { RocDateInput, RocMonthInput, RocTimeInput } from '../components/roc-inputs.js';
import { useClock } from '../composables/use-clock.js';
import { useSettings } from '../composables/use-settings.js';
import { usePersonalAdmin } from '../composables/use-personal-admin.js';
import { useCasesManager } from '../composables/use-cases-manager.js';
import { useDynamics } from '../composables/use-dynamics.js';
import { usePayscaleChart } from '../composables/use-payscale-chart.js';
import { useDashboardCharts } from '../composables/use-dashboard-charts.js';
import {
    useMobileLayout,
    resolveViewForMobileLayout,
    MOBILE_REDIRECT_VIEWS,
} from '../composables/use-mobile-layout.js';
import { useDashboardMapView } from '../composables/use-dashboard-map-view.js';
import { useWorkMapEditor } from '../composables/use-work-map-editor.js';
import {
    loadWorkMapDoc,
    saveWorkMapDoc,
    createWorkMapId,
    createEmptyWorkMapDoc,
    createDefaultFeature,
    WORK_MAP_FEATURE_TYPES,
    WORK_MAP_TOOL_MODES,
    WORK_MAP_COLOR_PRESETS,
    WORK_MAP_DEFAULT_COLOR,
    normalizeColor,
    featureTypeLabel,
} from '../lib/work-map-model.js';
import { createWorkMapHistory, cloneWorkMapDoc } from '../lib/work-map-history.js';
import {
    AGENCY_LAYER_KINDS,
    loadAgencyLayerDoc,
    saveAgencyLayerDoc,
    createEmptyAgencyLayerDoc,
    ensureAgencyLayerInitialized,
    createDefaultJudicialFeature,
    createDefaultPoliceFeature,
} from '../lib/agency-layer-model.js';
import {
    measureDraft,
    ringAreaSqMeters,
    lineLengthMeters,
    formatAreaLabel,
    formatLengthLabel,
    coordsNearlyEqual,
} from '../lib/work-map-geo.js';
import {
    hitTestVertex,
    applyCoordToFeature,
    moveFeatureByDelta,
} from '../lib/work-map-interaction.js';
import { ensureTaiwanHolidaysForYears } from '../composables/use-taiwan-holidays.js';
import {
  ensureSalaryYear,
  salaryYearFootAggregate,
  mergeSalaryAddCols,
  mergeSalarySubCols,
  getSalaryAddColsEffective,
  getSalarySubColsEffective,
  getSalaryRowsEffective,
  getSalaryRowIdsEffective,
  copySalaryYearSchema,
  readSalaryYearEntry,
  normalizeSalaryYearEntry,
  emptySalaryYearRow,
  SALARY_YEAR_ROWS,
  SALARY_ADD_COLS,
  SALARY_SUB_COLS,
  salaryRowAddSum,
  salaryRowSubSum,
  PAYSCALE_BUILTIN_EFFECTIVE_ROC7,
  PAYSCALE_BUILTIN_ROWS,
  PAYSCALE_NEW_FORM_GRADE_POINTS,
  payscaleRowTotal,
  payscaleEffectiveRoc7ToNum,
  formatCareerSpanPeriod,
  buildCareerTimelineLayout,
  buildCareerTimelineTicks,
  sanitizeCareerTimelineLinks,
  syncCalendarWeek,
  syncCalendarScroll,
  buildThisWeekSchedule,
  buildContinuousCalendarSchedule,
  formatCalendarViewMonthLabel,
  findWeekIndexForRocDate,
  findTodayWeekIndex,
  MONTH_DOW_LABELS,
  careerRowInterval,
  careerRowAttachments,
  careerAttachmentLabelFromUrl,
  careerIsoAtNoonMs,
  migrateCareerTimelineRecord,
  careerRowHasAttachment,
} from '../composables/personal-admin-shared.js';

export function mountJcmsApp() {
  createApp({
      components: {
          RocDateInput,
          RocMonthInput,
          RocTimeInput,
      },
      setup() {
          // 1. 全域 UI 狀態
          const isLoading = ref(false);
          /** 與頂層導覽／子工具一致，供 ?view= 還原與書籤 */
          const JCMS_VALID_VIEWS = new Set([
              'dashboard',
              'dashboardDetail',
              'workMapEdit',
              'cases',
              'caseStats',
              'civilTools',
              'inspectionLayout',
              'videoInspection',
              'hoffmannTool',
              'inheritanceChart',
              'admin',
              'dynamics',
          ]);
          const { isMobileLayout } = useMobileLayout();

          const readInitialViewFromUrl = () => {
              try {
                  const v = new URLSearchParams(window.location.search).get('view');
                  if (v && JCMS_VALID_VIEWS.has(v)) return v;
              } catch (e) { /* ignore */ }
              return 'dashboard';
          };
          const syncViewToUrl = (view) => {
              try {
                  const u = new URL(window.location.href);
                  u.searchParams.set('view', view);
                  const next = u.pathname + u.search + u.hash;
                  if (next !== window.location.pathname + window.location.search + window.location.hash) {
                      window.history.replaceState(null, '', next);
                  }
              } catch (e) { /* ignore */ }
          };
          const currentView = ref(
              resolveViewForMobileLayout(readInitialViewFromUrl(), isMobileLayout.value)
          );
          if (isMobileLayout.value) {
              const resolved = resolveViewForMobileLayout(currentView.value, true);
              if (resolved !== currentView.value) currentView.value = resolved;
          }
          const isDbConnected = ref(false); // 準備對接後端健康檢查 API
          const dbStatusClass = computed(() => isDbConnected.value ? 'text-ink-400' : 'text-warning');

          const mountCaseStatsApp = () => {
              if (typeof window.__jcmsMountCaseStats !== 'function') return;
              window.__jcmsMountCaseStats({ readOnly: isMobileLayout.value });
          };
  
          const switchView = (view) => {
              if (!JCMS_VALID_VIEWS.has(view)) return;
              view = resolveViewForMobileLayout(view, isMobileLayout.value);
              if (currentView.value !== view) {
                  isLoading.value = true;
                  setTimeout(() => { currentView.value = view; isLoading.value = false; }, 150); 
              }
          };

          watch(isMobileLayout, (mobile) => {
              if (mobile && MOBILE_REDIRECT_VIEWS.has(currentView.value)) {
                  switchView('dashboardDetail');
              }
              if (currentView.value === 'caseStats') {
                  nextTick(() => {
                      if (typeof window.__jcmsUnmountCaseStats === 'function') {
                          window.__jcmsUnmountCaseStats();
                      }
                      mountCaseStatsApp();
                  });
              }
          });
          window.__jcmsSwitchView = (view) => switchView(view);
  
          watch(currentView, (v, prev) => {
              if (prev === 'civilTools' && typeof window.__jcmsUnmountCivilTools === 'function') {
                  window.__jcmsUnmountCivilTools();
              }
              if (prev === 'inspectionLayout' && typeof window.__jcmsUnmountInspectionLayout === 'function') {
                  window.__jcmsUnmountInspectionLayout();
              }
              if (prev === 'videoInspection' && typeof window.__jcmsUnmountVideoInspection === 'function') {
                  window.__jcmsUnmountVideoInspection();
              }
              if (prev === 'hoffmannTool' && typeof window.__jcmsUnmountHoffmannTool === 'function') {
                  window.__jcmsUnmountHoffmannTool();
              }
              if (prev === 'inheritanceChart' && typeof window.__jcmsUnmountInheritanceChart === 'function') {
                  window.__jcmsUnmountInheritanceChart();
              }
              if (prev === 'caseStats' && typeof window.__jcmsUnmountCaseStats === 'function') {
                  window.__jcmsUnmountCaseStats();
              }
              if (v === 'civilTools') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountCivilTools === 'function') {
                              window.__jcmsMountCivilTools();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              if (v === 'inspectionLayout') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountInspectionLayout === 'function') {
                              window.__jcmsMountInspectionLayout();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              if (v === 'videoInspection') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountVideoInspection === 'function') {
                              window.__jcmsMountVideoInspection();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              if (v === 'hoffmannTool') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountHoffmannTool === 'function') {
                              window.__jcmsMountHoffmannTool();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              if (v === 'inheritanceChart') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountInheritanceChart === 'function') {
                              window.__jcmsMountInheritanceChart();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              if (v === 'caseStats') {
                  nextTick(() => {
                      const tryMount = (n = 0) => {
                          if (typeof window.__jcmsMountCaseStats === 'function') {
                              mountCaseStatsApp();
                              return;
                          }
                          if (n < 40) setTimeout(() => tryMount(n + 1), 50);
                      };
                      tryMount();
                  });
              }
              syncViewToUrl(v);
          }, { immediate: true });
  
          const adminActiveTab = ref('attendance');
          const adminTabs = [
              { key: 'attendance', label: '差勤' },
              { key: 'salary', label: '薪資' },
              { key: 'payscale', label: '俸表' },
              { key: 'training', label: '研習' },
              { key: 'career', label: '職務年表' },
              { key: 'planner', label: '行事／待辦' },
          ];
          const gotoOvertimeAdmin = () => {
              adminActiveTab.value = 'attendance';
              switchView('admin');
          };
          const navClass = (view) => {
              const active =
                  view === 'dashboard'
                      ? currentView.value === 'dashboard' || currentView.value === 'dashboardDetail'
                      : currentView.value === view;
              return `relative flex items-center justify-center w-9 h-9 rounded transition-colors duration-200 ${active ? 'text-accent bg-white/10' : 'text-ink-400 hover:text-white hover:bg-white/10'}`;
          };
          const dbBackupBusy = ref(false);
          const exportAppDbBackup = async () => {
              if (dbBackupBusy.value) return;
              dbBackupBusy.value = true;
              try {
                  if (!(await apiService.checkHealth())) {
                      throw new Error('目前無法連線後端 API。請確認 JCMS 服務已啟動。');
                  }
                  await apiService.downloadAppDbBackup();
              } catch (e) {
                  alert(String(e.message || e));
              } finally {
                  dbBackupBusy.value = false;
              }
          };
  
          // 2. 組合各模組 (Dependency Injection)
          const { time } = useClock();
          const { currentWorkspace, settings, addWorkspace, removeWorkspace, hydrateSettingsFromDb } =
              useSettings(apiService);
          window.__jcmsGetCurrentWorkspaceId = () => currentWorkspace.value;
          watch(currentWorkspace, (ws) => {
              if (typeof window.__jcmsOnWorkspaceChange === 'function') {
                  window.__jcmsOnWorkspaceChange(ws);
              }
          });
          const { personalAdmin, overtimeMetrics, hydratePersonalAdminFromDb } = usePersonalAdmin(apiService);
  
          const salaryYearCollapsed = reactive({});
          const salaryColPanel = reactive({ yearRoc3: null, mode: null });
          const salaryNewColDraft = reactive({ kind: 'add', label: '' });
          const salaryNewRowDraft = reactive({ label: '' });
          const salaryColNotice = ref('');
          const salaryNewYearDraft = reactive({
              active: false,
              yearRoc3: '',
              workingEntry: null,
          });
          let salaryYearCollapseInited = false;
          const todoDraggingId = ref(null);
          const todoDragOverId = ref(null);

          function salaryCurrentRocYear3() {
              return String(new Date().getFullYear() - 1911).padStart(3, '0');
          }

          function getSalaryYearEntry(rocY) {
              let y = String(rocY || '').replace(/\D/g, '');
              if (!y) y = util.todayRocDate7().slice(0, 3);
              const yk = y.length <= 3 ? y.padStart(3, '0') : y.slice(0, 3);
              ensureSalaryYear(personalAdmin.salaryYearBook, yk);
              return personalAdmin.salaryYearBook[yk];
          }

          function resolveSalaryYearEntry(yearRoc3) {
              if (yearRoc3 === '__new__' && salaryNewYearDraft.active && salaryNewYearDraft.workingEntry) {
                  return salaryNewYearDraft.workingEntry;
              }
              return getSalaryYearEntry(yearRoc3);
          }

          function getSalaryYearRow(rocY, rowId) {
              const entry = resolveSalaryYearEntry(rocY);
              if (!entry.rows || typeof entry.rows !== 'object') entry.rows = {};
              if (!entry.rows[rowId]) {
                  entry.rows[rowId] = emptySalaryYearRow(entry);
              }
              return entry.rows[rowId];
          }

          function getSalaryAddColsForYear(rocY) {
              return getSalaryAddColsEffective(resolveSalaryYearEntry(rocY));
          }

          function getSalarySubColsForYear(rocY) {
              return getSalarySubColsEffective(resolveSalaryYearEntry(rocY));
          }

          function getSalaryRowsForYear(rocY) {
              return getSalaryRowsEffective(resolveSalaryYearEntry(rocY));
          }

          function buildSalaryYearGroup(yearRoc3, entry, opts = {}) {
              const snap = readSalaryYearEntry(entry);
              const addCols = getSalaryAddColsEffective(snap);
              const subCols = getSalarySubColsEffective(snap);
              const rowDefs = getSalaryRowsEffective(snap);
              const foot = salaryYearFootAggregate({ [yearRoc3]: snap }, yearRoc3);
              const yk = String(yearRoc3 || '').padStart(3, '0');
              return {
                  yearRoc3,
                  yearBandLabel: opts.isDraft
                      ? `民國 ${yk} 年（新增）`
                      : `民國 ${yk} 年`,
                  yearNetText: util.formatMoney(foot.net),
                  foot,
                  addCols,
                  subCols,
                  rowDefs,
                  customAdd: snap.customCols.add,
                  customSub: snap.customCols.sub,
                  colspan: 1 + addCols.length + 1 + subCols.length + 1,
                  isDraft: !!opts.isDraft,
                  isCurrent: !opts.isDraft && yk === salaryCurrentRocYear3(),
              };
          }

          function getLatestSalaryYearEntryForSchema() {
              const book = personalAdmin.salaryYearBook || {};
              const current = salaryCurrentRocYear3();
              const keys = Object.keys(book)
                  .filter((yk) => yk <= current)
                  .sort((a, b) => a.localeCompare(b));
              if (keys.length) return book[keys[keys.length - 1]];
              return normalizeSalaryYearEntry(null);
          }

          function suggestNextSalaryYearRoc3() {
              const current = salaryCurrentRocYear3();
              const book = personalAdmin.salaryYearBook || {};
              const existing = Object.keys(book)
                  .filter((yk) => yk <= current)
                  .sort((a, b) => a.localeCompare(b));
              if (!existing.length) return current;
              const last = existing[existing.length - 1];
              const lastNum = parseInt(last, 10);
              const currentNum = parseInt(current, 10);
              if (Number.isFinite(lastNum) && Number.isFinite(currentNum) && lastNum < currentNum) {
                  return String(lastNum + 1).padStart(3, '0');
              }
              return current;
          }

          function salaryRowAddSumForYear(row, rocY) {
              return getSalaryAddColsForYear(rocY).reduce((s, c) => s + util.parseMoney(row[c.key]), 0);
          }

          function salaryRowSubSumForYear(row, rocY) {
              return getSalarySubColsForYear(rocY).reduce((s, c) => s + util.parseMoney(row[c.key]), 0);
          }

          function salaryTableColspanForYear(rocY) {
              const addN = getSalaryAddColsForYear(rocY).length;
              const subN = getSalarySubColsForYear(rocY).length;
              return 1 + addN + 1 + subN + 1;
          }

          function isSalaryYearCollapsed(yearRoc3) {
              return salaryYearCollapsed[yearRoc3] === true;
          }

          function toggleSalaryYearSection(yearRoc3) {
              if (isSalaryYearCollapsed(yearRoc3)) {
                  salaryYearCollapsed[yearRoc3] = false;
                  return;
              }
              salaryYearCollapsed[yearRoc3] = true;
              if (salaryColPanel.yearRoc3 === yearRoc3) closeSalaryColPanel();
          }

          function isSalaryColPanelOpen(yearRoc3, mode) {
              return salaryColPanel.yearRoc3 === yearRoc3 && salaryColPanel.mode === mode;
          }

          function closeSalaryColPanel() {
              salaryColPanel.yearRoc3 = null;
              salaryColPanel.mode = null;
              salaryColNotice.value = '';
              salaryNewRowDraft.label = '';
          }

          function toggleSalaryColPanel(yearRoc3, mode) {
              if (isSalaryColPanelOpen(yearRoc3, mode)) {
                  closeSalaryColPanel();
                  return;
              }
              salaryColPanel.yearRoc3 = yearRoc3;
              salaryColPanel.mode = mode;
              salaryColNotice.value = '';
              salaryNewColDraft.kind = 'add';
              salaryNewColDraft.label = '';
              salaryNewRowDraft.label = '';
          }

          function clearSalaryColValues(entry, colKey) {
              getSalaryRowIdsEffective(entry).forEach((rid) => {
                  const row = entry.rows[rid];
                  if (row && row[colKey] != null) row[colKey] = '';
              });
          }

          function submitSalaryNewCol(yearRoc3) {
              const label = String(salaryNewColDraft.label || '').trim();
              if (!label) {
                  salaryColNotice.value = '請輸入欄位名稱';
                  return;
              }
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const kind = salaryNewColDraft.kind === 'sub' ? 'sub' : 'add';
              const prefix = kind === 'add' ? 'addCustom_' : 'subCustom_';
              const id = prefix + Date.now().toString(36);
              entry.customCols[kind].push({ id, label });
              getSalaryRowIdsEffective(entry).forEach((rid) => {
                  if (!entry.rows[rid]) entry.rows[rid] = emptySalaryYearRow(entry);
                  if (entry.rows[rid][id] == null) entry.rows[rid][id] = '';
              });
              if (yearRoc3 !== '__new__') ensureSalaryYear(personalAdmin.salaryYearBook, yearRoc3);
              salaryNewColDraft.label = '';
              salaryColNotice.value = '';
          }

          function submitSalaryNewRow(yearRoc3) {
              const label = String(salaryNewRowDraft.label || '').trim();
              if (!label) {
                  salaryColNotice.value = '請輸入列名稱';
                  return;
              }
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const id = 'rowCustom_' + Date.now().toString(36);
              entry.customRows.push({ id, label });
              entry.rows[id] = emptySalaryYearRow(entry);
              if (yearRoc3 !== '__new__') ensureSalaryYear(personalAdmin.salaryYearBook, yearRoc3);
              salaryNewRowDraft.label = '';
              salaryColNotice.value = '';
          }

          function getSalaryBuiltinColDefault(key) {
              const c = SALARY_ADD_COLS.find((x) => x.key === key) || SALARY_SUB_COLS.find((x) => x.key === key);
              return c ? c.label : key;
          }

          function setSalaryColLabel(yearRoc3, kind, col, label) {
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const bucket = kind === 'sub' ? 'sub' : 'add';
              const trimmed = String(label ?? '').trim();
              if (col.custom) {
                  const target = (entry.customCols[bucket] || []).find((c) => c.id === col.key);
                  if (target) target.label = trimmed;
                  return;
              }
              if (!entry.colLabels) entry.colLabels = {};
              const def = getSalaryBuiltinColDefault(col.key);
              if (!trimmed || trimmed === def) delete entry.colLabels[col.key];
              else entry.colLabels[col.key] = trimmed;
          }

          function onSalaryColLabelBlur(yearRoc3, kind, col, ev) {
              const raw = String(ev?.target?.value ?? '').trim();
              if (!raw && col.custom) {
                  salaryColNotice.value = '欄位名稱不可空白';
                  if (ev?.target) ev.target.value = col.label;
                  return;
              }
              const next = raw || getSalaryBuiltinColDefault(col.key);
              setSalaryColLabel(yearRoc3, kind, col, next);
              if (ev?.target) ev.target.value = next;
              salaryColNotice.value = '';
          }

          function getSalaryBuiltinRowDefault(rowId) {
              const r = SALARY_YEAR_ROWS.find((x) => x.id === rowId);
              return r ? r.label : rowId;
          }

          function setSalaryRowLabel(yearRoc3, rowId, label, isCustom) {
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const trimmed = String(label ?? '').trim();
              if (isCustom) {
                  const row = (entry.customRows || []).find((r) => r.id === rowId);
                  if (row) row.label = trimmed;
                  return;
              }
              if (!entry.rowLabels) entry.rowLabels = {};
              const def = getSalaryBuiltinRowDefault(rowId);
              if (!trimmed || trimmed === def) delete entry.rowLabels[rowId];
              else entry.rowLabels[rowId] = trimmed;
          }

          function onSalaryRowLabelBlur(yearRoc3, row, ev) {
              const raw = String(ev?.target?.value ?? '').trim();
              if (!raw && row.custom) {
                  salaryColNotice.value = '列名稱不可空白';
                  if (ev?.target) ev.target.value = row.label;
                  return;
              }
              const next = raw || getSalaryBuiltinRowDefault(row.id);
              setSalaryRowLabel(yearRoc3, row.id, next, row.custom);
              if (ev?.target) ev.target.value = next;
              salaryColNotice.value = '';
          }

          function deleteSalaryCol(yearRoc3, kind, colKey, isCustom) {
              if (!colKey) return;
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const cols = kind === 'sub' ? getSalarySubColsEffective(entry) : getSalaryAddColsEffective(entry);
              const target = cols.find((c) => c.key === colKey);
              if (!target) return;
              if (!window.confirm(`確定刪除欄位「${target.label}」？`)) return;
              if (isCustom) {
                  entry.customCols[kind === 'sub' ? 'sub' : 'add'] = (entry.customCols[kind === 'sub' ? 'sub' : 'add'] || []).filter(
                      (c) => c.id !== colKey
                  );
              } else {
                  entry.hiddenCols = entry.hiddenCols || { add: [], sub: [] };
                  const bucket = kind === 'sub' ? 'sub' : 'add';
                  if (!entry.hiddenCols[bucket].includes(colKey)) entry.hiddenCols[bucket].push(colKey);
              }
              clearSalaryColValues(entry, colKey);
              if (yearRoc3 !== '__new__') ensureSalaryYear(personalAdmin.salaryYearBook, yearRoc3);
          }

          function deleteSalaryRow(yearRoc3, rowId, isCustom) {
              if (!rowId) return;
              const entry = resolveSalaryYearEntry(yearRoc3);
              normalizeSalaryYearEntry(entry);
              const rowDef = getSalaryRowsEffective(entry).find((r) => r.id === rowId);
              if (!rowDef) return;
              if (!window.confirm(`確定刪除列「${rowDef.label}」？`)) return;
              if (isCustom) {
                  entry.customRows = (entry.customRows || []).filter((r) => r.id !== rowId);
              } else {
                  entry.hiddenRows = entry.hiddenRows || [];
                  if (!entry.hiddenRows.includes(rowId)) entry.hiddenRows.push(rowId);
              }
              if (entry.rows[rowId]) delete entry.rows[rowId];
              if (yearRoc3 !== '__new__') ensureSalaryYear(personalAdmin.salaryYearBook, yearRoc3);
          }

          function closeSalaryNewYear() {
              salaryNewYearDraft.active = false;
              salaryNewYearDraft.yearRoc3 = '';
              salaryNewYearDraft.workingEntry = null;
              salaryColNotice.value = '';
              closeSalaryColPanel();
          }

          function toggleSalaryNewYear() {
              if (salaryNewYearDraft.active) {
                  closeSalaryNewYear();
                  return;
              }
              salaryColNotice.value = '';
              closeSalaryColPanel();
              const schema = copySalaryYearSchema(getLatestSalaryYearEntryForSchema());
              const workingEntry = reactive(
                  normalizeSalaryYearEntry({
                      ...schema,
                      rows: {},
                      note: '',
                  })
              );
              getSalaryRowIdsEffective(workingEntry).forEach((rid) => {
                  workingEntry.rows[rid] = emptySalaryYearRow(workingEntry);
              });
              salaryNewYearDraft.yearRoc3 = suggestNextSalaryYearRoc3();
              salaryNewYearDraft.workingEntry = workingEntry;
              salaryNewYearDraft.active = true;
          }

          function submitSalaryNewYear() {
              const yk = String(salaryNewYearDraft.yearRoc3 || '')
                  .replace(/\D/g, '')
                  .padStart(3, '0')
                  .slice(0, 3);
              if (yk.length !== 3) {
                  salaryColNotice.value = '請輸入 3 碼民國年度';
                  return;
              }
              const current = salaryCurrentRocYear3();
              if (yk > current) {
                  salaryColNotice.value = '不可新增未來年度';
                  return;
              }
              if (personalAdmin.salaryYearBook[yk]) {
                  salaryColNotice.value = '此年度薪資表已存在';
                  return;
              }
              const src = salaryNewYearDraft.workingEntry;
              if (!src) return;
              personalAdmin.salaryYearBook[yk] = normalizeSalaryYearEntry({
                  customCols: {
                      add: (src.customCols?.add || []).map((c) => ({ ...c })),
                      sub: (src.customCols?.sub || []).map((c) => ({ ...c })),
                  },
                  colLabels: { ...(src.colLabels || {}) },
                  rowLabels: { ...(src.rowLabels || {}) },
                  hiddenCols: {
                      add: [...(src.hiddenCols?.add || [])],
                      sub: [...(src.hiddenCols?.sub || [])],
                  },
                  customRows: (src.customRows || []).map((r) => ({ ...r })),
                  hiddenRows: [...(src.hiddenRows || [])],
                  note: String(src.note || ''),
                  rows: JSON.parse(JSON.stringify(src.rows || {})),
              });
              ensureSalaryYear(personalAdmin.salaryYearBook, yk);
              salaryYearCollapsed[yk] = false;
              salaryColNotice.value = '';
              closeSalaryNewYear();
          }

          const salaryNewYearGroup = computed(() => {
              if (!salaryNewYearDraft.active || !salaryNewYearDraft.workingEntry) return null;
              return buildSalaryYearGroup('__new__', salaryNewYearDraft.workingEntry, { isDraft: true });
          });

          const salaryNewYearToggleLabel = computed(() =>
              salaryNewYearDraft.active ? '收合新增' : '新增年度'
          );

          const salaryTimelineYearGroups = computed(() => {
              const book = personalAdmin.salaryYearBook || {};
              const current = salaryCurrentRocYear3();
              return Object.keys(book)
                  .filter((yk) => yk <= current)
                  .sort((a, b) => a.localeCompare(b))
                  .map((yearRoc3) => buildSalaryYearGroup(yearRoc3, book[yearRoc3]));
          });

          const salaryAllYearsCollapsed = computed(() => {
              const groups = salaryTimelineYearGroups.value || [];
              return groups.length > 0 && groups.every((g) => isSalaryYearCollapsed(g.yearRoc3));
          });

          function toggleAllSalaryYearSections() {
              const groups = salaryTimelineYearGroups.value || [];
              if (!groups.length) return;
              if (salaryAllYearsCollapsed.value) {
                  groups.forEach((g) => {
                      salaryYearCollapsed[g.yearRoc3] = false;
                  });
                  return;
              }
              closeSalaryColPanel();
              groups.forEach((g) => {
                  salaryYearCollapsed[g.yearRoc3] = true;
              });
          }

          function collapsePriorSalaryYears() {
              const groups = salaryTimelineYearGroups.value || [];
              if (!groups.length) return;
              const newest = groups[groups.length - 1].yearRoc3;
              groups.forEach((g) => {
                  salaryYearCollapsed[g.yearRoc3] = g.yearRoc3 !== newest;
              });
              if (salaryColPanel.yearRoc3 && salaryColPanel.yearRoc3 !== newest) closeSalaryColPanel();
          }

          watch(
              () => adminActiveTab.value,
              (t) => {
                  if (t !== 'salary' || salaryYearCollapseInited) return;
                  collapsePriorSalaryYears();
                  salaryYearCollapseInited = true;
              },
              { flush: 'post' }
          );
          const { allCases, casesManager, isLoadingCases } = useCasesManager(apiService, currentWorkspace, settings);
          window.__jcmsGetCaseStatsSource = () => ({
              workspaceId: String(currentWorkspace.value || 'WS_001'),
              cases: allCases.value || [],
              caseWordGroups: Array.isArray(settings?.data?.caseWordGroups)
                  ? settings.data.caseWordGroups
                  : [],
          });

          const {
              dynamicsPersons,
              dynamicsPersonRosterByClass,
              dynamicsImportBusy,
              dynamicsPersonDetail,
              dynamicsPersonLatestPostingUnit,
              dynamicsPersonDrawerOpen,
              dynamicsPersonPopoverStyle,
              dynamicsPersonSaveBusy,
              dynamicsNewPersonOpen,
              dynamicsNewPersonDraft,
              dynamicsPersonEdit,
              dynamicsDirectEvent,
              dynamicsPersonNotesFileInput,
              dynamicsPersonNotesUploading,
              dynamicsDirectEventFileInput,
              dynamicsDirectEventUploading,
              dynamicsTimelineAttachmentFileInput,
              dynamicsTimelineEventAttachBusy,
              dynamicsTimelineEventSaving,
              dynamicsRoleLabel,
              dynamicsKindLabel,
              dynamicsTimelineEventBody,
              dynamicsTimelineEventAttachments,
              dynamicsSearchQuery,
              dynamicsSearchResults,
              dynamicsSearchBusy,
              dynamicsSearchMessage,
              dynamicsFtsRebuildBusy,
              dynamicsDedupeBusy,
              dynamicsJudgeRosterMeta,
              dynamicsJudgeRosterUploadBusy,
              dynamicsJudgeRosterMessage,
              dynamicsJudgeRosterFileInput,
              dynamicsIntelDrawerOpen,
              dynamicsIntelPipeRaw,
              dynamicsIntelLegacyOpen,
              dynamicsIntelGeminiPasteOpen,
              dynamicsIntelPasteBundle,
              dynamicsIntelDraft,
              dynamicsIntelNewPersonRole,
              openDynamicsIntelDrawer,
              closeDynamicsIntelDrawer,
              toggleDynamicsIntelLegacy,
              toggleDynamicsIntelGeminiPaste,
              parseDynamicsIntelBundle,
              submitDynamicsIntelDrawerDirect,
              refreshDynamicsLists,
              onDynamicsJudgeRosterFileChange,
              openDynamicsPerson,
              onDynamicsSearchHit,
              runDynamicsSearch,
              rebuildDynamicsFtsIndex,
              dedupeDynamicsDuplicateEvents,
              closeDynamicsPersonDetail,
              saveDynamicsPersonProfile,
              triggerDynamicsPersonNotesFilePick,
              onDynamicsPersonNotesFileChange,
              removeDynamicsPersonNotesAttachmentAt,
              createDynamicsNewPerson,
              deleteDynamicsPersonById,
              triggerDynamicsDirectEventFilePick,
              onDynamicsDirectEventFileChange,
              removeDynamicsDirectEventAttachmentAt,
              triggerDynamicsTimelineEventAttachmentFilePick,
              onDynamicsTimelineAttachmentFileChange,
              removeDynamicsTimelineEventAttachment,
              saveDynamicsTimelineEventAttachments,
              submitDynamicsDirectEvent,
              deleteDynamicsTimelineEvent,
          } = useDynamics(apiService, currentView, isDbConnected);
  
          const activeWorkspaceLabel = computed(() => {
              const ws = settings.data.workspaces.find((w) => w.id === currentWorkspace.value);
              if (!ws) return '';
              const c = (ws.court || '').trim();
              const d = (ws.division || '').trim();
              if (!c && !d) return '（尚未命名工作區）';
              return [c, d].filter(Boolean).join(' — ');
          });

          const dashWorkspaceStartDateRoc7 = computed(() => {
              const ws = settings.data.workspaces.find((w) => w.id === currentWorkspace.value);
              const d7 = util.normalizeRocDate7(ws?.startDate || '');
              return d7.length === 7 ? d7 : '';
          });
  
          const prefixInput = ref('');
          function addPrefix() {
              const t = prefixInput.value.trim();
              if (!t) return;
              if (settings.data.prefixes.includes(t)) {
                  prefixInput.value = '';
                  return;
              }
              settings.data.prefixes.push(t);
              prefixInput.value = '';
          }
          function removePrefix(i) {
              if (settings.data.prefixes.length <= 1) {
                  alert('至少保留一個字軌。');
                  return;
              }
              settings.data.prefixes.splice(i, 1);
          }
  
          const dashWsCases = computed(() => {
              const ws = String(currentWorkspace.value || 'WS_001');
              return (allCases.value || []).filter(
                  (c) => String(c.workspaceId || 'WS_001') === ws
              );
          });

          const dashStatsCases = computed(() => {
              const list = dashWsCases.value;
              const floor = dashWorkspaceStartDateRoc7.value;
              if (floor.length !== 7) return list;
              return list.filter((c) => {
                  const d =
                      util.normalizeRocDate7(c.dates || '') ||
                      util.toRocDate7FromAny(c.dates || '') ||
                      '';
                  return d.length === 7 && d >= floor;
              });
          });

          function dashResolveGroupLabel(word) {
              const groupsRaw = Array.isArray(settings?.data?.caseWordGroups)
                  ? settings.data.caseWordGroups
                  : [];
              const groupRules = groupsRaw
                  .map((g) => {
                      const name = util.normalizeCaseWord(g?.name || '');
                      const members = Array.isArray(g?.members)
                          ? g.members.map((m) => util.normalizeCaseWord(m)).filter(Boolean)
                          : util.splitCaseWordMembers(g?.membersText || '');
                      return { name, members };
                  })
                  .filter((g) => g.name);
              const w = util.normalizeCaseWord(word);
              if (!w) return '其他';
              const hit = groupRules.find((g) => g.name === w || g.members.includes(w));
              return hit ? hit.name : w;
          }

          function buildDashTop5Breakdown(list, mode) {
              const unresolved = list.filter((c) => !c.closeDate);
              const total = Math.max(unresolved.length, 1);
              const map = {};
              unresolved.forEach((c) => {
                  const key =
                      mode === 'word'
                          ? dashResolveGroupLabel(c.word)
                          : String(c.reason || '').trim() || '其他';
                  map[key] = (map[key] || 0) + 1;
              });
              const typeLabel = mode === 'word' ? '字別群組' : '案由';
              const topN = mode === 'reason' ? 4 : 5;
              return Object.entries(map)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, topN)
                  .map(([label, count]) => ({
                      label,
                      count,
                      percentage: Math.min(100, Math.round((count / total) * 100)),
                      type: typeLabel,
                  }));
          }

          function padDashBreakdownSlots(data, slotCount = 5) {
              const slots = data.slice(0, slotCount).map((item) => ({ ...item, empty: false }));
              while (slots.length < slotCount) {
                  slots.push({ label: ' ', count: 0, percentage: 0, type: ' ', empty: true });
              }
              return slots;
          }

          function dashBreakdownLabelDisplay(label, mode) {
              const text = String(label || '').trim();
              if (mode !== 'reason') return text;
              const chars = [...text];
              if (chars.length <= 6) return text;
              return `${chars.slice(0, 6).join('')}…`;
          }

          const dashBreakdownMode = ref('word');

          const dashBreakdownSlotCount = computed(() =>
              dashBreakdownMode.value === 'reason' ? 4 : 5
          );

          const dashStats = computed(() => {
              const list = dashStatsCases.value;
              const currentMonth = util.todayRocDate7().slice(0, 5);
              const unresolvedList = list.filter((c) => !c.closeDate);
              const unresolved = unresolvedList.length;
              const closedThisMonthList = list.filter(
                  (c) => String(c.closeDate || '').slice(0, 5) === currentMonth
              );
              const closed = closedThisMonthList.length;
              const newlyReceivedList = list.filter(
                  (c) => String(c.dates || '').slice(0, 5) === currentMonth
              );
              const newlyReceived = newlyReceivedList.length;
              const monthNewlyReceivedTarget = newlyReceivedList.reduce(
                  (sum, c) => sum + util.parseMoney(c.targetAmount),
                  0
              );
              const unresolvedTargetAmount = unresolvedList.reduce(
                  (sum, c) => sum + util.parseMoney(c.targetAmount),
                  0
              );
              const notProceeding = list.filter((c) => casesManager.isCaseNotProceeding(c)).length;
              const proceedingThisMonth = list.filter((c) =>
                  casesManager.caseHasProceedingInMonth(c, currentMonth)
              ).length;
              const monthClosedTarget = closedThisMonthList.reduce(
                  (sum, c) => sum + util.parseMoney(c.targetAmount),
                  0
              );
              const clearanceRate =
                  newlyReceived > 0 ? Math.round((closed / newlyReceived) * 100) : 0;
              const cumulativeReceived = list.length;
              const cumulativeClosed = list.filter((c) =>
                  String(c.closeDate || '').trim()
              ).length;
              const cumulativeTargetAmount = list.reduce(
                  (sum, c) => sum + util.parseMoney(c.targetAmount),
                  0
              );
              const cumulativeReceivedAmount = cumulativeTargetAmount;
              const cumulativeClosedAmount = list
                  .filter((c) => String(c.closeDate || '').trim())
                  .reduce((sum, c) => sum + util.parseMoney(c.targetAmount), 0);
              return {
                  unresolved,
                  newlyReceived,
                  closed,
                  notProceeding,
                  proceedingThisMonth,
                  monthClosedTarget,
                  monthNewlyReceivedTarget,
                  unresolvedTargetAmount,
                  clearanceRate,
                  currentMonth5: currentMonth,
                  cumulativeReceived,
                  cumulativeClosed,
                  cumulativeTargetAmount,
                  cumulativeReceivedAmount,
                  cumulativeClosedAmount,
              };
          });

          const dashBreakdownSlots = computed(() =>
              padDashBreakdownSlots(
                  buildDashTop5Breakdown(dashStatsCases.value, dashBreakdownMode.value),
                  5
              )
          );

          const dashBreakdownHasData = computed(() =>
              dashBreakdownSlots.value.some((s) => !s.empty)
          );

          const dashRootRef = ref(null);
          const dashCalendarScrollRef = ref(null);
          const CALENDAR_SCROLL_MONTH_RADIUS = 24;
          let calendarScrollFromNav = false;
          let calendarScrollRaf = 0;
          let calendarTodayScrollToken = 0;
          let calendarShouldSnapToday = true;
          let calendarSnapPending = true;
          let calendarUserScrolled = false;
          const dashMapRootRef = ref(null);
          const workMapEditRootRef = ref(null);
          const dashViewActive = computed(() => {
              if (currentView.value === 'dashboardDetail') return true;
              return isMobileLayout.value && MOBILE_REDIRECT_VIEWS.has(currentView.value);
          });
          const dashMapViewActive = computed(() => currentView.value === 'dashboard' && !isMobileLayout.value);
          const workMapEditViewActive = computed(() => currentView.value === 'workMapEdit' && !isMobileLayout.value);

          const workMapDoc = reactive(createEmptyWorkMapDoc());
          const workMapHistory = createWorkMapHistory();
          const workMapUi = reactive({
              activeListId: null,
              editTarget: 'custom',
              toolMode: null,
              draftCoords: [],
              draftCursor: null,
              selectedFeatureId: null,
              editingLayerNameId: null,
              editingLayerNameDraft: '',
              notice: '',
          });
          const agencyLayerDoc = reactive(createEmptyAgencyLayerDoc());
          const agencyLayerHistory = createWorkMapHistory();
          const mapCurrentLocation = reactive({
              lng: null,
              lat: null,
              title: '現在位置',
              description: '',
          });
          const agencyFeatureEditor = reactive({
              featureId: null,
              name: '',
              type: '法院',
              jurisdiction: '',
              unit: '',
              address: '',
              phone: '',
              zip: '',
          });
          const workMapFeatureEditor = reactive({
              featureId: null,
              title: '',
              description: '',
              color: WORK_MAP_DEFAULT_COLOR,
          });
          const workMapSession = reactive({
              entryView: null,
              pendingView: null,
          });
          let workMapDragState = null;
          let workMapSuppressClick = false;
          let workMapAutoSaveTimer = null;

          const workMapCanUndo = computed(() => workMapHistory.canUndo());
          const workMapCanRedo = computed(() => workMapHistory.canRedo());
          const workMapColorPresets = WORK_MAP_COLOR_PRESETS;

          const workMapSelectedFeature = computed(() => {
              if (workMapUi.editTarget !== 'custom') return null;
              if (!workMapUi.activeListId || !workMapUi.selectedFeatureId) return null;
              const list = workMapDoc.lists.find((l) => l.id === workMapUi.activeListId);
              return list?.features.find((f) => f.id === workMapUi.selectedFeatureId) ?? null;
          });

          const agencySelectedFeature = computed(() => {
              const kind = workMapUi.editTarget;
              if (kind !== AGENCY_LAYER_KINDS.judicial && kind !== AGENCY_LAYER_KINDS.police) {
                  return null;
              }
              if (!workMapUi.selectedFeatureId) return null;
              const features = agencyLayerDoc[kind]?.features || [];
              return features.find((f) => f.id === workMapUi.selectedFeatureId) ?? null;
          });

          const agencyFeatureList = computed(() => {
              const kind = workMapUi.editTarget;
              if (kind !== AGENCY_LAYER_KINDS.judicial && kind !== AGENCY_LAYER_KINDS.police) {
                  return [];
              }
              return agencyLayerDoc[kind]?.features || [];
          });

          const hasMapCurrentLocation = computed(() =>
              Number.isFinite(mapCurrentLocation.lng) && Number.isFinite(mapCurrentLocation.lat)
          );

          const workMapDraftMeasureLabel = computed(() => {
              const drawMode =
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.line
                      ? WORK_MAP_FEATURE_TYPES.line
                      : workMapUi.toolMode === WORK_MAP_TOOL_MODES.polygon
                          ? WORK_MAP_FEATURE_TYPES.polygon
                          : null;
              if (!drawMode || !workMapUi.draftCoords.length) {
                  return '';
              }
              const coords = workMapUi.draftCursor
                  ? [...workMapUi.draftCoords, workMapUi.draftCursor]
                  : [...workMapUi.draftCoords];
              const measure = measureDraft(coords, drawMode);
              if (measure.kind === 'area') {
                  return measure.label;
              }
              if (
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.line &&
                  coords.length >= 3 &&
                  workMapUi.draftCursor
              ) {
                  const nearStart = coordsNearlyEqual(coords[0], workMapUi.draftCursor, 0.00012);
                  if (nearStart) {
                      return formatAreaLabel(ringAreaSqMeters(coords));
                  }
              }
              return measure.label ? `長度 ${measure.label}` : '';
          });

          const workMapSelectedFeatureMeasure = computed(() => {
              const feat = workMapSelectedFeature.value;
              if (!feat) return '';
              if (feat.type === WORK_MAP_FEATURE_TYPES.polygon) {
                  return formatAreaLabel(ringAreaSqMeters(feat.coordinates));
              }
              if (feat.type === WORK_MAP_FEATURE_TYPES.line) {
                  return formatLengthLabel(lineLengthMeters(feat.coordinates));
              }
              return '';
          });

          function snapshotWorkMapDoc() {
              return cloneWorkMapDoc(workMapDoc);
          }

          function applyWorkMapSnapshot(snapshot) {
              const norm = snapshot?.lists ? snapshot : createEmptyWorkMapDoc();
              workMapDoc.lists.splice(0, workMapDoc.lists.length, ...norm.lists);
              if (workMapUi.activeListId && !workMapDoc.lists.some((l) => l.id === workMapUi.activeListId)) {
                  const firstVisible = workMapDoc.lists.find((l) => l.visible);
                  workMapUi.activeListId = firstVisible?.id ?? null;
              }
              if (
                  workMapUi.selectedFeatureId &&
                  !workMapDoc.lists.some((l) => l.features.some((f) => f.id === workMapUi.selectedFeatureId))
              ) {
                  workMapUi.selectedFeatureId = null;
              }
          }

          function commitWorkMapChange(mutator) {
              workMapHistory.push(snapshotWorkMapDoc());
              mutator();
          }

          function reloadWorkMapDoc() {
              const loaded = loadWorkMapDoc(currentWorkspace.value);
              workMapDoc.lists.splice(0, workMapDoc.lists.length, ...(loaded.lists || []));
              workMapHistory.clear();
              const active = workMapDoc.lists.find((l) => l.visible);
              workMapUi.activeListId = active?.id ?? workMapDoc.lists[0]?.id ?? null;
              if (workMapUi.activeListId) {
                  workMapUi.toolMode = WORK_MAP_TOOL_MODES.select;
              }
          }

          function snapshotAgencyLayerDoc() {
              return JSON.parse(JSON.stringify(agencyLayerDoc));
          }

          function applyAgencyLayerSnapshot(snapshot) {
              const norm = snapshot && typeof snapshot === 'object'
                  ? snapshot
                  : createEmptyAgencyLayerDoc();
              agencyLayerDoc.judicial = norm.judicial ?? null;
              agencyLayerDoc.police = norm.police ?? null;
              if (
                  workMapUi.selectedFeatureId &&
                  !agencyLayerDoc[workMapUi.editTarget]?.features?.some(
                      (f) => f.id === workMapUi.selectedFeatureId
                  )
              ) {
                  workMapUi.selectedFeatureId = null;
                  resetAgencyFeatureEditor();
              }
          }

          function commitAgencyLayerChange(mutator) {
              agencyLayerHistory.push(snapshotAgencyLayerDoc());
              mutator();
          }

          async function reloadAgencyLayerDoc() {
              const loaded = loadAgencyLayerDoc(currentWorkspace.value);
              agencyLayerDoc.judicial = loaded.judicial;
              agencyLayerDoc.police = loaded.police;
              agencyLayerHistory.clear();
          }

          async function ensureAgencyLayerReady(kind) {
              await ensureAgencyLayerInitialized(kind, agencyLayerDoc);
          }

          function resetAgencyFeatureEditor() {
              agencyFeatureEditor.featureId = null;
              agencyFeatureEditor.name = '';
              agencyFeatureEditor.type = '法院';
              agencyFeatureEditor.jurisdiction = '';
              agencyFeatureEditor.unit = '';
              agencyFeatureEditor.address = '';
              agencyFeatureEditor.phone = '';
              agencyFeatureEditor.zip = '';
          }

          function loadAgencyFeatureEditor(featureId) {
              const feat = agencySelectedFeature.value;
              if (!feat || feat.id !== featureId) return;
              agencyFeatureEditor.featureId = feat.id;
              agencyFeatureEditor.name = feat.name || '';
              agencyFeatureEditor.type = feat.type || '法院';
              agencyFeatureEditor.jurisdiction = feat.jurisdiction || '';
              agencyFeatureEditor.unit = feat.unit || '';
              agencyFeatureEditor.address = feat.address || '';
              agencyFeatureEditor.phone = feat.phone || '';
              agencyFeatureEditor.zip = feat.zip || '';
          }

          async function activateWorkMapEditTarget(target) {
              commitWorkMapFeatureDrafts();
              if (target === AGENCY_LAYER_KINDS.judicial || target === AGENCY_LAYER_KINDS.police) {
                  await ensureAgencyLayerReady(target);
              }
              workMapUi.editTarget = target;
              workMapUi.activeListId = null;
              workMapUi.selectedFeatureId = null;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              resetWorkMapFeatureEditor();
              resetAgencyFeatureEditor();
              workMapUi.toolMode = target === 'currentLocation'
                  ? WORK_MAP_TOOL_MODES.point
                  : WORK_MAP_TOOL_MODES.select;
              workMapEditLayout.clearDraftOnMap?.();
              workMapEditLayout.syncOverlayLayers?.();
          }

          function selectWorkMapLayerForEdit(listId) {
              const list = workMapDoc.lists.find((l) => l.id === listId);
              if (!list) return;
              if (workMapUi.activeListId === listId && workMapUi.editTarget === 'custom') return;
              activateWorkMapLayer(listId);
              workMapUi.editTarget = 'custom';
          }

          function setWorkMapNotice(message) {
              workMapUi.notice = String(message || '');
              if (!message) return;
              window.clearTimeout(setWorkMapNotice._timer);
              setWorkMapNotice._timer = window.setTimeout(() => {
                  workMapUi.notice = '';
              }, 2800);
          }

          function workMapFeatureTypeLabel(type) {
              return featureTypeLabel(type);
          }

          function activateWorkMapLayer(listId) {
              if (
                  workMapUi.editingLayerNameId &&
                  workMapUi.editingLayerNameId !== listId
              ) {
                  finishRenameWorkMapLayer(workMapUi.editingLayerNameId);
              }
              workMapUi.activeListId = listId;
              workMapUi.editTarget = 'custom';
              workMapUi.toolMode = WORK_MAP_TOOL_MODES.select;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              workMapUi.selectedFeatureId = null;
              workMapEditLayout.clearDraftOnMap?.();
          }

          function addWorkMapList() {
              let newId = null;
              commitWorkMapChange(() => {
                  newId = createWorkMapId('list');
                  const n = workMapDoc.lists.length + 1;
                  workMapDoc.lists.push({
                      id: newId,
                      name: `圖層 ${n}`,
                      visible: true,
                      features: [],
                  });
              });
              activateWorkMapLayer(newId);
              nextTick(() => startRenameWorkMapLayer(newId));
          }

          function startRenameWorkMapLayer(listId) {
              if (workMapUi.activeListId !== listId) return;
              const list = workMapDoc.lists.find((l) => l.id === listId);
              if (!list) return;
              workMapUi.editingLayerNameId = listId;
              workMapUi.editingLayerNameDraft = list.name;
              nextTick(() => {
                  const root = workMapEditRootRef.value;
                  const input = root?.querySelector('.work-map-layer-row__name-input');
                  if (!input) return;
                  input.focus();
                  input.select();
              });
          }

          function cancelRenameWorkMapLayer() {
              workMapUi.editingLayerNameId = null;
              workMapUi.editingLayerNameDraft = '';
          }

          function renameWorkMapList(listId, name) {
              const list = workMapDoc.lists.find((l) => l.id === listId);
              if (!list) return;
              const next = String(name || '').trim();
              if (!next || next === list.name) return;
              list.name = next;
          }

          function finishRenameWorkMapLayer(listId) {
              if (workMapUi.editingLayerNameId !== listId) return;
              const draft = String(workMapUi.editingLayerNameDraft || '').trim();
              workMapUi.editingLayerNameId = null;
              workMapUi.editingLayerNameDraft = '';
              if (!draft) return;
              const list = workMapDoc.lists.find((l) => l.id === listId);
              if (!list || draft === list.name) return;
              commitWorkMapChange(() => {
                  list.name = draft;
              });
          }

          function onWorkMapLayerNameClick(listId) {
              selectWorkMapLayerForEdit(listId);
              nextTick(() => startRenameWorkMapLayer(listId));
          }

          function toggleWorkMapLayerVisible(listId, visible) {
              const list = workMapDoc.lists.find((l) => l.id === listId);
              if (!list) return;
              list.visible = visible;
              if (visible && !workMapUi.activeListId) {
                  workMapUi.activeListId = listId;
                  workMapUi.toolMode = WORK_MAP_TOOL_MODES.select;
              }
          }

          /** @deprecated 相容舊模板；僅切換可見性 */
          function toggleWorkMapLayerCheck(listId, checked) {
              toggleWorkMapLayerVisible(listId, checked);
              if (checked) selectWorkMapLayerForEdit(listId);
          }

          function removeWorkMapList(listId) {
              const idx = workMapDoc.lists.findIndex((l) => l.id === listId);
              if (idx < 0) return;
              if (!window.confirm('確定刪除此圖層及其所有地點？')) return;
              commitWorkMapChange(() => {
                  workMapDoc.lists.splice(idx, 1);
              });
              if (workMapUi.activeListId === listId) {
                  const next = workMapDoc.lists.find((l) => l.visible) ?? workMapDoc.lists[0];
                  if (next) activateWorkMapLayer(next.id);
                  else {
                      workMapUi.activeListId = null;
                      workMapUi.toolMode = null;
                  }
              }
          }

          function resetWorkMapFeatureEditor() {
              workMapFeatureEditor.featureId = null;
              workMapFeatureEditor.title = '';
              workMapFeatureEditor.description = '';
              workMapFeatureEditor.color = WORK_MAP_DEFAULT_COLOR;
          }

          function findWorkMapFeature(featureId) {
              if (!featureId) return null;
              for (const list of workMapDoc.lists) {
                  const feat = list.features.find((f) => f.id === featureId);
                  if (feat) return { list, feat };
              }
              return null;
          }

          function loadWorkMapFeatureEditor(featureId) {
              const found = findWorkMapFeature(featureId);
              if (!found) {
                  resetWorkMapFeatureEditor();
                  return;
              }
              workMapFeatureEditor.featureId = featureId;
              workMapFeatureEditor.title = found.feat.title;
              workMapFeatureEditor.description = found.feat.description || '';
              workMapFeatureEditor.color = found.feat.color || WORK_MAP_DEFAULT_COLOR;
          }

          function setWorkMapToolMode(mode) {
              if (workMapUi.editTarget === 'currentLocation') {
                  if (mode !== WORK_MAP_TOOL_MODES.point) {
                      setWorkMapNotice('現在位置請使用點選工具');
                      return;
                  }
              } else if (
                  workMapUi.editTarget === AGENCY_LAYER_KINDS.judicial
                  || workMapUi.editTarget === AGENCY_LAYER_KINDS.police
              ) {
                  if (mode !== WORK_MAP_TOOL_MODES.select && mode !== WORK_MAP_TOOL_MODES.point) {
                      setWorkMapNotice('司法／警察圖層僅支援選取與新增點');
                      return;
                  }
              } else if (!workMapUi.activeListId) {
                  setWorkMapNotice('請先選擇圖層');
                  return;
              }
              if (workMapUi.toolMode === mode) return;
              commitWorkMapFeatureDrafts();
              workMapUi.toolMode = mode;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              if (workMapUi.editTarget === 'custom') {
                  workMapUi.selectedFeatureId = null;
                  resetWorkMapFeatureEditor();
              }
              workMapEditLayout.clearDraftOnMap?.();
          }

          function clearWorkMapSelection() {
              workMapUi.selectedFeatureId = null;
              resetWorkMapFeatureEditor();
              resetAgencyFeatureEditor();
              workMapEditLayout.syncSelectionOnMap?.();
              workMapEditLayout.syncOverlayLayers?.();
          }

          function selectAgencyFeature(featureId) {
              workMapUi.selectedFeatureId = featureId;
              workMapUi.toolMode = WORK_MAP_TOOL_MODES.select;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              loadAgencyFeatureEditor(featureId);
              workMapEditLayout.syncOverlayLayers?.();
          }

          function saveAgencySelectedFeatureProperties() {
              const kind = workMapUi.editTarget;
              if (kind !== AGENCY_LAYER_KINDS.judicial && kind !== AGENCY_LAYER_KINDS.police) {
                  return false;
              }
              const featureId = agencyFeatureEditor.featureId || workMapUi.selectedFeatureId;
              if (!featureId) return false;
              const features = agencyLayerDoc[kind]?.features || [];
              const feat = features.find((f) => f.id === featureId);
              if (!feat) return false;

              const name = String(agencyFeatureEditor.name || '').trim();
              if (!name) {
                  setWorkMapNotice('名稱不可空白');
                  return false;
              }

              commitAgencyLayerChange(() => {
                  feat.name = name;
                  if (kind === AGENCY_LAYER_KINDS.judicial) {
                      feat.type = String(agencyFeatureEditor.type || '法院').trim() || '法院';
                      feat.jurisdiction = String(agencyFeatureEditor.jurisdiction || '').trim();
                  } else {
                      feat.unit = String(agencyFeatureEditor.unit || '').trim();
                      feat.address = String(agencyFeatureEditor.address || '').trim();
                      feat.phone = String(agencyFeatureEditor.phone || '').trim();
                      feat.zip = String(agencyFeatureEditor.zip || '').trim();
                  }
              });
              setWorkMapNotice('屬性已儲存');
              workMapEditLayout.syncOverlayLayers?.();
              return true;
          }

          function saveCurrentLocationProperties() {
              const title = String(mapCurrentLocation.title || '').trim() || '現在位置';
              mapCurrentLocation.title = title;
              mapCurrentLocation.description = String(mapCurrentLocation.description || '').trim();
              setWorkMapNotice('現在位置已儲存');
              return true;
          }

          function setCurrentLocationFromMap(lngLat) {
              mapCurrentLocation.lng = lngLat[0];
              mapCurrentLocation.lat = lngLat[1];
              workMapEditLayout.syncOverlayLayers?.();
              setWorkMapNotice('已設定現在位置');
          }

          function clearCurrentLocation() {
              mapCurrentLocation.lng = null;
              mapCurrentLocation.lat = null;
              workMapEditLayout.syncOverlayLayers?.();
              setWorkMapNotice('已清除現在位置');
          }

          async function removeAgencySelectedFeature(skipConfirm = false) {
              const kind = workMapUi.editTarget;
              if (kind !== AGENCY_LAYER_KINDS.judicial && kind !== AGENCY_LAYER_KINDS.police) return;
              const feat = agencySelectedFeature.value;
              if (!feat) return;
              if (!skipConfirm && !window.confirm('確定刪除此地點？')) return;
              commitAgencyLayerChange(() => {
                  const features = agencyLayerDoc[kind]?.features || [];
                  const idx = features.findIndex((f) => f.id === feat.id);
                  if (idx >= 0) features.splice(idx, 1);
              });
              clearWorkMapSelection();
          }

          function saveWorkMapSelectedFeatureProperties() {
              const featureId = workMapFeatureEditor.featureId || workMapUi.selectedFeatureId;
              if (!featureId) return false;

              const found = findWorkMapFeature(featureId);
              if (!found) return false;

              const { feat } = found;
              const title = String(workMapFeatureEditor.title || '').trim();
              const description = String(workMapFeatureEditor.description ?? '').trim();
              const color = normalizeColor(workMapFeatureEditor.color);

              if (!title) {
                  setWorkMapNotice('標題不可空白');
                  return false;
              }

              const unchanged =
                  title === feat.title &&
                  description === (feat.description || '') &&
                  color === normalizeColor(feat.color);
              if (unchanged) {
                  setWorkMapNotice('屬性已儲存');
                  return true;
              }

              commitWorkMapChange(() => {
                  feat.title = title;
                  feat.description = description;
                  feat.color = color;
              });
              workMapFeatureEditor.title = title;
              workMapFeatureEditor.description = description;
              workMapFeatureEditor.color = color;
              workMapEditLayout.syncSelectionOnMap?.();
              setWorkMapNotice('屬性已儲存');
              return true;
          }

          function commitWorkMapFeatureDrafts() {
              if (workMapUi.editTarget === 'currentLocation') {
                  saveCurrentLocationProperties();
                  return;
              }
              if (
                  workMapUi.editTarget === AGENCY_LAYER_KINDS.judicial
                  || workMapUi.editTarget === AGENCY_LAYER_KINDS.police
              ) {
                  saveAgencySelectedFeatureProperties();
                  return;
              }
              saveWorkMapSelectedFeatureProperties();
          }

          function selectWorkMapFeature(featureId) {
              workMapUi.selectedFeatureId = featureId;
              workMapUi.toolMode = WORK_MAP_TOOL_MODES.select;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              loadWorkMapFeatureEditor(featureId);
          }

          function getWorkMapActiveList() {
              return workMapDoc.lists.find((l) => l.id === workMapUi.activeListId) ?? null;
          }

          function isNearFirstDraftPoint(lngLat, screenPoint) {
              if (workMapUi.draftCoords.length < 3) return false;
              const first = workMapUi.draftCoords[0];
              const projected = workMapEditLayout.projectLngLat?.(first);
              if (projected && screenPoint) {
                  const dx = projected.x - screenPoint.x;
                  const dy = projected.y - screenPoint.y;
                  return Math.hypot(dx, dy) <= 12;
              }
              return coordsNearlyEqual(first, lngLat, 0.00008);
          }

          function finishWorkMapPathDraft({ forcePolygon = false } = {}) {
              const list = getWorkMapActiveList();
              const mode = workMapUi.toolMode;
              if (
                  !list ||
                  (mode !== WORK_MAP_TOOL_MODES.line && mode !== WORK_MAP_TOOL_MODES.polygon)
              ) {
                  return;
              }
              let coords = [...workMapUi.draftCoords];
              if (mode === WORK_MAP_TOOL_MODES.polygon) {
                  if (coords.length < 3) {
                      setWorkMapNotice('區域至少需要 3 個節點');
                      return;
                  }
                  if (coordsNearlyEqual(coords[0], coords[coords.length - 1])) {
                      coords = coords.slice(0, -1);
                  }
                  const feat = createDefaultFeature(
                      WORK_MAP_FEATURE_TYPES.polygon,
                      coords,
                      list.features.length
                  );
                  commitWorkMapChange(() => {
                      list.features.push(feat);
                  });
                  selectWorkMapFeature(feat.id);
                  workMapUi.draftCoords = [];
                  workMapUi.draftCursor = null;
                  return;
              }

              if (coords.length < 2) {
                  setWorkMapNotice('線條至少需要 2 個節點');
                  return;
              }
              const closed = forcePolygon || isNearFirstDraftPoint(coords[coords.length - 1], null);
              let type = WORK_MAP_FEATURE_TYPES.line;
              if (closed && coords.length >= 3) {
                  type = WORK_MAP_FEATURE_TYPES.polygon;
                  if (coordsNearlyEqual(coords[0], coords[coords.length - 1])) {
                      coords = coords.slice(0, -1);
                  }
              }
              const feat = createDefaultFeature(type, coords, list.features.length);
              commitWorkMapChange(() => {
                  list.features.push(feat);
              });
              selectWorkMapFeature(feat.id);
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
          }

          function cancelWorkMapDraft() {
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              workMapEditLayout.clearDraftOnMap?.();
          }

          function popWorkMapDraftVertex() {
              if (!workMapUi.draftCoords.length) return;
              workMapUi.draftCoords.pop();
              workMapUi.draftCursor = null;
          }

          function handleWorkMapEditClick(lngLat, meta = {}) {
              if (workMapSuppressClick) {
                  workMapSuppressClick = false;
                  return;
              }

              if (workMapUi.editTarget === 'currentLocation') {
                  setCurrentLocationFromMap(lngLat);
                  return;
              }

              const agencyKind = workMapUi.editTarget;
              if (
                  agencyKind === AGENCY_LAYER_KINDS.judicial
                  || agencyKind === AGENCY_LAYER_KINDS.police
              ) {
                  const features = agencyLayerDoc[agencyKind]?.features || [];
                  if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.select) {
                      if (meta.hit?.id) {
                          selectAgencyFeature(meta.hit.id);
                      } else {
                          clearWorkMapSelection();
                      }
                      return;
                  }
                  if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.point) {
                      const feat = agencyKind === AGENCY_LAYER_KINDS.judicial
                          ? createDefaultJudicialFeature(lngLat, features.length)
                          : createDefaultPoliceFeature(lngLat, features.length);
                      commitAgencyLayerChange(() => {
                          features.push(feat);
                      });
                      selectAgencyFeature(feat.id);
                  }
                  return;
              }

              if (!workMapUi.activeListId) {
                  setWorkMapNotice('請先選擇圖層');
                  return;
              }
              const list = getWorkMapActiveList();
              if (!list) return;

              if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.select) {
                  if (meta.hit?.id) {
                      selectWorkMapFeature(meta.hit.id);
                  } else {
                      clearWorkMapSelection();
                  }
                  return;
              }

              if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.point) {
                  const feat = createDefaultFeature(
                      WORK_MAP_FEATURE_TYPES.point,
                      lngLat,
                      list.features.length
                  );
                  commitWorkMapChange(() => {
                      list.features.push(feat);
                  });
                  selectWorkMapFeature(feat.id);
                  return;
              }

              if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.line) {
                  if (
                      workMapUi.draftCoords.length >= 3 &&
                      isNearFirstDraftPoint(lngLat, meta.point)
                  ) {
                      finishWorkMapPathDraft({ forcePolygon: true });
                      return;
                  }
                  workMapUi.draftCoords.push(lngLat);
                  workMapUi.draftCursor = null;
                  return;
              }

              if (workMapUi.toolMode === WORK_MAP_TOOL_MODES.polygon) {
                  if (
                      workMapUi.draftCoords.length >= 3 &&
                      isNearFirstDraftPoint(lngLat, meta.point)
                  ) {
                      finishWorkMapPathDraft();
                      return;
                  }
                  workMapUi.draftCoords.push(lngLat);
                  workMapUi.draftCursor = null;
              }
          }

          function handleWorkMapMouseDown(lngLat, meta = {}) {
              if (workMapUi.toolMode !== WORK_MAP_TOOL_MODES.select) return;

              const map = workMapEditLayout.getMap?.();
              const selected = workMapSelectedFeature.value;

              if (selected && map && meta.point) {
                  const vtx = hitTestVertex(map, meta.point, selected, workMapUi.activeListId);
                  if (vtx) {
                      workMapHistory.push(snapshotWorkMapDoc());
                      workMapDragState = {
                          kind: 'vertex',
                          featureId: selected.id,
                          vertexIndex: vtx.vertexIndex,
                      };
                      workMapEditLayout.setDragPanEnabled?.(false);
                      return;
                  }
              }

              if (meta.hit?.id) {
                  if (workMapUi.selectedFeatureId !== meta.hit.id) {
                      selectWorkMapFeature(meta.hit.id);
                  }
                  workMapHistory.push(snapshotWorkMapDoc());
                  workMapDragState = {
                      kind: 'feature',
                      featureId: meta.hit.id,
                      lastLngLat: lngLat,
                  };
                  workMapEditLayout.setDragPanEnabled?.(false);
              }
          }

          function handleWorkMapMouseUp() {
              if (!workMapDragState) return;
              workMapSuppressClick = true;
              workMapEditLayout.setDragPanEnabled?.(true);
              workMapDragState = null;
              workMapEditLayout.syncVerticesOnMap?.();
              workMapEditLayout.syncSelectionOnMap?.();
          }

          function handleWorkMapEditDblClick() {
              if (
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.line &&
                  workMapUi.draftCoords.length >= 2
              ) {
                  finishWorkMapPathDraft({ forcePolygon: false });
                  return;
              }
              if (
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.polygon &&
                  workMapUi.draftCoords.length >= 3
              ) {
                  finishWorkMapPathDraft();
              }
          }

          function handleWorkMapEditMouseMove(lngLat) {
              if (workMapDragState) {
                  const found = findWorkMapFeature(workMapDragState.featureId);
                  if (!found) return;
                  const { feat } = found;
                  if (workMapDragState.kind === 'vertex') {
                      applyCoordToFeature(feat, workMapDragState.vertexIndex, lngLat);
                  } else if (workMapDragState.lastLngLat) {
                      moveFeatureByDelta(feat, workMapDragState.lastLngLat, lngLat);
                      workMapDragState.lastLngLat = lngLat;
                  }
                  workMapEditLayout.syncVerticesOnMap?.();
                  return;
              }

              const isDrawing =
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.line ||
                  workMapUi.toolMode === WORK_MAP_TOOL_MODES.polygon;
              if (!isDrawing || !workMapUi.draftCoords.length) {
                  workMapUi.draftCursor = null;
                  return;
              }
              workMapUi.draftCursor = lngLat;
          }

          function handleWorkMapKeydown(e) {
              if (!workMapEditViewActive.value) return;
              const tag = e.target?.tagName;
              if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

              if (e.key === 'Escape') {
                  if (workMapUi.draftCoords.length) {
                      e.preventDefault();
                      cancelWorkMapDraft();
                      return;
                  }
                  if (workMapUi.selectedFeatureId) {
                      e.preventDefault();
                      clearWorkMapSelection();
                  }
                  return;
              }

              if (e.key === 'Backspace' && workMapUi.draftCoords.length) {
                  e.preventDefault();
                  popWorkMapDraftVertex();
                  return;
              }

              if (e.key === 'Delete' && workMapUi.selectedFeatureId) {
                  e.preventDefault();
                  removeWorkMapSelectedFeature({ skipConfirm: true });
                  return;
              }

              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                  e.preventDefault();
                  undoWorkMap();
                  return;
              }

              if (
                  (e.ctrlKey || e.metaKey) &&
                  (e.key.toLowerCase() === 'y' ||
                      (e.key.toLowerCase() === 'z' && e.shiftKey))
              ) {
                  e.preventDefault();
                  redoWorkMap();
              }
          }

          function scheduleWorkMapAutoSave() {
              window.clearTimeout(workMapAutoSaveTimer);
              workMapAutoSaveTimer = window.setTimeout(() => {
                  saveWorkMapDoc(currentWorkspace.value, workMapDoc);
              }, 800);
          }

          function updateWorkMapFeatureColorDraft(color) {
              const next = normalizeColor(color);
              workMapFeatureEditor.color = next;
              const found = findWorkMapFeature(workMapFeatureEditor.featureId);
              if (found) {
                  found.feat.color = next;
              }
          }

          function selectWorkMapFeatureFromList(listId, featureId) {
              selectWorkMapLayerForEdit(listId);
              selectWorkMapFeature(featureId);
          }

          function removeWorkMapSelectedFeature({ skipConfirm = false } = {}) {
              if (
                  workMapUi.editTarget === AGENCY_LAYER_KINDS.judicial
                  || workMapUi.editTarget === AGENCY_LAYER_KINDS.police
              ) {
                  void removeAgencySelectedFeature(skipConfirm);
                  return;
              }
              const list = getWorkMapActiveList();
              const feat = workMapSelectedFeature.value;
              if (!list || !feat) return;
              if (!skipConfirm && !window.confirm('確定刪除此地點？')) return;
              commitWorkMapChange(() => {
                  const idx = list.features.findIndex((f) => f.id === feat.id);
                  if (idx >= 0) list.features.splice(idx, 1);
              });
              clearWorkMapSelection();
          }

          function undoWorkMap() {
              const prev = workMapHistory.undo(snapshotWorkMapDoc());
              if (prev) applyWorkMapSnapshot(prev);
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
          }

          function redoWorkMap() {
              const next = workMapHistory.redo(snapshotWorkMapDoc());
              if (next) applyWorkMapSnapshot(next);
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
          }

          function openWorkMapEdit() {
              workMapSession.entryView = dashMapLayout.getView?.() ?? null;
              workMapSession.pendingView = null;
              if (!workMapUi.activeListId && workMapDoc.lists.length) {
                  const first = workMapDoc.lists.find((l) => l.visible) ?? workMapDoc.lists[0];
                  if (first) activateWorkMapLayer(first.id);
              }
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              switchView('workMapEdit');
          }

          function saveWorkMapAndReturnDashboard() {
              if (workMapUi.editingLayerNameId) {
                  finishRenameWorkMapLayer(workMapUi.editingLayerNameId);
              }
              commitWorkMapFeatureDrafts();
              saveWorkMapDoc(currentWorkspace.value, workMapDoc);
              saveAgencyLayerDoc(currentWorkspace.value, agencyLayerDoc);
              workMapSession.pendingView = workMapEditLayout.getView?.() ?? null;
              workMapSession.entryView = null;
              workMapUi.draftCoords = [];
              workMapUi.draftCursor = null;
              workMapUi.selectedFeatureId = null;
              workMapEditLayout.clearDraftOnMap?.();
              switchView('dashboard');
          }

          reloadWorkMapDoc();
          reloadAgencyLayerDoc();

          useDashboardCharts({
              rootRef: dashRootRef,
              isActiveRef: dashViewActive,
              dashStatsRef: dashStats,
              dashBreakdownSlotsRef: dashBreakdownSlots,
          });

          useDashboardCharts({
              rootRef: dashMapRootRef,
              isActiveRef: dashMapViewActive,
              dashStatsRef: dashStats,
              dashBreakdownSlotsRef: dashBreakdownSlots,
          });

          const dashMapLayout = useDashboardMapView({
              rootRef: dashMapRootRef,
              isActiveRef: dashMapViewActive,
              getWorkspaceId: () => currentWorkspace.value,
              workMapDocRef: workMapDoc,
              agencyLayerDocRef: agencyLayerDoc,
              currentLocationRef: mapCurrentLocation,
              pendingViewRef: workMapSession,
          });

          const workMapEditLayout = useWorkMapEditor({
              rootRef: workMapEditRootRef,
              isActiveRef: workMapEditViewActive,
              workMapDocRef: workMapDoc,
              workMapUiRef: workMapUi,
              getInitialView: () => workMapSession.entryView,
              getEditTarget: () => workMapUi.editTarget,
              getAgencyFeatures: () => {
                  const kind = workMapUi.editTarget;
                  if (kind !== AGENCY_LAYER_KINDS.judicial && kind !== AGENCY_LAYER_KINDS.police) {
                      return [];
                  }
                  return agencyLayerDoc[kind]?.features || [];
              },
              getAgencySelectedId: () => workMapUi.selectedFeatureId,
              getCurrentLocation: () => (
                  Number.isFinite(mapCurrentLocation.lng) && Number.isFinite(mapCurrentLocation.lat)
                      ? mapCurrentLocation
                      : null
              ),
              onMapClick: handleWorkMapEditClick,
              onMapDblClick: handleWorkMapEditDblClick,
              onMapMouseMove: handleWorkMapEditMouseMove,
              onMapMouseDown: handleWorkMapMouseDown,
              onMapMouseUp: handleWorkMapMouseUp,
              getSelectedFeature: () => workMapSelectedFeature.value,
              getToolMode: () => workMapUi.toolMode,
          });

          watch(workMapEditViewActive, (active) => {
              if (active) {
                  window.addEventListener('keydown', handleWorkMapKeydown);
              } else {
                  window.removeEventListener('keydown', handleWorkMapKeydown);
                  workMapDragState = null;
                  workMapEditLayout.setDragPanEnabled?.(true);
              }
          }, { immediate: true });

          watch(
              () => ({ ws: currentWorkspace.value, lists: workMapDoc.lists }),
              () => scheduleWorkMapAutoSave(),
              { deep: true }
          );

          watch(
              () => ({ ws: currentWorkspace.value, doc: agencyLayerDoc }),
              () => {
                  saveAgencyLayerDoc(currentWorkspace.value, agencyLayerDoc);
              },
              { deep: true }
          );

          watch(currentWorkspace, () => {
              reloadWorkMapDoc();
              reloadAgencyLayerDoc();
          });

          const dashMapTodoPendingCount = computed(() =>
              (personalAdmin.todos || []).filter((t) => !t.done).length
          );

          watch(
              [dashStats, dashBreakdownSlots, dashMapViewActive],
              () => {
                  if (dashMapViewActive.value) {
                      nextTick(() => {
                          dashMapLayout.syncLayout();
                          dashMapLayout.resizeMap();
                      });
                  }
              },
              { deep: true }
          );

          function gotoDashCasesFilter({ statusFilter, assignDateQ, proceedDateQ, closeDateQ } = {}) {
              casesManager.clearCaseFilters();
              if (assignDateQ) casesManager.caseFilters.assignDateQ = assignDateQ;
              if (proceedDateQ) casesManager.caseFilters.proceedDateQ = proceedDateQ;
              if (closeDateQ) casesManager.caseFilters.closeDateQ = closeDateQ;
              if (statusFilter) casesManager.changeStatusFilter(statusFilter);
              else casesManager.changeStatusFilter('全部');
              casesManager.changeTab('全部');
              switchView('cases');
          }

          function gotoDashUnresolved() {
              gotoDashCasesFilter({ statusFilter: '未結' });
          }

          function gotoDashNewlyReceived() {
              gotoDashCasesFilter({ assignDateQ: util.todayRocDate7().slice(0, 5) });
          }

          function gotoDashClosedThisMonth() {
              gotoDashCasesFilter({ closeDateQ: util.todayRocDate7().slice(0, 5) });
          }

          function gotoDashProceedingThisMonth() {
              gotoDashCasesFilter({ proceedDateQ: util.todayRocDate7().slice(0, 5) });
          }

          function gotoDashNotProceeding() {
              gotoDashCasesFilter({ statusFilter: '未進行' });
          }
  
          function monthStartRoc7(monthRoc5) {
              const yyyyMm = util.rocMonth5ToYyyyMm(monthRoc5);
              if (!yyyyMm) return util.todayRocDate7();
              const s = util.isoToRocDate7(`${yyyyMm}-01`);
              return s || util.todayRocDate7();
          }
  
          // 差勤：以月為單位的加班（上半）/休假（下半）合併頁
          const attendanceMonthRoc5 = ref(util.todayRocDate7().slice(0, 5));
          const attendanceMonthPickerOpen = ref(false);
          const attendanceMonthPickerDraft = ref(util.todayRocDate7().slice(0, 5));
          const attendanceMonthLimit = reactive({ regular: 0, project: 0, claimedMonthlyOtPay: false, note: '' });
          const attendanceMonthLimitTotal = computed(
              () => Number(attendanceMonthLimit.regular || 0) + Number(attendanceMonthLimit.project || 0)
          );
          const attendanceMonthLimitEditorOpen = ref(false);
          const attendanceMonthLimitDraft = reactive({ regular: 0, project: 0, note: '' });
          const attendanceMonthLimitDraftTotal = computed(
              () => Number(attendanceMonthLimitDraft.regular || 0) + Number(attendanceMonthLimitDraft.project || 0)
          );
  
          function syncAttendanceMonthLimitFromStore() {
              const month5 = attendanceMonthRoc5.value;
              const store = personalAdmin.attendanceOvertimeMonthLimits || {};
              const v = store[month5] && typeof store[month5] === 'object' ? store[month5] : {};
              attendanceMonthLimit.regular = Number(v.regular || 0);
              attendanceMonthLimit.project = Number(v.project || 0);
              attendanceMonthLimit.claimedMonthlyOtPay = !!v.claimedMonthlyOtPay;
              attendanceMonthLimit.note = v.note != null && typeof v.note === 'string' ? v.note : '';
          }
  
          syncAttendanceMonthLimitFromStore();
  
          function persistAttendanceMonthLimitRow() {
              const month5 = attendanceMonthRoc5.value;
              if (!personalAdmin.attendanceOvertimeMonthLimits || typeof personalAdmin.attendanceOvertimeMonthLimits !== 'object') {
                  personalAdmin.attendanceOvertimeMonthLimits = {};
              }
              const prev = personalAdmin.attendanceOvertimeMonthLimits[month5];
              const base =
                  prev && typeof prev === 'object'
                      ? { ...prev }
                      : { regular: 0, project: 0, claimedMonthlyOtPay: false, note: '' };
              base.regular = Number(attendanceMonthLimit.regular || 0);
              base.project = Number(attendanceMonthLimit.project || 0);
              base.claimedMonthlyOtPay = !!attendanceMonthLimit.claimedMonthlyOtPay;
              base.note = String(attendanceMonthLimit.note ?? '');
              personalAdmin.attendanceOvertimeMonthLimits[month5] = base;
          }
  
          watch(attendanceMonthLimit, () => persistAttendanceMonthLimitRow(), { deep: true });
  
          const attendanceOtModal = reactive({
              open: false,
              editingId: null,
              dateRoc: util.todayRocDate7(),
              type: 'regular',
              startRocTime4: '',
              endRocTime4: '',
              note: '',
              otDeclared: false,
          });
  
          const attendanceLeaveYearRoc3 = ref(util.todayRocDate7().slice(0, 3));
          const attendanceLeaveYearRoc3Padded = computed(() => {
              const s = String(attendanceLeaveYearRoc3.value || '').replace(/\D/g, '').slice(0, 3);
              return s.padStart(3, '0');
          });
          const attendanceLeaveYearPickerOpen = ref(false);
          const attendanceLeaveYearPickerDraft = ref(util.todayRocDate7().slice(0, 3));
          const attendanceLeaveYearPickerDraftPadded = computed(() => {
              const s = String(attendanceLeaveYearPickerDraft.value || '').replace(/\D/g, '').slice(0, 3);
              return s.padStart(3, '0');
          });
  
          function normalizedLeaveYearKey(roc3) {
              const raw = String(roc3 || '').replace(/\D/g, '').slice(0, 3);
              if (!raw) return '000';
              return raw.padStart(3, '0').slice(0, 3);
          }
  
          function attendanceLeaveYearSettingsDefaults() {
              return {
                  quotaDays: 0,
                  mandatoryRestDays: 0,
                  mandatoryRestDateRoc7: '',
                  travelCardSubsidy: 'not_received',
              };
          }
  
          const attendanceLeaveYearPanel = reactive(attendanceLeaveYearSettingsDefaults());
          const attendanceLeaveYearSettingsEditorOpen = ref(false);
          const attendanceLeaveYearSettingsDraft = reactive({
              quotaDays: 0,
              mandatoryRestDays: 0,
              mandatoryRestDateRoc7: '',
          });
  
          function syncAttendanceLeaveYearPanelFromStore() {
              const yk = normalizedLeaveYearKey(attendanceLeaveYearRoc3.value);
              const store = personalAdmin.attendanceLeaveYearSettings || {};
              const raw = store[yk];
              const row = raw && typeof raw === 'object' ? raw : {};
              const d = attendanceLeaveYearSettingsDefaults();
              attendanceLeaveYearPanel.quotaDays =
                  row.quotaDays !== undefined && row.quotaDays !== null && row.quotaDays !== ''
                      ? Math.max(0, Number(row.quotaDays) || 0)
                      : d.quotaDays;
              attendanceLeaveYearPanel.mandatoryRestDays = Math.max(0, Number(row.mandatoryRestDays) || 0);
              attendanceLeaveYearPanel.mandatoryRestDateRoc7 = util.normalizeRocDate7(String(row.mandatoryRestDateRoc7 || ''));
              attendanceLeaveYearPanel.travelCardSubsidy = row.travelCardSubsidy === 'received' ? 'received' : 'not_received';
          }
  
          syncAttendanceLeaveYearPanelFromStore();
  
          watch(
              attendanceLeaveYearPanel,
              () => {
                  const yk = normalizedLeaveYearKey(attendanceLeaveYearRoc3.value);
                  if (!personalAdmin.attendanceLeaveYearSettings || typeof personalAdmin.attendanceLeaveYearSettings !== 'object') {
                      personalAdmin.attendanceLeaveYearSettings = {};
                  }
                  personalAdmin.attendanceLeaveYearSettings[yk] = {
                      quotaDays: Math.max(0, Number(attendanceLeaveYearPanel.quotaDays) || 0),
                      mandatoryRestDays: Math.max(0, Number(attendanceLeaveYearPanel.mandatoryRestDays) || 0),
                      mandatoryRestDateRoc7: util.normalizeRocDate7(attendanceLeaveYearPanel.mandatoryRestDateRoc7 || ''),
                      travelCardSubsidy: attendanceLeaveYearPanel.travelCardSubsidy === 'received' ? 'received' : 'not_received',
                  };
              },
              { deep: true }
          );
  
          function yearStartRoc7(yearRoc3) {
              const ry = parseInt(String(yearRoc3 || '').slice(0, 3), 10);
              if (Number.isNaN(ry)) return util.todayRocDate7();
              const gy = ry + 1911;
              return util.isoToRocDate7(`${gy}-01-01`) || util.todayRocDate7();
          }
  
          const attendanceLeaveModal = reactive({
              open: false,
              editingId: null,
              startRoc7: yearStartRoc7(attendanceLeaveYearRoc3.value),
              endRoc7: yearStartRoc7(attendanceLeaveYearRoc3.value),
              leaveDaysDD: 0,
              leaveHoursHH: 0,
              leaveStartRocTime4: '',
              leaveEndRocTime4: '',
              proxyDivision: '',
              note: '',
          });
  
          const trainingModalFileInput = ref(null);
          const trainingModalUploading = ref(false);
          const trainingExpandedId = ref(null);
          const trainingYearCollapsed = reactive({});
          const trainingRecordModal = reactive({
              editingId: null,
              title: '',
              startRoc7: '',
              endRoc7: '',
              isOnline: true,
              venue: '',
              hours: '',
              attachments: [],
          });
  
          function computeDurationHHMM(startRocTime4, endRocTime4) {
              const t1 = util.normalizeRocTime4(startRocTime4);
              const t2 = util.normalizeRocTime4(endRocTime4);
              if (t1.length !== 4 || t2.length !== 4) return { hoursDecimal: 0, hoursHHMM: '' };
              const sh = parseInt(t1.slice(0, 2), 10);
              const sm = parseInt(t1.slice(2, 4), 10);
              const eh = parseInt(t2.slice(0, 2), 10);
              const em = parseInt(t2.slice(2, 4), 10);
              if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return { hoursDecimal: 0, hoursHHMM: '' };
              if (sh > 23 || eh > 23 || sm > 59 || em > 59) return { hoursDecimal: 0, hoursHHMM: '' };
  
              const sMins = sh * 60 + sm;
              const eMins = eh * 60 + em;
              let diff = eMins - sMins;
              if (diff < 0) diff += 24 * 60;
              if (diff <= 0) return { hoursDecimal: 0, hoursHHMM: '' };
  
              const hh = Math.floor(diff / 60);
              const mm = diff % 60;
              return {
                  hoursDecimal: diff / 60,
                  hoursHHMM: `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`,
              };
          }
  
          const attendanceOtModalComputed = computed(() =>
              computeDurationHHMM(attendanceOtModal.startRocTime4, attendanceOtModal.endRocTime4)
          );
          const attendanceOtModalEntryHoursDisplay = computed(() => {
              const d = attendanceOtModalComputed.value;
              if (!d.hoursHHMM) return '—';
              return formatOvertimeHoursZh(d.hoursDecimal);
          });
  
          const attendanceLeaveModalSameDay = computed(() => {
              const s = util.normalizeRocDate7(attendanceLeaveModal.startRoc7 || '');
              const e = util.normalizeRocDate7(attendanceLeaveModal.endRoc7 || '');
              return s.length === 7 && e.length === 7 && s === e;
          });
  
          const attendanceLeaveModalDurationPreview = computed(() => {
              if (!attendanceLeaveModalSameDay.value) return '';
              const t1 = util.normalizeRocTime4(attendanceLeaveModal.leaveStartRocTime4 || '');
              const t2 = util.normalizeRocTime4(attendanceLeaveModal.leaveEndRocTime4 || '');
              const d = computeDurationHHMM(t1, t2);
              if (!d.hoursHHMM) return '';
              return `${d.hoursHHMM.slice(0, 2)}:${d.hoursHHMM.slice(2, 4)}`;
          });
  
          const attendanceOtPanelAddLabel = computed(() => {
              if (!attendanceOtModal.open) return '新增紀錄';
              return attendanceOtModal.editingId ? '收合編輯' : '收合新增';
          });
  
          const attendanceLeavePanelAddLabel = computed(() => {
              if (!attendanceLeaveModal.open) return '新增紀錄';
              return attendanceLeaveModal.editingId ? '收合編輯' : '收合新增';
          });
  
          function overtimeRowMonth5(e) {
              const d7 = e.dateRoc || (e.dateIso ? util.isoToRocDate7(String(e.dateIso).slice(0, 10)) : '');
              return String(d7).slice(0, 5);
          }
  
          // 總覽頁面：加班監控＝「本月」personalAdmin.overtimeEntries（與差勤紀錄同源）
          const overtimeMonthMetrics = computed(() => {
              const month5 = util.todayRocDate7().slice(0, 5);
              let rh = 0;
              let ph = 0;
              (personalAdmin.overtimeEntries || []).forEach((e) => {
                  if (overtimeRowMonth5(e) !== month5) return;
                  const h = Number(e.hours) || 0;
                  if (e.type === 'project') ph += h;
                  else rh += h;
              });
              return {
                  regular: { h: rh, m: 0 },
                  project: { h: ph, m: 0 },
                  total: { h: rh + ph, m: 0 },
              };
          });
  
          /** 總覽條圖分母：差勤「本月」一般+專案上限；未設定則依已計時數縮放 */
          const dashOvertimeMonthLimitTotal = computed(() => {
              const month5 = util.todayRocDate7().slice(0, 5);
              const store = personalAdmin.attendanceOvertimeMonthLimits || {};
              const v = store[month5] && typeof store[month5] === 'object' ? store[month5] : {};
              return Number(v.regular || 0) + Number(v.project || 0);
          });
  
          const dashOvertimeBarScale = computed(() => {
              const cap = dashOvertimeMonthLimitTotal.value;
              const tot = overtimeMonthMetrics.value.total.h;
              return cap > 0 ? cap : Math.max(tot, 1);
          });

          const dashMapOtMonthLimits = computed(() => {
              const month5 = util.todayRocDate7().slice(0, 5);
              const store = personalAdmin.attendanceOvertimeMonthLimits || {};
              const v = store[month5] && typeof store[month5] === 'object' ? store[month5] : {};
              return {
                  regular: Number(v.regular || 0),
                  project: Number(v.project || 0),
              };
          });

          function dashMapOtTooltip(limitRaw, usedRaw, remainingRaw) {
              const limit = Number(limitRaw) || 0;
              const used = Number(usedRaw) || 0;
              const limitText = limit > 0 ? formatOvertimeHoursZh(limit) : '—';
              const usedText = formatOvertimeHoursZh(used);
              const remainText =
                  remainingRaw === null || remainingRaw === undefined
                      ? '—'
                      : formatOvertimeHoursZh(remainingRaw);
              return `上限${limitText}，已加班${usedText}，尚可報${remainText}`;
          }

          const dashMapOtRegularRemaining = computed(() => {
              const cap = dashMapOtMonthLimits.value.regular;
              if (!(cap > 0)) return null;
              return Math.max(0, cap - overtimeMonthMetrics.value.regular.h);
          });

          const dashMapOtProjectRemaining = computed(() => {
              const cap = dashMapOtMonthLimits.value.project;
              if (!(cap > 0)) return null;
              return Math.max(0, cap - overtimeMonthMetrics.value.project.h);
          });

          const dashMapOtRegularDotSpec = computed(() =>
              buildAttnDashDotSpec(
                  overtimeMonthMetrics.value.regular.h,
                  dashMapOtMonthLimits.value.regular
              )
          );

          const dashMapOtProjectDotSpec = computed(() =>
              buildAttnDashDotSpec(
                  overtimeMonthMetrics.value.project.h,
                  dashMapOtMonthLimits.value.project
              )
          );

          const dashMapOtRegularTooltip = computed(() =>
              dashMapOtTooltip(
                  dashMapOtMonthLimits.value.regular,
                  overtimeMonthMetrics.value.regular.h,
                  dashMapOtRegularRemaining.value
              )
          );

          const dashMapOtProjectTooltip = computed(() =>
              dashMapOtTooltip(
                  dashMapOtMonthLimits.value.project,
                  overtimeMonthMetrics.value.project.h,
                  dashMapOtProjectRemaining.value
              )
          );

          const dashMapOtRegularUsedDisplay = computed(() =>
              formatOvertimeHoursPlain(overtimeMonthMetrics.value.regular.h)
          );
          const dashMapOtProjectUsedDisplay = computed(() =>
              formatOvertimeHoursPlain(overtimeMonthMetrics.value.project.h)
          );
          const dashMapOtRegularReportableDisplay = computed(() => {
              const cap = dashMapOtMonthLimits.value.regular;
              return cap > 0 ? formatOvertimeHoursPlain(cap) : '—';
          });
          const dashMapOtProjectReportableDisplay = computed(() => {
              const cap = dashMapOtMonthLimits.value.project;
              return cap > 0 ? formatOvertimeHoursPlain(cap) : '—';
          });

          function buildAttnDashBarSpec(usedRaw, capRaw) {
              const used = Math.max(0, Number(usedRaw) || 0);
              const cap = Number(capRaw) || 0;
              if (!(cap > 0)) {
                  return { inactive: true, usedPct: 0, remainPct: 0 };
              }
              const usedPct = Math.min(100, Math.round((used / cap) * 1000) / 10);
              return {
                  inactive: false,
                  usedPct,
                  remainPct: Math.max(0, Math.round((100 - usedPct) * 10) / 10),
              };
          }

          const dashDetailOtRegularBarSpec = computed(() =>
              buildAttnDashBarSpec(
                  overtimeMonthMetrics.value.regular.h,
                  dashMapOtMonthLimits.value.regular
              )
          );
          const dashDetailOtProjectBarSpec = computed(() =>
              buildAttnDashBarSpec(
                  overtimeMonthMetrics.value.project.h,
                  dashMapOtMonthLimits.value.project
              )
          );
          const dashDetailLeaveBarSpec = computed(() =>
              buildAttnDashBarSpec(
                  attendanceThisYearLeaveUsedDaysEq.value,
                  attendanceDashLeaveQuotaNum.value
              )
          );

          function buildAttnDashYearBarSpec(hoursRaw, scaleRaw) {
              const used = Math.max(0, Number(hoursRaw) || 0);
              const scale = Math.max(Number(scaleRaw) || 0, used, 1);
              if (used <= 0) {
                  return { inactive: true, usedPct: 0, remainPct: 0 };
              }
              const usedPct = Math.min(100, Math.round((used / scale) * 1000) / 10);
              return {
                  inactive: false,
                  usedPct,
                  remainPct: Math.max(0, Math.round((100 - usedPct) * 10) / 10),
              };
          }

          const dashDetailOtYearBarScale = computed(() =>
              Math.max(
                  overtimeMetrics.value.regular.h,
                  overtimeMetrics.value.project.h,
                  1
              )
          );
          const dashDetailOtYearRegularBarSpec = computed(() =>
              buildAttnDashYearBarSpec(
                  overtimeMetrics.value.regular.h,
                  dashDetailOtYearBarScale.value
              )
          );
          const dashDetailOtYearProjectBarSpec = computed(() =>
              buildAttnDashYearBarSpec(
                  overtimeMetrics.value.project.h,
                  dashDetailOtYearBarScale.value
              )
          );
          const dashDetailOtYearRegularDisplay = computed(() =>
              formatOvertimeHoursPlain(overtimeMetrics.value.regular.h)
          );
          const dashDetailOtYearProjectDisplay = computed(() =>
              formatOvertimeHoursPlain(overtimeMetrics.value.project.h)
          );

          const dashMapOtRegularRemainingDisplay = computed(() =>
              dashMapOtRegularRemaining.value === null
                  ? '—'
                  : formatOvertimeHoursPlain(dashMapOtRegularRemaining.value)
          );
          const dashMapOtProjectRemainingDisplay = computed(() =>
              dashMapOtProjectRemaining.value === null
                  ? '—'
                  : formatOvertimeHoursPlain(dashMapOtProjectRemaining.value)
          );
  
          function pad2(n) {
              const x = Number(n) || 0;
              return String(x).padStart(2, '0');
          }
  
          function rocRangeDaysDD(startRoc7, endRoc7) {
              const a = util.normalizeRocDate7(startRoc7);
              const b = util.normalizeRocDate7(endRoc7);
              if (a.length !== 7 || b.length !== 7) return 0;
              const aIso = util.rocDate7ToIso(a);
              const bIso = util.rocDate7ToIso(b);
              if (!aIso || !bIso) return 0;
              const aTs = new Date(aIso + 'T12:00:00').getTime();
              const bTs = new Date(bIso + 'T12:00:00').getTime();
              if (Number.isNaN(aTs) || Number.isNaN(bTs)) return 0;
              const sTs = Math.min(aTs, bTs);
              const eTs = Math.max(aTs, bTs);
              const msPerDay = 24 * 60 * 60 * 1000;
              const days = Math.floor((eTs - sTs) / msPerDay) + 1;
              return days > 0 ? days : 0;
          }
  
          function leaveRecordDaysDD(rec) {
              const sr = rec.startRoc7 || (rec.startIso ? util.isoToRocDate7(String(rec.startIso).slice(0, 10)) : '');
              const er = rec.endRoc7 || (rec.endIso ? util.isoToRocDate7(String(rec.endIso).slice(0, 10)) : '');
              return rocRangeDaysDD(sr, er);
          }
  
          function leaveOverlapsMonth(rec, monthRoc5) {
              const yyyyMm = util.rocMonth5ToYyyyMm(monthRoc5);
              if (!yyyyMm) return false;
              const monthStartIso = `${yyyyMm}-01`;
              const first = new Date(`${yyyyMm}-01T00:00:00`);
              const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
              const monthEndIso = `${yyyyMm}-${String(lastDay).padStart(2, '0')}`;
  
              const sr = util.normalizeRocDate7(rec.startRoc7 || rec.startIso || '');
              const er = util.normalizeRocDate7(rec.endRoc7 || rec.endIso || '');
              const startIso = rec.startIso || util.rocDate7ToIso(sr);
              const endIso = rec.endIso || util.rocDate7ToIso(er);
              if (!startIso || !endIso) return false;
  
              let sTs = new Date(startIso + 'T00:00:00').getTime();
              let eTs = new Date(endIso + 'T12:00:00').getTime();
              if (Number.isNaN(sTs) || Number.isNaN(eTs)) return false;
              if (sTs > eTs) [sTs, eTs] = [eTs, sTs];
  
              const mS = new Date(monthStartIso + 'T00:00:00').getTime();
              const mE = new Date(monthEndIso + 'T23:59:59').getTime();
              if (Number.isNaN(mS) || Number.isNaN(mE)) return false;
              return sTs <= mE && eTs >= mS;
          }
  
          const attendanceOvertimeRows = computed(() => {
              const month5 = attendanceMonthRoc5.value;
              const list = (personalAdmin.overtimeEntries || [])
                  .filter((e) => overtimeRowMonth5(e) === month5)
                  .map((e) => {
                      const hhmm =
                          e.hoursHHMM ||
                          (e.startRocTime4 && e.endRocTime4
                              ? computeDurationHHMM(
                                  util.normalizeRocTime4(e.startRocTime4),
                                  util.normalizeRocTime4(e.endRocTime4)
                              ).hoursHHMM
                              : '');
                      const safeHH = hhmm && /^\d{4}$/.test(hhmm) ? hhmm : '';
                      const otTimeRangeDisplay =
                          e.startRocTime4 && e.endRocTime4
                              ? `${util.normalizeRocTime4(e.startRocTime4)}-${util.normalizeRocTime4(e.endRocTime4)}`
                              : '';
                      let otHoursDisplay = '';
                      if (safeHH && /^\d{4}$/.test(safeHH)) {
                          otHoursDisplay = `${safeHH.slice(0, 2)}:${safeHH.slice(2, 4)}`;
                      } else if (e.hours != null && e.hours !== '' && Number.isFinite(Number(e.hours))) {
                          otHoursDisplay = `${e.hours}h`;
                      }
                      return { ...e, hoursHHMM: safeHH, timeRangeText: otTimeRangeDisplay, otTimeRangeDisplay, otHoursDisplay };
                  });
              list.sort((a, b) => {
                  const da = util.normalizeRocDate7(a.dateRoc || '');
                  const db = util.normalizeRocDate7(b.dateRoc || '');
                  if (da.length === 7 && db.length === 7) return da.localeCompare(db);
                  if (da.length === 7) return -1;
                  if (db.length === 7) return 1;
                  return 0;
              });
              return list;
          });
  
          const attendanceOvertimeRowsRegular = computed(() =>
              attendanceOvertimeRows.value.filter((e) => e.type !== 'project')
          );
          const attendanceOvertimeRowsProject = computed(() =>
              attendanceOvertimeRows.value.filter((e) => e.type === 'project')
          );
  
          function leaveOverlapsYear(rec, yearRoc3) {
              const ry = parseInt(String(yearRoc3 || '').slice(0, 3), 10);
              if (Number.isNaN(ry)) return false;
              const gy = ry + 1911;
              const yearStartIso = `${gy}-01-01`;
              const yearEndIso = `${gy}-12-31`;
  
              const sr = util.normalizeRocDate7(rec.startRoc7 || rec.startIso || '');
              const er = util.normalizeRocDate7(rec.endRoc7 || rec.endIso || '');
              const startIso = rec.startIso || util.rocDate7ToIso(sr);
              const endIso = rec.endIso || util.rocDate7ToIso(er);
              if (!startIso || !endIso) return false;
  
              let sTs = new Date(startIso + 'T00:00:00').getTime();
              let eTs = new Date(endIso + 'T12:00:00').getTime();
              if (Number.isNaN(sTs) || Number.isNaN(eTs)) return false;
              if (sTs > eTs) [sTs, eTs] = [eTs, sTs];
  
              const yS = new Date(yearStartIso + 'T00:00:00').getTime();
              const yE = new Date(yearEndIso + 'T12:00:00').getTime();
              if (Number.isNaN(yS) || Number.isNaN(yE)) return false;
              return sTs <= yE && eTs >= yS;
          }
  
          function leaveRecordDayEquivalentInYear(rec, yearRoc3Raw) {
              const year3 = String(yearRoc3Raw || '').replace(/\D/g, '').slice(0, 3);
              if (!leaveOverlapsYear(rec, year3)) return 0;
              let dd;
              if (rec.leaveDaysDD != null && rec.leaveDaysDD !== '') {
                  dd = Number(rec.leaveDaysDD);
                  if (!Number.isFinite(dd) || dd < 0) dd = leaveRecordDaysDD(rec);
              } else {
                  dd = leaveRecordDaysDD(rec);
              }
              const hhRaw = Number(rec.leaveHoursHH || 0);
              const hh = Number.isFinite(hhRaw) ? Math.max(0, hhRaw) : 0;
              return Math.max(0, dd) + hh / 8;
          }
  
          function formatLeaveDayEqShort(n) {
              const x = Number(n);
              if (!Number.isFinite(x)) return '—';
              const r = Math.round(x * 100) / 100;
              if (Number.isInteger(r)) return String(r);
              return r.toFixed(2).replace(/\.?0+$/, '');
          }
  
          function formatLeaveDaysZh(daysRaw) {
              if (daysRaw === null || daysRaw === undefined) return '—';
              const s = formatLeaveDayEqShort(daysRaw);
              return s === '—' ? '—' : `${s}天`;
          }
  
          /** 加班時數：整數顯示 N小時；否則 N小時N分（避免 1.3333小時） */
          function formatOvertimeHoursZh(hoursRaw) {
              if (hoursRaw === null || hoursRaw === undefined) return '—';
              const h = Number(hoursRaw);
              if (!Number.isFinite(h)) return '—';
              const totalMinutes = Math.round(Math.max(0, h) * 60);
              if (totalMinutes === 0) return '0小時';
              const wholeHours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              if (minutes === 0) return `${wholeHours}小時`;
              if (wholeHours === 0) return `${minutes}分`;
              return `${wholeHours}小時${minutes}分`;
          }

          /** 地圖總覽加班標題：純數字時數，不帶單位（例：10 / 20） */
          function formatOvertimeHoursPlain(hoursRaw) {
              if (hoursRaw === null || hoursRaw === undefined) return '—';
              const h = Number(hoursRaw);
              if (!Number.isFinite(h)) return '—';
              const totalMinutes = Math.round(Math.max(0, h) * 60);
              if (totalMinutes === 0) return '0';
              if (totalMinutes % 60 === 0) return String(totalMinutes / 60);
              const decimal = Math.round((totalMinutes / 60) * 10) / 10;
              return String(decimal);
          }
  
          function leaveYearQuotaDaysForRocYear(yRocSlice) {
              const yk = normalizedLeaveYearKey(yRocSlice);
              const row = (personalAdmin.attendanceLeaveYearSettings || {})[yk];
              if (!row || typeof row !== 'object') return 0;
              const n = Number(row.quotaDays);
              return Number.isFinite(n) && n >= 0 ? n : 0;
          }
  
          const attendanceThisYearLeaveUsedDaysEq = computed(() => {
              const yView = normalizedLeaveYearKey(attendanceLeaveYearRoc3.value);
              return (personalAdmin.leaveRecords || []).reduce((acc, e) => acc + leaveRecordDayEquivalentInYear(e, yView), 0);
          });
  
          const attendanceDashLeaveRemainingDays = computed(() => {
              const yView = normalizedLeaveYearKey(attendanceLeaveYearRoc3.value);
              const quota = leaveYearQuotaDaysForRocYear(yView);
              return quota - attendanceThisYearLeaveUsedDaysEq.value;
          });
  
          const attendanceDashLeaveQuotaNum = computed(() =>
              leaveYearQuotaDaysForRocYear(normalizedLeaveYearKey(attendanceLeaveYearRoc3.value))
          );
          const attendanceDashLeaveQuotaDisplay = computed(() =>
              attendanceDashLeaveQuotaNum.value > 0
                  ? formatLeaveDayEqShort(attendanceDashLeaveQuotaNum.value)
                  : '—'
          );
          const attendanceDashLeaveRemainingDaysNum = computed(() => attendanceDashLeaveRemainingDays.value);
  
          const attendanceDashLeaveRemainingDisplay = computed(() => formatLeaveDayEqShort(attendanceDashLeaveRemainingDays.value));
          const attendanceLeaveUsedDaysEqDisplay = computed(() => formatLeaveDayEqShort(attendanceThisYearLeaveUsedDaysEq.value));
          const attnDashLeaveQuotaLineDisplay = computed(() =>
              attendanceDashLeaveQuotaNum.value > 0 ? formatLeaveDaysZh(attendanceDashLeaveQuotaNum.value) : '—'
          );
          const attnDashLeaveUsedLineDisplay = computed(() =>
              formatLeaveDaysZh(attendanceThisYearLeaveUsedDaysEq.value)
          );
          const attnDashLeaveRemainingLineDisplay = computed(() =>
              formatLeaveDaysZh(attendanceDashLeaveRemainingDays.value)
          );

          const dashDetailLeaveTooltip = computed(() =>
              `休假${attnDashLeaveQuotaLineDisplay.value}，已休${attnDashLeaveUsedLineDisplay.value}，尚餘${attnDashLeaveRemainingLineDisplay.value}`
          );
  
          const attendanceLeaveRows = computed(() => {
              const year3 = attendanceLeaveYearRoc3.value;
              return (personalAdmin.leaveRecords || [])
                  .filter((e) => leaveOverlapsYear(e, year3))
                  .map((e) => {
                      let dd;
                      if (e.leaveDaysDD != null && e.leaveDaysDD !== '') {
                          dd = Number(e.leaveDaysDD);
                          if (!Number.isFinite(dd)) dd = leaveRecordDaysDD(e);
                      } else {
                          dd = leaveRecordDaysDD(e);
                      }
                      const hh = Number(e.leaveHoursHH || 0);
                      const leaveDaysHoursText = `${dd}天${pad2(hh)}小時`;
                      return {
                          ...e,
                          leaveDaysDD: dd,
                          leaveHoursHH: hh,
                          leaveHoursPadded: pad2(hh),
                          leaveDaysHoursText,
                      };
                  });
          });
  
          function trainingRecordSortKey(rec) {
              const sr = util.normalizeRocDate7(rec.startRoc7 || (rec.startIso ? util.isoToRocDate7(String(rec.startIso).slice(0, 10)) : ''));
              return sr.length === 7 ? sr : '9999999';
          }
  
          /** 歸年曆格用：優先起日 7 碼，與年鍵遞補邏輯一致 */
          function trainingRecordYearKey(rec) {
              let sr = util.normalizeRocDate7(rec.startRoc7 || (rec.startIso ? util.isoToRocDate7(String(rec.startIso).slice(0, 10)) : ''));
              if (sr.length !== 7) {
                  sr = util.normalizeRocDate7(rec.endRoc7 || (rec.endIso ? util.isoToRocDate7(String(rec.endIso).slice(0, 10)) : ''));
              }
              if (sr.length >= 3) return sr.slice(0, 3).replace(/\D/g, '').padStart(3, '0').slice(0, 3);
              return '000';
          }

          function currentRocYear3() {
              return String(new Date().getFullYear() - 1911).padStart(3, '0');
          }

          function isTrainingYearCollapsed(yearRoc3) {
              return trainingYearCollapsed[yearRoc3] === true;
          }

          function closeTrainingEditorIfInYear(yearRoc3) {
              const expanded = trainingExpandedId.value;
              if (!expanded || expanded === '__new__') return;
              const rec = (personalAdmin.trainingRecords || []).find((r) => r.id === expanded);
              if (rec && trainingRecordYearKey(rec) === yearRoc3) closeTrainingRecordEditor();
          }

          function toggleTrainingYearSection(yearRoc3) {
              if (isTrainingYearCollapsed(yearRoc3)) {
                  trainingYearCollapsed[yearRoc3] = false;
                  return;
              }
              closeTrainingEditorIfInYear(yearRoc3);
              trainingYearCollapsed[yearRoc3] = true;
          }

          const trainingAllYearsCollapsed = computed(() => {
              const groups = trainingTimelineYearGroups.value || [];
              return groups.length > 0 && groups.every((g) => isTrainingYearCollapsed(g.yearRoc3));
          });

          function toggleAllTrainingYearSections() {
              const groups = trainingTimelineYearGroups.value || [];
              if (!groups.length) return;
              if (trainingAllYearsCollapsed.value) {
                  groups.forEach((g) => {
                      trainingYearCollapsed[g.yearRoc3] = false;
                  });
                  return;
              }
              if (trainingExpandedId.value && trainingExpandedId.value !== '__new__') {
                  closeTrainingRecordEditor();
              }
              groups.forEach((g) => {
                  trainingYearCollapsed[g.yearRoc3] = true;
              });
          }

          function collapsePriorTrainingYears() {
              const current = currentRocYear3();
              (trainingTimelineYearGroups.value || []).forEach((g) => {
                  trainingYearCollapsed[g.yearRoc3] = g.yearRoc3 !== current;
              });
              const expanded = trainingExpandedId.value;
              if (!expanded || expanded === '__new__') return;
              const rec = (personalAdmin.trainingRecords || []).find((r) => r.id === expanded);
              if (rec && trainingRecordYearKey(rec) !== current) closeTrainingRecordEditor();
          }
  
          function trainingRowInterval(rec) {
              if (!rec) return null;
              const s = util.normalizeRocDate7(
                  rec.startRoc7 || (rec.startIso ? util.isoToRocDate7(String(rec.startIso).slice(0, 10)) : '')
              );
              const isoS = util.rocDate7ToIso(s);
              if (!isoS) return null;
              let e = util.normalizeRocDate7(
                  rec.endRoc7 || (rec.endIso ? util.isoToRocDate7(String(rec.endIso).slice(0, 10)) : '')
              );
              let isoE = e.length === 7 && util.rocDate7ToIso(e) ? util.rocDate7ToIso(e) : isoS;
              if (careerIsoAtNoonMs(isoE) < careerIsoAtNoonMs(isoS)) isoE = isoS;
              const isPoint = isoE === isoS;
              return { isoS, isoE, isPoint };
          }
  
          function trainingRowDateLabel(rec) {
              const iv = trainingRowInterval(rec);
              if (!iv) return '—';
              const rocS = util.isoToRocDate7(iv.isoS);
              if (iv.isPoint) return rocS || '—';
              const rocE = util.isoToRocDate7(iv.isoE);
              if (rocE && rocE !== rocS) return `${rocS} — ${rocE}`;
              return rocS || '—';
          }
  
          function trainingRowPeriodLabel(rec) {
              const iv = trainingRowInterval(rec);
              if (!iv) return '—';
              if (iv.isPoint) return '—';
              const p = formatCareerSpanPeriod(iv.isoS, iv.isoE);
              return p || '—';
          }
  
          function trainingRowHasAttachment(rec) {
              if (rec && Array.isArray(rec.trainingAttachments) && rec.trainingAttachments.length > 0) return true;
              return !!String((rec && rec.attachmentUrl) || '').trim();
          }

          function trainingRowHoursNumber(rec) {
              const h = String((rec && rec.hours) || '')
                  .trim()
                  .replace(/,/g, '');
              if (!h) return null;
              const n = parseFloat(h);
              return Number.isFinite(n) ? n : null;
          }

          function trainingRowHoursDisplay(rec) {
              const n = trainingRowHoursNumber(rec);
              if (n == null) return '';
              return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
          }

          function trainingRowStartEndDisplays(rec) {
              const iv = trainingRowInterval(rec);
              if (!iv) return { startDisplay: '—', endDisplay: '', isRange: false };
              const startDisplay = util.formatDateDisplay(util.isoToRocDate7(iv.isoS)) || '—';
              if (iv.isPoint) return { startDisplay, endDisplay: '', isRange: false };
              const endDisplay = util.formatDateDisplay(util.isoToRocDate7(iv.isoE)) || '';
              const isRange = !!(endDisplay && endDisplay !== startDisplay);
              return { startDisplay, endDisplay: isRange ? endDisplay : '', isRange };
          }

          function trainingHoursTotalText(rows) {
              let sum = 0;
              let has = false;
              (rows || []).forEach((r) => {
                  const n = trainingRowHoursNumber(r);
                  if (n == null) return;
                  sum += n;
                  has = true;
              });
              if (!has) return '';
              return Number.isInteger(sum) ? String(sum) : String(Number(sum.toFixed(1)));
          }

          const trainingTimelineYearGroups = computed(() => {
              const list = personalAdmin.trainingRecords || [];
              const map = new Map();
              list.forEach((e) => {
                  const yk = trainingRecordYearKey(e);
                  if (!map.has(yk)) map.set(yk, []);
                  map.get(yk).push(e);
              });
              const years = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
              return years.map((yearRoc3) => {
                  const rawSorted = map
                      .get(yearRoc3)
                      .slice()
                      .sort((a, b) => trainingRecordSortKey(a).localeCompare(trainingRecordSortKey(b)));
                  const yearHoursText = trainingHoursTotalText(rawSorted);
                  const yearRows = rawSorted.map((r) => {
                      const title = String(r.title || '').trim() || '（無標題）';
                      const { startDisplay, endDisplay, isRange } = trainingRowStartEndDisplays(r);
                      const isOnline = r.isOnline !== false;
                      const venue = String(r.venue || '').trim();
                      const hoursDisplay = trainingRowHoursDisplay(r);
                      return {
                          id: r.id,
                          title,
                          startDisplay,
                          endDisplay,
                          isRange,
                          isOnline,
                          modeLabel: isOnline ? '線上' : '線下',
                          venueDisplay: !isOnline && venue ? venue : '',
                          hoursDisplay,
                          dateLabel: trainingRowDateLabel(r),
                          periodLabel: trainingRowPeriodLabel(r),
                          hasAttachment: trainingRowHasAttachment(r),
                      };
                  });
                  const summaryParts = [`${yearRows.length} 筆`];
                  if (yearHoursText) summaryParts.push(`${yearHoursText} 時`);
                  return {
                      yearRoc3,
                      yearRoc3Padded: yearRoc3.padStart(3, '0'),
                      yearBandLabel: `民國 ${yearRoc3.padStart(3, '0')} 年`,
                      yearSummaryText: summaryParts.join(' · '),
                      yearRows,
                      rows: yearRows,
                  };
              });
          });

          const trainingTableRows = computed(() => {
              const rows = [];
              const expanded = trainingExpandedId.value;
              if (expanded === '__new__') {
                  rows.push({ kind: 'expand', key: 'tr-expand-new', isNew: true });
              }
              (trainingTimelineYearGroups.value || []).forEach((grp) => {
                  rows.push({ kind: 'year', key: 'tr-y-' + grp.yearRoc3, grp });
                  if (isTrainingYearCollapsed(grp.yearRoc3)) return;
                  (grp.yearRows || []).forEach((row) => {
                      rows.push({ kind: 'record', key: 'tr-row-' + row.id, row, grp });
                      if (expanded === row.id) {
                          rows.push({ kind: 'expand', key: 'tr-expand-' + row.id, isNew: false, row });
                      }
                  });
              });
              return rows;
          });

          const trainingAddToggleLabel = computed(() =>
              trainingExpandedId.value === '__new__' ? '收合新增' : '新增研習'
          );

          function careerSortByStart(a, b) {
              const sa = util.normalizeRocDate7(a.startRoc7 || '');
              const sb = util.normalizeRocDate7(b.startRoc7 || '');
              if (sa.length === 7 && sb.length === 7) return sa.localeCompare(sb);
              if (sa.length === 7) return -1;
              if (sb.length === 7) return 1;
              return 0;
          }
  
          const careerMainsSorted = computed(() => {
              const list = (personalAdmin.careerTimelineRecords || []).filter(
                  (r) => r.careerTier !== 'child'
              );
              list.sort(careerSortByStart);
              return list;
          });
  
          const careerChildrenByParent = computed(() => {
              const map = Object.create(null);
              (personalAdmin.careerTimelineRecords || []).forEach((r) => {
                  if (r.careerTier === 'child' && r.parentId) {
                      if (!map[r.parentId]) map[r.parentId] = [];
                      map[r.parentId].push(r);
                  }
              });
              Object.keys(map).forEach((k) => {
                  map[k].sort(careerSortByStart);
              });
              return map;
          });
  
          const careerBranchOpen = reactive({});

          function isCareerBranchExpanded(mainId) {
              return careerBranchOpen[mainId] === true;
          }

          function toggleCareerBranch(mainId) {
              careerBranchOpen[mainId] = !isCareerBranchExpanded(mainId);
          }

          function careerChildCount(mainId) {
              const arr = careerChildrenByParent.value[mainId];
              return arr ? arr.length : 0;
          }

          const careerExpandedId = ref(null);

          function careerRowStartEndDisplays(row) {
              const iv = careerRowInterval(row);
              if (!iv) return { startDisplay: '—', endDisplay: '', isRange: false };
              const startDisplay = util.isoToRocDate7(iv.isoS) || '—';
              const rocE = util.isoToRocDate7(iv.isoE);
              const isRange = !iv.isPoint && rocE && rocE !== startDisplay;
              return {
                  startDisplay,
                  endDisplay: isRange ? rocE : '',
                  isRange,
              };
          }

          function careerRowTableDisplay(row, opts = {}) {
              const title = String(row.title || '').trim() || '（無標題）';
              const { startDisplay, endDisplay, isRange } = careerRowStartEndDisplays(row);
              const periodLabel = careerRowPeriodLabel(row);
              const isChild = row.careerTier === 'child';
              return {
                  id: row.id,
                  title,
                  startDisplay,
                  endDisplay,
                  isRange,
                  periodDisplay: periodLabel !== '—' ? periodLabel : '',
                  isChild,
                  isMain: !isChild,
                  childCount: opts.childCount ?? 0,
                  hasAttachment: careerRowHasAttachment(row),
              };
          }

          const careerTableRows = computed(() => {
              const rows = [];
              const expanded = careerExpandedId.value;
              if (expanded === '__new__') {
                  rows.push({ kind: 'expand', key: 'cr-expand-new', isNew: true });
              }
              (careerMainsSorted.value || []).forEach((main) => {
                  const childCount = careerChildCount(main.id);
                  rows.push({
                      kind: 'record',
                      key: 'cr-row-' + main.id,
                      row: careerRowTableDisplay(main, { childCount }),
                      raw: main,
                  });
                  if (expanded === main.id) {
                      rows.push({ kind: 'expand', key: 'cr-expand-' + main.id, isNew: false, isChild: false });
                  }
                  if (isCareerBranchExpanded(main.id)) {
                      (careerChildrenByParent.value[main.id] || []).forEach((child) => {
                          rows.push({
                              kind: 'record',
                              key: 'cr-row-' + child.id,
                              row: careerRowTableDisplay(child),
                              raw: child,
                          });
                          if (expanded === child.id) {
                              rows.push({
                                  kind: 'expand',
                                  key: 'cr-expand-' + child.id,
                                  isNew: false,
                                  isChild: true,
                                  row: child,
                              });
                          }
                      });
                  }
              });
              return rows;
          });

          const careerAddToggleLabel = computed(() =>
              careerExpandedId.value === '__new__' ? '收合新增' : '新增事件'
          );

          function careerParentTitle(row) {
              if (!row || row.careerTier !== 'child' || !row.parentId) return '';
              const p = (personalAdmin.careerTimelineRecords || []).find((r) => r.id === row.parentId);
              if (!p) return '';
              return String(p.title || '').trim() || '（無標題）';
          }
  
          const careerTimelineLayout = computed(() =>
              buildCareerTimelineLayout(personalAdmin.careerTimelineRecords)
          );
          const careerTimelineTicks = computed(() => {
              const L = careerTimelineLayout.value;
              return buildCareerTimelineTicks(L.minT, L.maxT);
          });
  
          const careerEventModal = reactive({
              editingId: null,
              isRange: false,
              careerTier: 'main',
              parentId: '',
              startRoc7: '',
              endRoc7: '',
              title: '',
              content: '',
              /** @type {{ url: string, name: string }[]} */
              attachments: [],
          });
  
          const careerMainSelectOptions = computed(() => {
              const ex = careerEventModal.editingId;
              return (personalAdmin.careerTimelineRecords || []).filter(
                  (r) => r.careerTier !== 'child' && r.id !== ex
              );
          });
  
          const careerModalFileInput = ref(null);
          const careerModalUploading = ref(false);
  
          const careerModalDurationPreview = computed(() => {
              const s = util.normalizeRocDate7(careerEventModal.startRoc7);
              const e = util.normalizeRocDate7(careerEventModal.endRoc7);
              const isoS = util.rocDate7ToIso(s);
              const isoE = util.rocDate7ToIso(e);
              if (!isoS || !isoE || isoS === isoE) return '';
              return formatCareerSpanPeriod(isoS, isoE) || '';
          });
  
          function careerRowDateLabel(row) {
              const iv = careerRowInterval(row);
              if (!iv) return '—';
              const rocS = util.isoToRocDate7(iv.isoS);
              if (iv.isPoint) return rocS || '—';
              const rocE = util.isoToRocDate7(iv.isoE);
              if (rocE && rocE !== rocS) return `${rocS} — ${rocE}`;
              return rocS || '—';
          }
  
          function careerRowPeriodLabel(row) {
              const iv = careerRowInterval(row);
              if (!iv) return '—';
              if (iv.isPoint) return '—';
              const p = formatCareerSpanPeriod(iv.isoS, iv.isoE);
              return p || '—';
          }
  
          function resetCareerEventModal() {
              careerEventModal.editingId = null;
              careerEventModal.isRange = false;
              careerEventModal.careerTier = 'main';
              careerEventModal.parentId = '';
              careerEventModal.startRoc7 = util.todayRocDate7();
              careerEventModal.endRoc7 = util.todayRocDate7();
              careerEventModal.title = '';
              careerEventModal.content = '';
              careerEventModal.attachments = [];
          }
  
          function expandCareerBranchForRow(row) {
              if (!row || row.careerTier !== 'child' || !row.parentId) return;
              careerBranchOpen[row.parentId] = true;
          }

          function loadCareerEventEditor(rowId) {
              const row = (personalAdmin.careerTimelineRecords || []).find((r) => r.id === rowId);
              if (!row) {
                  resetCareerEventModal();
                  return;
              }
              expandCareerBranchForRow(row);
              careerEventModal.editingId = row.id;
              careerEventModal.startRoc7 = util.normalizeRocDate7(row.startRoc7 || '') || util.todayRocDate7();
              const er = util.normalizeRocDate7(row.endRoc7 || '');
              const isoS = util.rocDate7ToIso(careerEventModal.startRoc7);
              const isoE = er.length === 7 && util.rocDate7ToIso(er) ? util.rocDate7ToIso(er) : '';
              careerEventModal.isRange = Boolean(isoE && isoS && isoE !== isoS);
              careerEventModal.endRoc7 = careerEventModal.isRange ? er : careerEventModal.startRoc7;
              careerEventModal.title = String(row.title || '');
              careerEventModal.content = String(row.content || '');
              careerEventModal.attachments = careerRowAttachments(row).map((a) => ({
                  url: a.url,
                  name: a.name,
              }));
              careerEventModal.careerTier = row.careerTier === 'child' ? 'child' : 'main';
              careerEventModal.parentId =
                  careerEventModal.careerTier === 'child'
                      ? String(row.parentId || '').trim()
                      : '';
          }

          function closeCareerEventEditor() {
              careerExpandedId.value = null;
              resetCareerEventModal();
          }

          function openCareerEventModal(rowId) {
              if (rowId == null) {
                  if (careerExpandedId.value === '__new__') {
                      closeCareerEventEditor();
                      return;
                  }
                  resetCareerEventModal();
                  careerExpandedId.value = '__new__';
                  return;
              }
              if (careerExpandedId.value === rowId) {
                  closeCareerEventEditor();
                  return;
              }
              loadCareerEventEditor(rowId);
              careerExpandedId.value = rowId;
          }

          function openCareerEventEditorFromLink(rowId) {
              if (!rowId) return;
              loadCareerEventEditor(rowId);
              careerExpandedId.value = rowId;
          }

          function deleteCareerEventFromModal() {
              const id = careerEventModal.editingId;
              if (!id) return;
              if (!confirm('確定刪除此事件？')) return;
              removeCareerTimelineRecord(id);
              closeCareerEventEditor();
          }
  
          function triggerCareerModalFilePick() {
              nextTick(() => {
                  if (careerModalFileInput.value) careerModalFileInput.value.click();
              });
          }
  
          async function onCareerModalFileChange(e) {
              const input = e.target;
              const files = input.files ? Array.from(input.files) : [];
              input.value = '';
              if (!files.length) return;
              careerModalUploading.value = true;
              try {
                  for (let i = 0; i < files.length; i += 1) {
                      const f = files[i];
                      if (!f || !f.size) continue;
                      const r = await apiService.uploadAttachment('career', f);
                      if (!r.success) {
                          alert(r.error || '上傳失敗（請確認已啟動本機伺服器）');
                          break;
                      }
                      const url = String(r.url || '').trim();
                      if (!url) continue;
                      const name = String(r.fileName || f.name || '').trim() || careerAttachmentLabelFromUrl(url);
                      careerEventModal.attachments.push({ url, name });
                  }
              } finally {
                  careerModalUploading.value = false;
              }
          }
  
          function removeCareerModalAttachment(idx) {
              if (idx < 0 || idx >= careerEventModal.attachments.length) return;
              careerEventModal.attachments.splice(idx, 1);
          }
  
          function submitCareerEventModal() {
              const title = String(careerEventModal.title || '').trim();
              if (!title) {
                  alert('請輸入標題');
                  return;
              }
              const sr = util.normalizeRocDate7(careerEventModal.startRoc7);
              const isoS = util.rocDate7ToIso(sr);
              if (sr.length !== 7 || !isoS) {
                  alert('請輸入正確起日（民國 7 碼）');
                  return;
              }
              const er = util.normalizeRocDate7(careerEventModal.endRoc7);
              const isoEt = util.rocDate7ToIso(er);
              if (er.length !== 7 || !isoEt) {
                  alert('請輸入正確迄日（民國 7 碼）');
                  return;
              }
              if (careerIsoAtNoonMs(isoEt) < careerIsoAtNoonMs(isoS)) {
                  alert('迄日不可早於起日');
                  return;
              }
              let isoE = isoS;
              let endRoc7 = '';
              if (isoEt !== isoS) {
                  isoE = isoEt;
                  endRoc7 = er;
              }
              careerEventModal.isRange = isoEt !== isoS;
              const period =
                  endRoc7 && isoE !== isoS ? formatCareerSpanPeriod(isoS, isoE) || '' : '';
              const tier = careerEventModal.careerTier === 'child' ? 'child' : 'main';
              let parentId = '';
              if (tier === 'child') {
                  parentId = String(careerEventModal.parentId || '').trim();
                  if (!parentId) {
                      alert('請選擇歸屬主事件');
                      return;
                  }
                  const par = (personalAdmin.careerTimelineRecords || []).find((r) => r.id === parentId);
                  if (!par || par.careerTier === 'child') {
                      alert('所選主事件無效，請重新選擇');
                      return;
                  }
                  if (careerEventModal.editingId && parentId === careerEventModal.editingId) {
                      alert('不可將事件歸屬於自己');
                      return;
                  }
              }
              const seenAtt = new Set();
              const careerAttachments = (careerEventModal.attachments || [])
                  .map((a) => {
                      const url = String(a.url || '').trim();
                      const rawName = String(a.name || '').trim();
                      return {
                          url,
                          name: rawName || (url ? careerAttachmentLabelFromUrl(url) : ''),
                      };
                  })
                  .filter((a) => {
                      if (!a.url || seenAtt.has(a.url)) return false;
                      seenAtt.add(a.url);
                      return true;
                  });
              const payload = {
                  title,
                  content: String(careerEventModal.content || '').trim(),
                  startRoc7: sr,
                  endRoc7,
                  period,
                  careerAttachments,
                  careerTier: tier,
                  parentId: tier === 'child' ? parentId : '',
              };
              if (careerEventModal.editingId) {
                  const row = (personalAdmin.careerTimelineRecords || []).find(
                      (r) => r.id === careerEventModal.editingId
                  );
                  if (row) {
                      Object.assign(row, payload);
                      delete row.attachmentUrl;
                      delete row.attachmentName;
                  }
              } else {
                  const row = emptyCareerTimelineRow();
                  Object.assign(row, payload);
                  delete row.attachmentUrl;
                  delete row.attachmentName;
                  if (!Array.isArray(personalAdmin.careerTimelineRecords)) {
                      personalAdmin.careerTimelineRecords = [];
                  }
                  personalAdmin.careerTimelineRecords.push(row);
              }
              sanitizeCareerTimelineLinks(personalAdmin.careerTimelineRecords);
              closeCareerEventEditor();
          }
  
          const attendanceOvertimeMonthMetrics = computed(() => {
              const month5 = attendanceMonthRoc5.value;
              const list = (personalAdmin.overtimeEntries || []).filter((e) => overtimeRowMonth5(e) === month5);
              let rh = 0;
              let ph = 0;
              list.forEach((e) => {
                  const h = Number(e.hours) || 0;
                  if (e.type === 'project') ph += h;
                  else rh += h;
              });
              return {
                  regular: { h: rh, m: 0 },
                  project: { h: ph, m: 0 },
                  total: { h: rh + ph, m: 0 },
              };
          });
  
          const attnDashOtLimitRegularNum = computed(() => Number(attendanceMonthLimit.regular || 0));
          const attnDashOtLimitProjectNum = computed(() => Number(attendanceMonthLimit.project || 0));
          const attnDashOtRegularRemaining = computed(() => {
              const cap = attnDashOtLimitRegularNum.value;
              if (!(cap > 0)) return null;
              return Math.max(0, cap - attendanceOvertimeMonthMetrics.value.regular.h);
          });
          const attnDashOtProjectRemaining = computed(() => {
              const cap = attnDashOtLimitProjectNum.value;
              if (!(cap > 0)) return null;
              return Math.max(0, cap - attendanceOvertimeMonthMetrics.value.project.h);
          });
          const attnDashOtLimitRegularDisplay = computed(() =>
              attnDashOtLimitRegularNum.value > 0 ? formatOvertimeHoursZh(attnDashOtLimitRegularNum.value) : '—'
          );
          const attnDashOtLimitProjectDisplay = computed(() =>
              attnDashOtLimitProjectNum.value > 0 ? formatOvertimeHoursZh(attnDashOtLimitProjectNum.value) : '—'
          );
          const attnDashOtRegularUsedDisplay = computed(() =>
              formatOvertimeHoursZh(attendanceOvertimeMonthMetrics.value.regular.h)
          );
          const attnDashOtProjectUsedDisplay = computed(() =>
              formatOvertimeHoursZh(attendanceOvertimeMonthMetrics.value.project.h)
          );
          const attnDashOtRegularRemainingDisplay = computed(() =>
              attnDashOtRegularRemaining.value === null ? '—' : formatOvertimeHoursZh(attnDashOtRegularRemaining.value)
          );
          const attnDashOtProjectRemainingDisplay = computed(() =>
              attnDashOtProjectRemaining.value === null ? '—' : formatOvertimeHoursZh(attnDashOtProjectRemaining.value)
          );
  
          /** 加班表單：依所選類型顯示當月尚可報時數（編輯時排除本筆已計入時數） */
          const attendanceOtModalRemaining = computed(() => {
              const isProject = attendanceOtModal.type === 'project';
              const cap = isProject ? attnDashOtLimitProjectNum.value : attnDashOtLimitRegularNum.value;
              if (!(cap > 0)) return null;
              const month5 = attendanceMonthRoc5.value;
              const totals = attendanceOtModal.editingId
                  ? sumOvertimeMonthByTypeExcluding(month5, attendanceOtModal.editingId)
                  : sumOvertimeMonthByType(month5);
              const used = isProject ? totals.project : totals.regular;
              return Math.max(0, cap - used);
          });
          const attendanceOtModalRemainingDisplay = computed(() =>
              attendanceOtModalRemaining.value === null ? '—' : formatOvertimeHoursZh(attendanceOtModalRemaining.value)
          );
  
          /** 差勤儀表板圓點：上限內一點一單位，超過 {@link ATTN_DASH_DOT_MAX} 則壓縮比例顯示 */
          const ATTN_DASH_DOT_COLS = 8;
          const ATTN_DASH_DOT_MAX = 72;
          function buildAttnDashDotSpec(usedRaw, capRaw) {
              const used = Math.max(0, Number(usedRaw) || 0);
              const cap = Number(capRaw) || 0;
              const cols = ATTN_DASH_DOT_COLS;
              if (!(cap > 0)) {
                  return { inactive: true, cols, flags: [] };
              }
              const totalCells = Math.min(ATTN_DASH_DOT_MAX, Math.max(1, Math.ceil(cap)));
              const filledCells = Math.min(totalCells, Math.round((used / cap) * totalCells));
              const flags = [];
              for (let i = 0; i < totalCells; i++) flags.push(i < filledCells);
              return { inactive: false, cols, flags, totalCells, filledCells };
          }
          const attnDashOtRegularDotSpec = computed(() =>
              buildAttnDashDotSpec(
                  attendanceOvertimeMonthMetrics.value.regular.h,
                  attnDashOtLimitRegularNum.value
              )
          );
          const attnDashOtProjectDotSpec = computed(() =>
              buildAttnDashDotSpec(
                  attendanceOvertimeMonthMetrics.value.project.h,
                  attnDashOtLimitProjectNum.value
              )
          );
          const attnDashLeaveDotSpec = computed(() =>
              buildAttnDashDotSpec(attendanceThisYearLeaveUsedDaysEq.value, attendanceDashLeaveQuotaNum.value)
          );
  
          function sumOvertimeMonthByType(month5) {
              const list = (personalAdmin.overtimeEntries || []).filter((e) => overtimeRowMonth5(e) === month5);
              return list.reduce(
                  (acc, e) => {
                      const h = Number(e.hours) || 0;
                      if (e.type === 'project') acc.project += h;
                      else acc.regular += h;
                      return acc;
                  },
                  { regular: 0, project: 0 }
              );
          }
  
          function sumOvertimeMonthByTypeExcluding(month5, excludeId) {
              return (personalAdmin.overtimeEntries || [])
                  .filter((e) => e.id !== excludeId && overtimeRowMonth5(e) === month5)
                  .reduce(
                      (acc, e) => {
                          const h = Number(e.hours) || 0;
                          if (e.type === 'project') acc.project += h;
                          else acc.regular += h;
                          return acc;
                      },
                      { regular: 0, project: 0 }
                  );
          }
  
          function validateMonthOvertimeLimits(month5, isProject, addDecimalHours, excludeEntryId) {
              const base =
                  excludeEntryId != null
                      ? sumOvertimeMonthByTypeExcluding(month5, excludeEntryId)
                      : sumOvertimeMonthByType(month5);
              const totals = { regular: base.regular, project: base.project };
              if (isProject) totals.project += addDecimalHours;
              else totals.regular += addDecimalHours;
              const totalH = totals.regular + totals.project;
              const limitRegular = Number(attendanceMonthLimit.regular || 0);
              const limitProject = Number(attendanceMonthLimit.project || 0);
              const limitTotal = Number(attendanceMonthLimitTotal.value || 0);
              if (limitRegular > 0 && totals.regular > limitRegular) {
                  alert(`本月一般加班上限超出：將達 ${totals.regular.toFixed(2)} h，限 ${limitRegular} h`);
                  return false;
              }
              if (limitProject > 0 && totals.project > limitProject) {
                  alert(`本月專案加班上限超出：將達 ${totals.project.toFixed(2)} h，限 ${limitProject} h`);
                  return false;
              }
              if (limitTotal > 0 && totalH > limitTotal) {
                  alert(`本月加班總上限超出：將達 ${totalH.toFixed(2)} h，限 ${limitTotal} h`);
                  return false;
              }
              return true;
          }
  
          function closeAttendanceOtModal() {
              attendanceOtModal.open = false;
              attendanceOtModal.editingId = null;
          }
  
          function openAttendanceOtModalAdd() {
              if (attendanceOtModal.open && !attendanceOtModal.editingId) {
                  closeAttendanceOtModal();
                  return;
              }
              closeAttendanceMonthLimitEditor();
              attendanceOtModal.editingId = null;
              attendanceOtModal.dateRoc = util.todayRocDate7();
              attendanceOtModal.type = 'regular';
              attendanceOtModal.startRocTime4 = '';
              attendanceOtModal.endRocTime4 = '';
              attendanceOtModal.note = '';
              attendanceOtModal.otDeclared = false;
              attendanceOtModal.open = true;
          }
  
          function deleteAttendanceOtFromModal() {
              const id = attendanceOtModal.editingId;
              if (!id || !confirm('確定刪除此筆加班紀錄？')) return;
              removeOvertimeEntry(id);
          }
  
          function deleteAttendanceLeaveFromModal() {
              const id = attendanceLeaveModal.editingId;
              if (!id || !confirm('確定刪除此筆休假紀錄？')) return;
              removeLeaveRecord(id);
          }
  
          function openAttendanceOtModalEdit(row) {
              const raw = (personalAdmin.overtimeEntries || []).find((x) => x.id === row.id);
              if (!raw) return;
              closeAttendanceMonthLimitEditor();
              attendanceOtModal.editingId = raw.id;
              attendanceOtModal.dateRoc = util.normalizeRocDate7(raw.dateRoc || '');
              attendanceOtModal.type = raw.type === 'project' ? 'project' : 'regular';
              attendanceOtModal.startRocTime4 = raw.startRocTime4 ? util.normalizeRocTime4(raw.startRocTime4) : '';
              attendanceOtModal.endRocTime4 = raw.endRocTime4 ? util.normalizeRocTime4(raw.endRocTime4) : '';
              attendanceOtModal.note = String(raw.note || '');
              attendanceOtModal.otDeclared = !!raw.otDeclared;
              attendanceOtModal.open = true;
          }
  
          function submitAttendanceOtModal() {
              const id = attendanceOtModal.editingId;
              const dr = util.normalizeRocDate7(attendanceOtModal.dateRoc);
              if (dr.length !== 7 || !util.rocDate7ToIso(dr)) {
                  alert('請輸入正確加班日期（民國 7 碼）');
                  return;
              }
              const month5 = String(dr).slice(0, 5);
              if (month5 !== attendanceMonthRoc5.value) {
                  alert(`加班日期需落在目前檢視月份：${attendanceMonthRoc5.value}`);
                  return;
              }
  
              const start4 = util.normalizeRocTime4(attendanceOtModal.startRocTime4);
              const end4 = util.normalizeRocTime4(attendanceOtModal.endRocTime4);
              if (start4.length !== 4 || end4.length !== 4) {
                  alert('請輸入起時/迄時（4 碼 HHMM，純數字）');
                  return;
              }
  
              const dur = computeDurationHHMM(start4, end4);
              if (!dur.hoursHHMM || dur.hoursDecimal <= 0) {
                  alert('請確認起迄時間，計算出的時數需大於 0');
                  return;
              }
  
              const isProject = attendanceOtModal.type === 'project';
              if (!validateMonthOvertimeLimits(month5, isProject, dur.hoursDecimal, id || null)) return;
  
              const payload = {
                  dateRoc: dr,
                  dateIso: util.rocDate7ToIso(dr),
                  type: isProject ? 'project' : 'regular',
                  startRocTime4: start4,
                  endRocTime4: end4,
                  hoursHHMM: dur.hoursHHMM,
                  hours: dur.hoursDecimal,
                  note: String(attendanceOtModal.note || '').trim(),
                  otDeclared: !!attendanceOtModal.otDeclared,
              };
  
              if (id) {
                  const idx = (personalAdmin.overtimeEntries || []).findIndex((x) => x.id === id);
                  if (idx >= 0) Object.assign(personalAdmin.overtimeEntries[idx], payload);
              } else {
                  personalAdmin.overtimeEntries.push({
                      id: 'AT_OT_' + Date.now() + '_' + Math.random().toString(16).slice(2),
                      ...payload,
                  });
              }
              closeAttendanceOtModal();
          }
  
          function closeAttendanceLeaveModal() {
              attendanceLeaveModal.open = false;
              attendanceLeaveModal.editingId = null;
          }
  
          function openAttendanceLeaveModalAdd() {
              if (attendanceLeaveModal.open && !attendanceLeaveModal.editingId) {
                  closeAttendanceLeaveModal();
                  return;
              }
              closeAttendanceLeaveYearSettingsEditor();
              attendanceLeaveModal.editingId = null;
              const ys = yearStartRoc7(attendanceLeaveYearRoc3.value);
              attendanceLeaveModal.startRoc7 = ys;
              attendanceLeaveModal.endRoc7 = ys;
              attendanceLeaveModal.leaveDaysDD = 0;
              attendanceLeaveModal.leaveHoursHH = 0;
              attendanceLeaveModal.leaveStartRocTime4 = '';
              attendanceLeaveModal.leaveEndRocTime4 = '';
              attendanceLeaveModal.proxyDivision = '';
              attendanceLeaveModal.note = '';
              attendanceLeaveModal.open = true;
          }
  
          function openAttendanceLeaveModalEdit(row) {
              const raw = (personalAdmin.leaveRecords || []).find((x) => x.id === row.id);
              if (!raw) return;
              closeAttendanceLeaveYearSettingsEditor();
              attendanceLeaveModal.editingId = raw.id;
              attendanceLeaveModal.startRoc7 = util.normalizeRocDate7(raw.startRoc7 || '');
              attendanceLeaveModal.endRoc7 = util.normalizeRocDate7(raw.endRoc7 || '');
              let edd = Number(raw.leaveDaysDD);
              if (!Number.isFinite(edd)) edd = leaveRecordDaysDD(raw);
              attendanceLeaveModal.leaveDaysDD = Math.max(0, edd);
              attendanceLeaveModal.leaveHoursHH = Number(raw.leaveHoursHH || 0);
              attendanceLeaveModal.leaveStartRocTime4 = raw.leaveStartRocTime4
                  ? util.normalizeRocTime4(raw.leaveStartRocTime4)
                  : '';
              attendanceLeaveModal.leaveEndRocTime4 = raw.leaveEndRocTime4 ? util.normalizeRocTime4(raw.leaveEndRocTime4) : '';
              attendanceLeaveModal.proxyDivision = String(raw.proxyDivision || '');
              attendanceLeaveModal.note = String(raw.note || '');
              attendanceLeaveModal.open = true;
          }
  
          function submitAttendanceLeaveModal() {
              const s7 = util.normalizeRocDate7(attendanceLeaveModal.startRoc7);
              const e7 = util.normalizeRocDate7(attendanceLeaveModal.endRoc7);
              if (s7.length !== 7 || e7.length !== 7 || !util.rocDate7ToIso(s7) || !util.rocDate7ToIso(e7)) {
                  alert('請輸入正確起迄日（民國 7 碼）');
                  return;
              }
              const startIso = util.rocDate7ToIso(s7);
              const endIso = util.rocDate7ToIso(e7);
              const draft = { startRoc7: s7, endRoc7: e7, startIso, endIso };
              if (!leaveOverlapsYear(draft, attendanceLeaveYearRoc3.value)) {
                  alert('休假起迄日需與目前檢視年度有交集');
                  return;
              }
  
              let ls = util.normalizeRocTime4(attendanceLeaveModal.leaveStartRocTime4 || '');
              let le = util.normalizeRocTime4(attendanceLeaveModal.leaveEndRocTime4 || '');
              if (s7 !== e7) {
                  ls = '';
                  le = '';
              }
  
              const dd = Math.max(0, Number(attendanceLeaveModal.leaveDaysDD) || 0);
              const hh = Number(attendanceLeaveModal.leaveHoursHH) || 0;
              const payload = {
                  startRoc7: s7,
                  endRoc7: e7,
                  startIso,
                  endIso,
                  leaveDaysDD: dd,
                  leaveHoursHH: hh,
                  leaveStartRocTime4: ls,
                  leaveEndRocTime4: le,
                  proxyDivision: String(attendanceLeaveModal.proxyDivision || '').trim(),
                  note: String(attendanceLeaveModal.note || '').trim(),
              };
  
              const id = attendanceLeaveModal.editingId;
              if (id) {
                  const idx = (personalAdmin.leaveRecords || []).findIndex((x) => x.id === id);
                  if (idx >= 0) {
                      const prev = personalAdmin.leaveRecords[idx];
                      Object.assign(prev, payload);
                      if (prev.kind == null || prev.kind === '') prev.kind = '休假';
                      if (prev.status == null) prev.status = '紀錄';
                  }
              } else {
                  personalAdmin.leaveRecords.push({
                      id: 'LV_' + Date.now(),
                      kind: '休假',
                      status: '紀錄',
                      ...payload,
                  });
              }
              closeAttendanceLeaveModal();
          }
  
          function shiftAttendanceMonth(delta) {
              const roc5 = attendanceMonthRoc5.value;
              const yyyyMm = util.rocMonth5ToYyyyMm(roc5);
              if (!yyyyMm) return;
              const d = new Date(`${yyyyMm}-01T12:00:00`);
              if (Number.isNaN(d.getTime())) return;
              d.setMonth(d.getMonth() + delta);
              const yyyyMm2 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              attendanceMonthRoc5.value = util.yyyyMmToRocMonth5(yyyyMm2);
          }
  
          function setAttendanceMonthToThis() {
              attendanceMonthRoc5.value = util.todayRocDate7().slice(0, 5);
          }
  
          function openAttendanceMonthPicker() {
              attendanceMonthPickerDraft.value = attendanceMonthRoc5.value;
              attendanceMonthPickerOpen.value = true;
          }
          function closeAttendanceMonthPicker() {
              attendanceMonthPickerOpen.value = false;
          }
          function applyAttendanceMonthPicker() {
              attendanceMonthRoc5.value = attendanceMonthPickerDraft.value;
              closeAttendanceMonthPicker();
          }
          function shiftAttendanceMonthPickerDraft(delta) {
              const roc5 = attendanceMonthPickerDraft.value;
              const yyyyMm = util.rocMonth5ToYyyyMm(roc5);
              if (!yyyyMm) return;
              const d = new Date(`${yyyyMm}-01T12:00:00`);
              if (Number.isNaN(d.getTime())) return;
              d.setMonth(d.getMonth() + delta);
              const yyyyMm2 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              attendanceMonthPickerDraft.value = util.yyyyMmToRocMonth5(yyyyMm2);
          }
          function setAttendanceMonthPickerDraftToThis() {
              attendanceMonthPickerDraft.value = util.todayRocDate7().slice(0, 5);
          }
  
          function openAttendanceLeaveYearPicker() {
              attendanceLeaveYearPickerDraft.value = String(attendanceLeaveYearRoc3.value || '')
                  .replace(/\D/g, '')
                  .slice(0, 3);
              attendanceLeaveYearPickerOpen.value = true;
          }
          function closeAttendanceLeaveYearPicker() {
              attendanceLeaveYearPickerOpen.value = false;
          }
          function applyAttendanceLeaveYearPicker() {
              const y = String(attendanceLeaveYearPickerDraft.value || '').replace(/\D/g, '').slice(0, 3);
              if (!y) {
                  closeAttendanceLeaveYearPicker();
                  return;
              }
              attendanceLeaveYearRoc3.value = y.padStart(3, '0').slice(0, 3);
              closeAttendanceLeaveYearPicker();
          }
          function shiftAttendanceLeaveYearPickerDraft(delta) {
              let y = parseInt(String(attendanceLeaveYearPickerDraft.value || '0').replace(/\D/g, '').slice(0, 3), 10);
              if (Number.isNaN(y)) y = 0;
              const next = Math.max(0, y + delta);
              attendanceLeaveYearPickerDraft.value = String(next).padStart(3, '0').slice(0, 3);
          }
          function setAttendanceLeaveYearPickerDraftToThis() {
              attendanceLeaveYearPickerDraft.value = util.todayRocDate7().slice(0, 3);
          }
          function onAttendanceLeaveYearPickerInput(ev) {
              attendanceLeaveYearPickerDraft.value = String(ev?.target?.value || '')
                  .replace(/\D/g, '')
                  .slice(0, 3);
          }
  
          function openAttendanceMonthLimitEditor() {
              if (attendanceMonthLimitEditorOpen.value) {
                  closeAttendanceMonthLimitEditor();
                  return;
              }
              closeAttendanceOtModal();
              attendanceMonthLimitDraft.regular = Number(attendanceMonthLimit.regular || 0);
              attendanceMonthLimitDraft.project = Number(attendanceMonthLimit.project || 0);
              attendanceMonthLimitDraft.note = String(attendanceMonthLimit.note ?? '');
              attendanceMonthLimitEditorOpen.value = true;
          }
          function closeAttendanceMonthLimitEditor() {
              attendanceMonthLimitEditorOpen.value = false;
          }
          function applyAttendanceMonthLimitEditor() {
              attendanceMonthLimit.regular = Number(attendanceMonthLimitDraft.regular || 0);
              attendanceMonthLimit.project = Number(attendanceMonthLimitDraft.project || 0);
              attendanceMonthLimit.note = String(attendanceMonthLimitDraft.note ?? '');
              closeAttendanceMonthLimitEditor();
          }
  
          function openAttendanceLeaveYearSettingsEditor() {
              if (attendanceLeaveYearSettingsEditorOpen.value) {
                  closeAttendanceLeaveYearSettingsEditor();
                  return;
              }
              closeAttendanceLeaveModal();
              attendanceLeaveYearSettingsDraft.quotaDays = attendanceLeaveYearPanel.quotaDays;
              attendanceLeaveYearSettingsDraft.mandatoryRestDays = attendanceLeaveYearPanel.mandatoryRestDays;
              attendanceLeaveYearSettingsDraft.mandatoryRestDateRoc7 = attendanceLeaveYearPanel.mandatoryRestDateRoc7;
              attendanceLeaveYearSettingsEditorOpen.value = true;
          }
          function closeAttendanceLeaveYearSettingsEditor() {
              attendanceLeaveYearSettingsEditorOpen.value = false;
          }
          function applyAttendanceLeaveYearSettingsEditor() {
              attendanceLeaveYearPanel.quotaDays = Math.max(0, Number(attendanceLeaveYearSettingsDraft.quotaDays) || 0);
              attendanceLeaveYearPanel.mandatoryRestDays = Math.max(
                  0,
                  Number(attendanceLeaveYearSettingsDraft.mandatoryRestDays) || 0
              );
              attendanceLeaveYearPanel.mandatoryRestDateRoc7 = util.normalizeRocDate7(
                  String(attendanceLeaveYearSettingsDraft.mandatoryRestDateRoc7 || '')
              );
              closeAttendanceLeaveYearSettingsEditor();
          }
  
          function shiftAttendanceLeaveYear(delta) {
              const y = parseInt(String(attendanceLeaveYearRoc3.value || '').slice(0, 3), 10);
              if (Number.isNaN(y)) return;
              const next = y + delta;
              attendanceLeaveYearRoc3.value = String(Math.max(0, next)).padStart(3, '0').slice(0, 3);
          }
  
          function setAttendanceLeaveYearToThis() {
              attendanceLeaveYearRoc3.value = util.todayRocDate7().slice(0, 3);
          }
  
          watch(attendanceLeaveYearRoc3, () => {
              closeAttendanceLeaveModal();
              closeAttendanceLeaveYearSettingsEditor();
              syncAttendanceLeaveYearPanelFromStore();
              const ys = yearStartRoc7(attendanceLeaveYearRoc3.value);
              attendanceLeaveModal.startRoc7 = ys;
              attendanceLeaveModal.endRoc7 = ys;
              attendanceLeaveModal.leaveDaysDD = 0;
              attendanceLeaveModal.leaveHoursHH = 0;
              attendanceLeaveModal.leaveStartRocTime4 = '';
              attendanceLeaveModal.leaveEndRocTime4 = '';
              attendanceLeaveModal.proxyDivision = '';
              attendanceLeaveModal.note = '';
          });
  
          watch(attendanceMonthRoc5, () => {
              closeAttendanceOtModal();
              closeAttendanceMonthLimitEditor();
              syncAttendanceMonthLimitFromStore();
              const t7 = util.todayRocDate7();
              const m5 = attendanceMonthRoc5.value;
              attendanceOtModal.dateRoc = t7.length === 7 && t7.slice(0, 5) === m5 ? t7 : monthStartRoc7(m5);
              attendanceOtModal.startRocTime4 = '';
              attendanceOtModal.endRocTime4 = '';
              attendanceOtModal.note = '';
              attendanceOtModal.otDeclared = false;
          });
  
          // 從 DB hydrate 後須把 store 灌回輸入框；否則畫面維持 0，一編輯會以 0 覆寫已載入的月上限
          watch(
              () => personalAdmin.attendanceOvertimeMonthLimits,
              () => {
                  syncAttendanceMonthLimitFromStore();
              },
              { deep: true }
          );
  
          watch(
              () => personalAdmin.attendanceLeaveYearSettings,
              () => {
                  syncAttendanceLeaveYearPanelFromStore();
              },
              { deep: true }
          );
  
          const events = reactive({ 
              weeklySchedule: [], 
              weekSpanBars: [],
              weekBodyGridRow: 2,
              weekRange: '',
              weekOffset: 0,
              scrollWeeks: [],
              monthRange: formatCalendarViewMonthLabel(0),
              calendarViewMonthOffset: 0,
              handleClick() {},
          });
  
          function isoDaysBetweenInclusive(isoStart, isoEnd) {
              if (!isoStart || !isoEnd) return [];
              const startTs = new Date(`${isoStart}T12:00:00`).getTime();
              const endTs = new Date(`${isoEnd}T12:00:00`).getTime();
              if (Number.isNaN(startTs) || Number.isNaN(endTs)) return [];
              const s = Math.min(startTs, endTs);
              const e = Math.max(startTs, endTs);
              const out = [];
              const msPerDay = 24 * 60 * 60 * 1000;
              const maxSpanDays = 380;
              for (let ts = s, i = 0; ts <= e && i < maxSpanDays; ts += msPerDay, i += 1) {
                  const d = new Date(ts);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  out.push(`${y}-${m}-${day}`);
              }
              return out;
          }
  
          function buildLinkedCalendarEvents() {
              const out = [];
              const push = (ev) => {
                  const d7 = util.normalizeRocDate7(ev && ev.dateRoc ? ev.dateRoc : '');
                  if (d7.length !== 7 || !util.rocDate7ToIso(d7)) return;
                  out.push({
                      id: ev.id || '',
                      dateRoc: d7,
                      time: ev.time || '',
                      title: ev.title || '（無標題）',
                      isCase: !!ev.isCase,
                      isLinked: true,
                      linkTarget: ev.linkTarget || null,
                  });
              };
  
              (allCases.value || [])
                  .filter((c) => String(c.workspaceId || 'WS_001') === String(currentWorkspace.value || 'WS_001'))
                  .forEach((c) => {
                      if (String(c.closeDate || '').trim()) return;
                      const d7 = util.nextProceedDateRoc7FromToday(c);
                      if (d7.length !== 7 || !util.rocDate7ToIso(d7)) return;
                      const caseNum = `${c.year || ''}${c.word || ''}${c.number || ''}` || String(c.id || '');
                      const reason = String(c.reason || '').trim();
                      push({
                          id: `CASE_${c.id || caseNum}`,
                          dateRoc: d7,
                          time: '',
                          title: `庭期・${caseNum}${reason ? `・${reason}` : ''}`,
                          isCase: true,
                          linkTarget: { view: 'cases' },
                      });
                  });
  
              (personalAdmin.overtimeEntries || []).forEach((row) => {
                  const kind = row.type === 'project' ? '專案加班' : '一般加班';
                  const hhmm = String(row.hoursHHMM || '');
                  const hoursTag = /^\d{4}$/.test(hhmm) ? `・${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}` : '';
                  push({
                      id: `OT_${row.id || ''}`,
                      dateRoc: row.dateRoc || row.dateIso || '',
                      time: util.normalizeRocTime4(row.startRocTime4 || ''),
                      title: `差勤・${kind}${hoursTag}`,
                      linkTarget: { view: 'admin', adminTab: 'attendance', kind: 'attendanceOt', id: row.id },
                  });
              });
  
              (personalAdmin.leaveRecords || []).forEach((row) => {
                  const s7 = util.toRocDate7FromAny(row.startRoc7 || row.startIso || '');
                  const e7 = util.toRocDate7FromAny(row.endRoc7 || row.endIso || '');
                  if (s7.length !== 7 || e7.length !== 7) return;
                  if (!util.rocDate7ToIso(s7) || !util.rocDate7ToIso(e7)) return;
                  out.push({
                      id: `LV_${row.id || ''}`,
                      dateRoc: s7,
                      startRoc7: s7,
                      endRoc7: e7,
                      time: '',
                      title: `差勤・休假${row.kind ? `・${row.kind}` : ''}`,
                      isLinked: true,
                      linkTarget: { view: 'admin', adminTab: 'attendance', kind: 'attendanceLeave', id: row.id },
                  });
              });

              (personalAdmin.trainingRecords || []).forEach((row) => {
                  const s7 = util.toRocDate7FromAny(row.startRoc7 || row.startIso || '');
                  const e7 = util.toRocDate7FromAny(row.endRoc7 || row.endIso || '') || s7;
                  if (s7.length !== 7 || e7.length !== 7) return;
                  if (!util.rocDate7ToIso(s7) || !util.rocDate7ToIso(e7)) return;
                  out.push({
                      id: `TR_${row.id || ''}`,
                      dateRoc: s7,
                      startRoc7: s7,
                      endRoc7: e7,
                      time: '',
                      title: `研習・${String(row.title || '（無標題）').trim() || '（無標題）'}`,
                      isLinked: true,
                      linkTarget: { view: 'admin', adminTab: 'training', kind: 'training', id: row.id },
                  });
              });

              return out;
          }
  
          let googleCalendarFetchGen = 0;
          const googleCalendarSettingsOpen = ref(false);
          const googleCalendarStatus = reactive({
              configured: false,
              connected: false,
              email: '',
              configSource: 'none',
              busy: false,
              syncing: false,
              lastFullSyncAt: '',
              lastDeltaSyncAt: '',
              lastError: '',
              message: '',
          });
          const googleCalendarOAuthDraft = reactive({
              clientId: '',
              clientSecret: '',
              redirectUri: '',
              tokenEncKey: '',
              hasClientSecret: false,
              hasTokenEncKey: false,
              source: 'none',
              saving: false,
          });

          async function loadGoogleCalendarStatus() {
              const data = await apiService.fetchGoogleCalendarStatus();
              googleCalendarStatus.configured = !!data?.configured;
              googleCalendarStatus.connected = !!data?.connected;
              googleCalendarStatus.email = String(data?.email || '').trim();
              googleCalendarStatus.configSource = String(data?.configSource || 'none');
              googleCalendarStatus.lastFullSyncAt = String(data?.lastFullSyncAt || '').trim();
              googleCalendarStatus.lastDeltaSyncAt = String(data?.lastDeltaSyncAt || '').trim();
              googleCalendarStatus.lastError = String(data?.lastError || '').trim();
          }

          function formatGoogleSyncAt(iso) {
              const raw = String(iso || '').trim();
              if (!raw) return '—';
              const d = new Date(raw);
              if (Number.isNaN(d.getTime())) return raw;
              return d.toLocaleString('zh-TW', {
                  hour12: false,
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
              });
          }

          async function loadGoogleCalendarOAuthConfig() {
              const data = await apiService.fetchGoogleCalendarOAuthConfig();
              if (!data) {
                  googleCalendarStatus.message =
                      '無法讀取 OAuth 設定，請確認後端服務已啟動且可從目前網域存取';
                  return;
              }
              googleCalendarOAuthDraft.clientId = String(data?.clientId || '').trim();
              googleCalendarOAuthDraft.redirectUri = String(
                  data?.redirectUri || data?.redirectUriDefault || ''
              ).trim();
              googleCalendarOAuthDraft.clientSecret = '';
              googleCalendarOAuthDraft.tokenEncKey = '';
              googleCalendarOAuthDraft.hasClientSecret = !!data?.hasClientSecret;
              googleCalendarOAuthDraft.hasTokenEncKey = !!data?.hasTokenEncKey;
              googleCalendarOAuthDraft.source = String(data?.source || 'none');
              await loadGoogleCalendarStatus();
          }

          async function saveGoogleCalendarOAuthConfig() {
              googleCalendarOAuthDraft.saving = true;
              googleCalendarStatus.message = '';
              try {
                  const payload = {
                      clientId: googleCalendarOAuthDraft.clientId.trim(),
                      redirectUri: googleCalendarOAuthDraft.redirectUri.trim(),
                  };
                  const sec = googleCalendarOAuthDraft.clientSecret.trim();
                  if (sec) payload.clientSecret = sec;
                  const tek = googleCalendarOAuthDraft.tokenEncKey.trim();
                  if (tek) payload.tokenEncKey = tek;
                  const data = await apiService.saveGoogleCalendarOAuthConfig(payload);
                  googleCalendarStatus.configured = !!data?.configured;
                  googleCalendarOAuthDraft.hasClientSecret = !!data?.hasClientSecret;
                  googleCalendarOAuthDraft.hasTokenEncKey = !!data?.hasTokenEncKey;
                  googleCalendarOAuthDraft.source = String(data?.source || 'db');
                  googleCalendarStatus.message = data?.configured
                      ? 'OAuth 設定已儲存。請在下方點「連結 Google 行事曆」完成授權，事件才會出現在週曆。'
                      : 'OAuth 設定已儲存，但尚未完整（請確認 Client ID／Secret）';
                  await loadGoogleCalendarOAuthConfig();
              } catch (e) {
                  googleCalendarStatus.message = String(e?.message || e);
              } finally {
                  googleCalendarOAuthDraft.saving = false;
              }
          }

          function connectGoogleCalendar() {
              if (!googleCalendarStatus.configured) {
                  googleCalendarStatus.message = '請先儲存 Client ID 與 Client Secret';
                  return;
              }
              window.location.href = apiService.getGoogleCalendarAuthUrl();
          }

          async function disconnectGoogleCalendar() {
              if (!window.confirm('確定中斷 Google 行事曆連結？本系統將不再顯示 Google 事件。')) return;
              googleCalendarStatus.busy = true;
              googleCalendarStatus.message = '';
              try {
                  await apiService.disconnectGoogleCalendar();
                  googleCalendarStatus.connected = false;
                  googleCalendarStatus.email = '';
                  await refreshCalendars();
              } catch (e) {
                  googleCalendarStatus.message = String(e?.message || e);
              } finally {
                  googleCalendarStatus.busy = false;
              }
          }

          async function syncGoogleCalendarNow() {
              googleCalendarStatus.syncing = true;
              googleCalendarStatus.message = '';
              try {
                  await apiService.syncGoogleCalendarNow();
                  await loadGoogleCalendarStatus();
                  await refreshCalendars();
                  googleCalendarStatus.message = 'Google 行事曆已完成同步';
              } catch (e) {
                  googleCalendarStatus.message = String(e?.message || e);
              } finally {
                  googleCalendarStatus.syncing = false;
              }
          }

          function handleGoogleCalendarReturnQuery() {
              try {
                  const q = new URLSearchParams(window.location.search);
                  const gcal = q.get('gcal');
                  if (!gcal) return;
                  if (gcal === 'connected') {
                      googleCalendarSettingsOpen.value = true;
                      googleCalendarStatus.message = 'Google 行事曆已連結';
                      loadGoogleCalendarStatus().then(() => refreshCalendars());
                  } else if (gcal === 'error') {
                      googleCalendarStatus.message = 'Google 行事曆授權失敗，請重試';
                  }
                  q.delete('gcal');
                  if (q.get('reason')) q.delete('reason');
                  const next = q.toString();
                  const path = window.location.pathname + (next ? `?${next}` : '');
                  window.history.replaceState({}, '', path);
              } catch (_) {
                  /* ignore */
              }
          }

          async function refreshCalendarWeek() {
              const linked = buildLinkedCalendarEvents();
              const off = events.weekOffset;
              const { days } = buildThisWeekSchedule(off);
              const years = [
                  ...new Set(
                      days
                          .map((d) => util.rocDate7ToIso(d.fullDate))
                          .filter(Boolean)
                          .map((iso) => parseInt(iso.slice(0, 4), 10))
                  ),
              ];
              await ensureTaiwanHolidaysForYears(years);
              syncCalendarWeek(personalAdmin, events, { linkedEvents: linked });
              if (!googleCalendarStatus.connected) return;
              const gen = ++googleCalendarFetchGen;
              const googleEvents = await apiService.fetchGoogleCalendarEvents(events.weekOffset);
              if (gen !== googleCalendarFetchGen) return;
              syncCalendarWeek(personalAdmin, events, { linkedEvents: [...linked, ...googleEvents] });
          }

          async function refreshCalendarScroll() {
              const linked = buildLinkedCalendarEvents();
              const { weeks: scrollWeeksBase } = buildContinuousCalendarSchedule({
                  monthRadius: CALENDAR_SCROLL_MONTH_RADIUS,
              });
              const years = [
                  ...new Set(
                      scrollWeeksBase
                          .flatMap((w) => w.days || [])
                          .map((d) => util.rocDate7ToIso(d.fullDate))
                          .filter(Boolean)
                          .map((iso) => parseInt(iso.slice(0, 4), 10))
                  ),
              ];
              await ensureTaiwanHolidaysForYears(years);

              let linkedEvents = linked;
              if (googleCalendarStatus.connected) {
                  const googleEvents = await apiService.fetchGoogleCalendarEventsForScroll(
                      CALENDAR_SCROLL_MONTH_RADIUS
                  );
                  linkedEvents = [...linked, ...googleEvents];
              }

              syncCalendarScroll(personalAdmin, events, {
                  linkedEvents,
                  scrollWeeksBase,
              });
              if (dashViewActive.value && shouldSnapCalendarToToday()) {
                  scheduleScrollCalendarToToday('auto');
              }
          }

          function shouldSnapCalendarToToday() {
              return calendarSnapPending || calendarShouldSnapToday;
          }

          function getCalendarScrollDowPad(container) {
              const dowRow = container?.querySelector('.dash-month-dow-row--sticky');
              return dowRow ? dowRow.offsetHeight : 0;
          }

          function getCalendarWeekScrollTop(container, row, dowPad) {
              const rowRect = row.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              return container.scrollTop + (rowRect.top - containerRect.top) - dowPad;
          }

          function isTodayWeekAtScrollTop() {
              const container = dashCalendarScrollRef.value;
              if (!container) return false;
              const idx = findTodayWeekIndex(events.scrollWeeks);
              if (idx < 0) return false;
              const row = container.querySelector(`[data-week-idx="${idx}"]`);
              if (!row) return false;
              const dowPad = getCalendarScrollDowPad(container);
              const targetTop = getCalendarWeekScrollTop(container, row, dowPad);
              return Math.abs(container.scrollTop - targetTop) < 10;
          }

          async function refreshCalendars() {
              await loadGoogleCalendarStatus();
              await Promise.all([refreshCalendarWeek(), refreshCalendarScroll()]);
          }

          function scrollCalendarToWeekIndex(weekIdx, behavior = 'auto') {
              const container = dashCalendarScrollRef.value;
              if (!container || weekIdx < 0) return false;
              const row = container.querySelector(`[data-week-idx="${weekIdx}"]`);
              if (!row) return false;
              const dowPad = getCalendarScrollDowPad(container);
              const top = Math.max(0, getCalendarWeekScrollTop(container, row, dowPad));
              calendarScrollFromNav = true;
              if (behavior === 'auto') {
                  container.scrollTop = top;
              } else {
                  container.scrollTo({ top, behavior });
              }
              window.setTimeout(() => {
                  calendarScrollFromNav = false;
              }, behavior === 'smooth' ? 420 : 60);
              return true;
          }

          function findTodayWeekIndexInScroll() {
              const byFlag = findTodayWeekIndex(events.scrollWeeks);
              if (byFlag >= 0) return byFlag;
              return findWeekIndexForRocDate(events.scrollWeeks, util.todayRocDate7());
          }

          function scrollCalendarToToday(behavior = 'auto') {
              events.calendarViewMonthOffset = 0;
              events.monthRange = formatCalendarViewMonthLabel(0);
              const idx = findTodayWeekIndexInScroll();
              if (idx < 0) return false;
              return scrollCalendarToWeekIndex(idx, behavior);
          }

          function scrollCalendarToRocDate(roc7, behavior = 'auto') {
              const idx = findWeekIndexForRocDate(events.scrollWeeks, roc7);
              if (idx < 0) return false;
              return scrollCalendarToWeekIndex(idx, behavior);
          }

          function scrollCalendarToMonthOffset(monthOffset, behavior = 'smooth') {
              calendarSnapPending = false;
              calendarShouldSnapToday = false;
              calendarUserScrolled = true;
              events.calendarViewMonthOffset = monthOffset;
              events.monthRange = formatCalendarViewMonthLabel(monthOffset);
              const ref = new Date();
              ref.setMonth(ref.getMonth() + monthOffset, 1);
              const pad = (n) => String(n).padStart(2, '0');
              const roc7 = util.isoToRocDate7(
                  `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-01`
              );
              scrollCalendarToRocDate(roc7, behavior);
          }

          function scheduleScrollCalendarToToday(behavior = 'auto') {
              const token = ++calendarTodayScrollToken;
              const tryScroll = (attemptsLeft) => {
                  if (token !== calendarTodayScrollToken) return;
                  nextTick(() => {
                      window.requestAnimationFrame(() => {
                          if (token !== calendarTodayScrollToken) return;
                          const container = dashCalendarScrollRef.value;
                          const idx = findTodayWeekIndexInScroll();
                          if (!container || idx < 0) {
                              if (attemptsLeft > 0) {
                                  window.setTimeout(() => tryScroll(attemptsLeft - 1), 80);
                              }
                              return;
                          }
                          scrollCalendarToToday(behavior);
                          window.requestAnimationFrame(() => {
                              if (token !== calendarTodayScrollToken) return;
                              if (isTodayWeekAtScrollTop()) {
                                  calendarSnapPending = false;
                                  calendarShouldSnapToday = false;
                                  return;
                              }
                              if (attemptsLeft > 0) {
                                  window.setTimeout(() => tryScroll(attemptsLeft - 1), 80);
                              }
                          });
                      });
                  });
              };
              tryScroll(16);
          }

          function isCalendarPastDay(day) {
              const r = util.normalizeRocDate7(day?.fullDate);
              const today = util.todayRocDate7();
              if (r.length !== 7 || today.length !== 7) return false;
              return r.localeCompare(today) < 0;
          }

          function onDashCalendarScroll() {
              if (calendarScrollFromNav) return;
              calendarUserScrolled = true;
              calendarSnapPending = false;
              if (calendarScrollRaf) window.cancelAnimationFrame(calendarScrollRaf);
              calendarScrollRaf = window.requestAnimationFrame(() => {
                  calendarScrollRaf = 0;
                  const container = dashCalendarScrollRef.value;
                  if (!container || !events.scrollWeeks.length) return;
                  const scrollTop = container.scrollTop;
                  const dowRow = container.querySelector('.dash-month-dow-row--sticky');
                  const dowPad = dowRow ? dowRow.offsetHeight : 0;
                  const rows = container.querySelectorAll('[data-week-idx]');
                  let topIdx = 0;
                  rows.forEach((row) => {
                      if (row.offsetTop <= scrollTop + dowPad + 6) {
                          topIdx = Number(row.dataset.weekIdx) || 0;
                      }
                  });
                  const week = events.scrollWeeks[topIdx];
                  const monday = week?.days?.[0];
                  if (!monday?.fullDate) return;
                  const iso = util.rocDate7ToIso(monday.fullDate);
                  if (!iso) return;
                  const d = new Date(`${iso}T12:00:00`);
                  if (Number.isNaN(d.getTime())) return;
                  const today = new Date();
                  const off =
                      (d.getFullYear() - today.getFullYear()) * 12 +
                      (d.getMonth() - today.getMonth());
                  if (off !== events.calendarViewMonthOffset) {
                      events.calendarViewMonthOffset = off;
                      events.monthRange = formatCalendarViewMonthLabel(off);
                  }
              });
          }

          function openLinkedCalendarTarget(target) {
              if (!target || typeof target !== 'object') return;
              if (target.adminTab) adminActiveTab.value = target.adminTab;
              if (target.view) switchView(target.view);
              setTimeout(() => {
                  if (target.kind === 'attendanceOt' && target.id) {
                      const row = (personalAdmin.overtimeEntries || []).find((x) => x.id === target.id);
                      if (row) openAttendanceOtModalEdit(row);
                      return;
                  }
                  if (target.kind === 'attendanceLeave' && target.id) {
                      const row = (personalAdmin.leaveRecords || []).find((x) => x.id === target.id);
                      if (row) openAttendanceLeaveModalEdit(row);
                      return;
                  }
                  if (target.kind === 'training' && target.id) {
                      openTrainingRecordEditorFromLink(target.id);
                      return;
                  }
                  if (target.kind === 'career' && target.id) {
                      openCareerEventEditorFromLink(target.id);
                  }
              }, 220);
          }
  
          events.handleClick = (ev) => {
              if (!ev || !ev.isLinked) return;
              const external = ev.linkTarget && ev.linkTarget.externalUrl;
              if (external) {
                  window.open(String(external), '_blank', 'noopener,noreferrer');
                  return;
              }
              openLinkedCalendarTarget(ev.linkTarget);
          };
  
          function shiftWeek(delta) {
              events.weekOffset += delta;
              refreshCalendarWeek();
          }

          function shiftCalendarMonth(delta) {
              scrollCalendarToMonthOffset(events.calendarViewMonthOffset + delta);
          }
  
          function goToThisWeek() {
              events.weekOffset = 0;
              refreshCalendarWeek();
          }

          function goToCalendarToday() {
              calendarUserScrolled = false;
              calendarSnapPending = true;
              calendarShouldSnapToday = true;
              scrollCalendarToToday('smooth');
          }
  
          const eventModal = reactive({
              open: false,
              dateRoc: '',
              endRoc7: '',
              time: '',
              title: '',
          });
  
          function addPersonalTodo() {
              const t = personalAdmin.todoDraft.trim();
              if (!t) return;
              personalAdmin.todos.unshift({ id: Date.now(), text: t, done: false });
              personalAdmin.todoDraft = '';
          }
  
          function togglePersonalTodoDone(id) {
              const row = personalAdmin.todos.find((x) => x.id === id);
              if (!row) return;
              row.done = !row.done;
          }
  
          function removePersonalTodo(id) {
              personalAdmin.todos = personalAdmin.todos.filter((x) => x.id !== id);
          }
  
          function movePersonalTodo(dragId, targetId) {
              if (dragId == null || targetId == null || dragId === targetId) return;
              const fromIdx = personalAdmin.todos.findIndex((x) => x.id === dragId);
              const toIdx = personalAdmin.todos.findIndex((x) => x.id === targetId);
              if (fromIdx < 0 || toIdx < 0) return;
              const next = personalAdmin.todos.slice();
              const [moved] = next.splice(fromIdx, 1);
              next.splice(toIdx, 0, moved);
              personalAdmin.todos = next;
          }
  
          function onTodoDragStart(id, ev) {
              todoDraggingId.value = id;
              todoDragOverId.value = id;
              if (ev && ev.dataTransfer) {
                  ev.dataTransfer.effectAllowed = 'move';
                  ev.dataTransfer.setData('text/plain', String(id));
              }
          }
  
          function onTodoDragOver(id, ev) {
              if (todoDraggingId.value == null || todoDraggingId.value === id) return;
              if (ev) ev.preventDefault();
              todoDragOverId.value = id;
              if (ev && ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
          }
  
          function onTodoDrop(id, ev) {
              if (ev) ev.preventDefault();
              movePersonalTodo(todoDraggingId.value, id);
              todoDragOverId.value = null;
          }
  
          function onTodoDragEnd() {
              todoDraggingId.value = null;
              todoDragOverId.value = null;
          }
  
          function submitOvertimeForm() {
              const h = Number(personalAdmin.otDraft.hours);
              const dr = util.normalizeRocDate7(personalAdmin.otDraft.dateRoc);
              if (dr.length !== 7 || !util.rocDate7ToIso(dr) || h <= 0) {
                  alert('請輸入正確民國日期（7 碼，如 1150320）並輸入大於 0 的時數');
                  return;
              }
              personalAdmin.overtimeEntries.unshift({
                  id: 'OT_' + Date.now(),
                  dateRoc: dr,
                  dateIso: util.rocDate7ToIso(dr),
                  type: personalAdmin.otDraft.type === 'project' ? 'project' : 'regular',
                  hours: h,
                  note: (personalAdmin.otDraft.note || '').trim(),
                  otDeclared: false,
              });
              personalAdmin.otDraft = { dateRoc: util.todayRocDate7(), type: 'regular', hours: 0, note: '' };
          }
  
          function removeOvertimeEntry(id) {
              personalAdmin.overtimeEntries = personalAdmin.overtimeEntries.filter((x) => x.id !== id);
              if (attendanceOtModal.editingId === id) closeAttendanceOtModal();
          }
  
          function submitLeaveForm() {
              const a = util.normalizeRocDate7(personalAdmin.leaveDraft.startRoc7);
              const b = util.normalizeRocDate7(personalAdmin.leaveDraft.endRoc7);
              if (a.length !== 7 || b.length !== 7 || !util.rocDate7ToIso(a) || !util.rocDate7ToIso(b)) {
                  alert('請輸入正確起迄日（民國 7 碼）');
                  return;
              }
              const dd = Math.max(0, Number(personalAdmin.leaveDraft.leaveDaysDD) || 0);
              const hh = Number(personalAdmin.leaveDraft.leaveHoursHH) || 0;
              personalAdmin.leaveRecords.push({
                  id: 'LV_' + Date.now(),
                  kind: personalAdmin.leaveDraft.kind || '事假',
                  startRoc7: a,
                  endRoc7: b,
                  startIso: util.rocDate7ToIso(a),
                  endIso: util.rocDate7ToIso(b),
                  leaveDaysDD: dd,
                  leaveHoursHH: hh,
                  proxyDivision: '',
                  note: (personalAdmin.leaveDraft.note || '').trim(),
                  status: '紀錄',
              });
              const t7 = util.todayRocDate7();
              personalAdmin.leaveDraft = {
                  kind: '事假',
                  startRoc7: t7,
                  endRoc7: t7,
                  leaveDaysDD: 0,
                  leaveHoursHH: 0,
                  note: '',
              };
          }
  
          function removeLeaveRecord(id) {
              personalAdmin.leaveRecords = personalAdmin.leaveRecords.filter((x) => x.id !== id);
              if (attendanceLeaveModal.editingId === id) closeAttendanceLeaveModal();
          }
  
          function clonePayscaleNewTableTemplate() {
              return PAYSCALE_NEW_FORM_GRADE_POINTS.map((r) => ({
                  grade: r.grade,
                  points: r.points,
                  basic: '',
                  professional: '',
                  job: '',
              }));
          }
          function clonePayscaleApiRowsForEdit(rows) {
              if (!Array.isArray(rows) || rows.length !== 24) return [];
              return rows.map((r) => ({
                  grade: r.grade,
                  points: r.points,
                  basic: util.formatMoney(r.basic),
                  professional: util.formatMoney(r.professional),
                  job: util.formatMoney(r.job),
              }));
          }
          const payscaleVersionCollapsed = reactive({});
          const payscaleVersionPanels = reactive({});
          let payscaleVersionCollapseInited = false;

          function payscaleVersionKey(versionId) {
              return String(versionId || '');
          }

          function isPayscaleVersionCollapsed(versionId) {
              return payscaleVersionCollapsed[payscaleVersionKey(versionId)] === true;
          }

          function setPayscaleVersionCollapsed(versionId, collapsed) {
              payscaleVersionCollapsed[payscaleVersionKey(versionId)] = collapsed;
          }

          function getPayscaleVersionPanel(versionId) {
              return payscaleVersionPanels[payscaleVersionKey(versionId)] || null;
          }

          function syncPayscaleVersionCollapseKeys(defaultCollapsed = true) {
              (payscaleHistoryVersionGroups.value || []).forEach((g) => {
                  const key = payscaleVersionKey(g.versionId);
                  if (payscaleVersionCollapsed[key] === undefined) {
                      payscaleVersionCollapsed[key] = defaultCollapsed;
                  }
              });
          }

          function prunePayscaleVersionPanels() {
              const valid = new Set(
                  (payscaleHistoryVersionGroups.value || []).map((g) => payscaleVersionKey(g.versionId))
              );
              Object.keys(payscaleVersionPanels).forEach((key) => {
                  if (!valid.has(key)) delete payscaleVersionPanels[key];
              });
          }

          async function ensurePayscaleVersionPanel(versionId) {
              const key = payscaleVersionKey(versionId);
              if (!key) return null;
              const cur = payscaleVersionPanels[key];
              if (cur?.rows?.length === 24 && !cur.loading) return cur;
              if (cur?.loading) return cur;

              payscaleVersionPanels[key] = {
                  detail: null,
                  effectiveRoc7: '',
                  rows: [],
                  loading: true,
                  loadError: '',
              };
              try {
                  const data = await apiService.fetchPayscaleVersionById(versionId);
                  if (!data || !data.rows) {
                      throw new Error('無法讀取該俸表');
                  }
                  const editRows = clonePayscaleApiRowsForEdit(data.rows);
                  if (editRows.length !== 24) {
                      throw new Error('俸表資料不完整');
                  }
                  payscaleVersionPanels[key] = {
                      detail: data,
                      effectiveRoc7: data.effectiveRoc7 || '',
                      rows: editRows,
                      loading: false,
                      loadError: '',
                  };
              } catch (e) {
                  payscaleVersionPanels[key] = {
                      detail: null,
                      effectiveRoc7: '',
                      rows: [],
                      loading: false,
                      loadError: e.message || String(e),
                  };
              }
              return payscaleVersionPanels[key];
          }
          const payscaleNewTableRows = ref(clonePayscaleNewTableTemplate());
  
          const payscaleApiLatest = ref(null);
          const payscaleDataVersions = ref([]);
          const payscaleExpandedId = ref(null);
          const payscaleHistoryModalDetail = ref(null);
          const payscaleHistoryEditDraft = reactive({ effectiveRoc7: '' });
          const payscaleHistoryEditRows = ref([]);
          const payscaleHistoryBusy = ref(false);
          const payscaleNewDraft = reactive({ effectiveRoc7: PAYSCALE_BUILTIN_EFFECTIVE_ROC7 });
          const payscaleNewBusy = ref(false);
          const payscaleChartCanvas = ref(null);
  
          const payscaleMergedRows = computed(() => {
              const api = payscaleApiLatest.value;
              /** 資料庫已有正式 24 級時，圖表以 DB 為準（勿再疊 personalAdmin 預填覆寫，否則永遠顯示舊範本） */
              if (api && api.rows && api.rows.length === 24) {
                  return api.rows.map((r) => ({
                      grade: r.grade,
                      points: Number(r.points),
                      basic: Number(r.basic),
                      professional: Number(r.professional),
                      job: Number(r.job),
                  }));
              }
              const baseRows = PAYSCALE_BUILTIN_ROWS.map((r) => ({
                  grade: r.grade,
                  points: r.points,
                  basic: r.basic,
                  professional: r.professional,
                  job: r.job,
              }));
              const ov = personalAdmin.payscaleRowOverrides || {};
              return baseRows.map((r) => {
                  const o = ov[String(r.grade)];
                  if (!o) {
                      return {
                          grade: r.grade,
                          points: Number(r.points),
                          basic: Number(r.basic),
                          professional: Number(r.professional),
                          job: Number(r.job),
                      };
                  }
                  return {
                      grade: r.grade,
                      points: Math.round(Number(o.points)) || Number(r.points),
                      basic: util.parseMoney(o.basic) || Number(r.basic),
                      professional: util.parseMoney(o.professional) || Number(r.professional),
                      job: util.parseMoney(o.job) || Number(r.job),
                  };
              });
          });
  
          const payscaleChartEffectiveLabel = computed(() => {
              const x = payscaleApiLatest.value;
              if (x && x.effectiveRoc7) return util.formatDateDisplay(x.effectiveRoc7);
              return '內建基準（離線或尚未同步資料庫俸表）';
          });
  
          /** 圖表右上角：民國 7 碼 + 起適用；無 DB 時為內建示意 */
          const payscaleChartEffectiveRoc7Line = computed(() => {
              const x = payscaleApiLatest.value;
              const raw = x && x.effectiveRoc7 ? String(x.effectiveRoc7).replace(/\D/g, '').slice(0, 7) : '';
              if (raw.length === 7) return `${raw}起適用`;
              return `${PAYSCALE_BUILTIN_EFFECTIVE_ROC7}起適用（內建示意）`;
          });
  
          const payscaleTabActive = computed(() => adminActiveTab.value === 'payscale');

          usePayscaleChart({
              canvasRef: payscaleChartCanvas,
              rowsRef: payscaleMergedRows,
              getMyGrade: () => Number(personalAdmin.payscaleMyGrade) || 0,
              setMyGrade: (g) => {
                  personalAdmin.payscaleMyGrade = g;
              },
              formatMoney: (n) => util.formatMoney(n),
              isActiveRef: payscaleTabActive,
          });

          function payscaleIsCurrentPayscaleVersion(vid) {
              const latest = payscaleApiLatest.value;
              return !!(latest && latest.id && String(latest.id) === String(vid));
          }
  
          async function refreshPayscaleDataFromApi() {
              if (!isDbConnected.value) return;
              try {
                  payscaleApiLatest.value = await apiService.fetchPayscaleLatest();
              } catch {
                  payscaleApiLatest.value = null;
              }
              try {
                  payscaleDataVersions.value = await apiService.fetchPayscaleVersions();
              } catch {
                  payscaleDataVersions.value = [];
              }
              prunePayscaleVersionPanels();
              syncPayscaleVersionCollapseKeys(true);
          }
  
          const payscaleHistoryVersionGroups = computed(() => {
              const list = [...(payscaleDataVersions.value || [])];
              list.sort(
                  (a, b) =>
                      payscaleEffectiveRoc7ToNum(a.effectiveRoc7) - payscaleEffectiveRoc7ToNum(b.effectiveRoc7)
              );
              return list.map((version) => ({
                  version,
                  versionId: version.id,
                  bandLabel: `${util.formatDateDisplay(version.effectiveRoc7)} 起施行`,
                  isCurrent: payscaleIsCurrentPayscaleVersion(version.id),
              }));
          });

          async function openPayscaleHistoryEditor(id) {
              if (!id || id === '__new__') return;
              setPayscaleVersionCollapsed(id, false);
              await ensurePayscaleVersionPanel(id);
          }

          async function togglePayscaleVersionSection(versionId) {
              if (isPayscaleVersionCollapsed(versionId)) {
                  setPayscaleVersionCollapsed(versionId, false);
                  await ensurePayscaleVersionPanel(versionId);
                  return;
              }
              setPayscaleVersionCollapsed(versionId, true);
          }

          const payscaleAllVersionsCollapsed = computed(() => {
              const groups = payscaleHistoryVersionGroups.value || [];
              return groups.length > 0 && groups.every((g) => isPayscaleVersionCollapsed(g.versionId));
          });

          async function toggleAllPayscaleVersionSections() {
              const groups = payscaleHistoryVersionGroups.value || [];
              if (!groups.length) return;
              if (payscaleAllVersionsCollapsed.value) {
                  groups.forEach((g) => {
                      setPayscaleVersionCollapsed(g.versionId, false);
                  });
                  await Promise.all(groups.map((g) => ensurePayscaleVersionPanel(g.versionId)));
                  return;
              }
              groups.forEach((g) => {
                  setPayscaleVersionCollapsed(g.versionId, true);
              });
          }

          function collapseAllPayscaleVersions() {
              const groups = payscaleHistoryVersionGroups.value || [];
              groups.forEach((g) => {
                  setPayscaleVersionCollapsed(g.versionId, true);
              });
          }

          async function collapsePriorPayscaleVersions() {
              const groups = payscaleHistoryVersionGroups.value || [];
              if (!groups.length) return;
              const newest = groups[groups.length - 1].versionId;
              groups.forEach((g) => {
                  setPayscaleVersionCollapsed(g.versionId, g.versionId !== newest);
              });
              await ensurePayscaleVersionPanel(newest);
          }

          function cancelPayscaleVersionEdit(versionId) {
              setPayscaleVersionCollapsed(versionId, true);
          }

          const payscaleNewToggleLabel = computed(() =>
              payscaleExpandedId.value === '__new__' ? '收合新增' : '新增俸表'
          );

          function closePayscaleEditor() {
              payscaleExpandedId.value = null;
          }

          function togglePayscaleNewEditor() {
              if (payscaleExpandedId.value === '__new__') {
                  closePayscaleEditor();
                  return;
              }
              (payscaleHistoryVersionGroups.value || []).forEach((g) => {
                  setPayscaleVersionCollapsed(g.versionId, true);
              });
              payscaleNewDraft.effectiveRoc7 = util.todayRocDate7();
              payscaleNewTableRows.value = clonePayscaleNewTableTemplate();
              payscaleExpandedId.value = '__new__';
          }
  
          async function submitPayscaleNewVersion() {
              const eff = util.normalizeRocDate7(payscaleNewDraft.effectiveRoc7);
              if (eff.length !== 7 || !util.rocDate7ToIso(eff)) {
                  alert('請輸入正確俸表施行日期（民國連續 7 碼）');
                  return;
              }
              const rowsPayload = [];
              for (const tr of payscaleNewTableRows.value) {
                  const g = Number(tr.grade);
                  const points = Math.round(Number(tr.points));
                  const basic = Math.round(util.parseMoney(tr.basic));
                  const professional = Math.round(util.parseMoney(tr.professional));
                  const job = Math.round(util.parseMoney(tr.job));
                  if (!Number.isInteger(g) || g < 1 || g > 24) {
                      alert('俸級資料異常');
                      return;
                  }
                  if (![points, basic, professional, job].every((n) => Number.isFinite(n) && n >= 0)) {
                      alert(`第 ${g} 級數值無效，請檢查俸點與三項金額`);
                      return;
                  }
                  rowsPayload.push({ grade: g, points, basic, professional, job });
              }
              if (rowsPayload.length !== 24) {
                  alert('俸表須完整 24 級');
                  return;
              }
              payscaleNewBusy.value = true;
              try {
                  await apiService.createPayscaleVersion({ effectiveRoc7: eff, rows: rowsPayload });
                  await refreshPayscaleDataFromApi();
                  closePayscaleEditor();
              } catch (e) {
                  alert(e.message || String(e));
              } finally {
                  payscaleNewBusy.value = false;
              }
          }
  
          async function togglePayscaleHistoryEditor(id) {
              if (!id) return;
              if (isPayscaleVersionCollapsed(id) && getPayscaleVersionPanel(id)?.rows?.length === 24) {
                  setPayscaleVersionCollapsed(id, true);
                  return;
              }
              await openPayscaleHistoryEditor(id);
          }
  
          async function submitPayscaleHistoryUpdate(versionId) {
              const panel = getPayscaleVersionPanel(versionId);
              if (!panel?.detail?.id) return;
              const eff = util.normalizeRocDate7(panel.effectiveRoc7);
              if (eff.length !== 7 || !util.rocDate7ToIso(eff)) {
                  alert('請輸入正確俸表施行日期（民國連續 7 碼）');
                  return;
              }
              const rowsPayload = [];
              for (const tr of panel.rows) {
                  const g = Number(tr.grade);
                  const points = Math.round(Number(tr.points));
                  const basic = Math.round(util.parseMoney(tr.basic));
                  const professional = Math.round(util.parseMoney(tr.professional));
                  const job = Math.round(util.parseMoney(tr.job));
                  if (!Number.isInteger(g) || g < 1 || g > 24) {
                      alert('俸級資料異常');
                      return;
                  }
                  if (![points, basic, professional, job].every((n) => Number.isFinite(n) && n >= 0)) {
                      alert(`第 ${g} 級數值無效，請檢查俸點與三項金額`);
                      return;
                  }
                  rowsPayload.push({ grade: g, points, basic, professional, job });
              }
              if (rowsPayload.length !== 24) {
                  alert('俸表須完整 24 級');
                  return;
              }
              payscaleHistoryBusy.value = true;
              try {
                  const updated = await apiService.updatePayscaleVersion(panel.detail.id, {
                      effectiveRoc7: eff,
                      rows: rowsPayload,
                  });
                  if (updated && updated.rows) {
                      panel.detail = updated;
                      panel.effectiveRoc7 = updated.effectiveRoc7 || eff;
                      panel.rows = clonePayscaleApiRowsForEdit(updated.rows);
                  }
                  await refreshPayscaleDataFromApi();
              } catch (e) {
                  alert(e.message || String(e));
              } finally {
                  payscaleHistoryBusy.value = false;
              }
          }
  
          async function deletePayscaleHistoryVersion(versionId) {
              const panel = getPayscaleVersionPanel(versionId);
              if (!panel?.detail?.id) return;
              if (
                  !confirm(
                      '確定刪除此俸表？刪除後圖表改以資料庫剩餘版本中施行日最新者為準；若已無任何版本將顯示內建示意。'
                  )
              ) {
                  return;
              }
              payscaleHistoryBusy.value = true;
              try {
                  await apiService.deletePayscaleVersion(panel.detail.id);
                  delete payscaleVersionPanels[payscaleVersionKey(versionId)];
                  await refreshPayscaleDataFromApi();
              } catch (e) {
                  alert(e.message || String(e));
              } finally {
                  payscaleHistoryBusy.value = false;
              }
          }
  
          watch(adminActiveTab, async (t) => {
              if (t !== 'payscale') return;
              await refreshPayscaleDataFromApi();
              if (!payscaleVersionCollapseInited) {
                  collapseAllPayscaleVersions();
                  payscaleVersionCollapseInited = true;
              } else {
                  syncPayscaleVersionCollapseKeys(true);
              }
          });
  
          function payscaleClearMyGradeMark() {
              personalAdmin.payscaleMyGrade = 0;
          }
  
          const UPLOADS_PUBLIC_ORIGIN =
              window.location.origin;
  
          function resolveUploadUrl(rel) {
              if (!rel || typeof rel !== 'string') return '';
              if (/^https?:\/\//i.test(rel)) return rel;
              const p = rel.startsWith('/') ? rel : `/${rel}`;
              return UPLOADS_PUBLIC_ORIGIN + p;
          }
  
          function resetTrainingRecordModal() {
              trainingRecordModal.editingId = null;
              const t = util.todayRocDate7();
              trainingRecordModal.title = '';
              trainingRecordModal.startRoc7 = t;
              trainingRecordModal.endRoc7 = t;
              trainingRecordModal.isOnline = true;
              trainingRecordModal.venue = '法官學院';
              trainingRecordModal.hours = '';
              trainingRecordModal.attachments = [];
          }
  
          function loadTrainingRecordEditor(rowId) {
              if (rowId == null) {
                  resetTrainingRecordModal();
                  return;
              }
              const raw = (personalAdmin.trainingRecords || []).find((x) => x.id === rowId);
              if (!raw) {
                  resetTrainingRecordModal();
                  return;
              }
              trainingRecordModal.editingId = raw.id;
              trainingRecordModal.title = String(raw.title || '');
              trainingRecordModal.startRoc7 = util.normalizeRocDate7(raw.startRoc7 || '') || util.todayRocDate7();
              trainingRecordModal.endRoc7 = util.normalizeRocDate7(raw.endRoc7 || '') || trainingRecordModal.startRoc7;
              trainingRecordModal.isOnline = raw.isOnline !== false;
              trainingRecordModal.venue = String(raw.venue || '').trim() || '法官學院';
              trainingRecordModal.hours = String(raw.hours || '');
              if (Array.isArray(raw.trainingAttachments) && raw.trainingAttachments.length) {
                  trainingRecordModal.attachments = raw.trainingAttachments
                      .map((a) => ({
                          url: String(a && a.url != null ? a.url : '').trim(),
                          name: String(a && a.name != null ? a.name : '').trim(),
                      }))
                      .filter((a) => a.url);
              } else {
                  const u = String(raw.attachmentUrl || '').trim();
                  trainingRecordModal.attachments = u
                      ? [{ url: u, name: String(raw.attachmentName || '').trim() || '附件' }]
                      : [];
              }
          }

          function closeTrainingRecordEditor() {
              trainingExpandedId.value = null;
              resetTrainingRecordModal();
          }

          function openTrainingRecordEditor(rowId) {
              if (rowId == null) {
                  if (trainingExpandedId.value === '__new__') {
                      closeTrainingRecordEditor();
                      return;
                  }
                  resetTrainingRecordModal();
                  trainingExpandedId.value = '__new__';
                  return;
              }
              if (trainingExpandedId.value === rowId) {
                  closeTrainingRecordEditor();
                  return;
              }
              loadTrainingRecordEditor(rowId);
              trainingExpandedId.value = rowId;
          }

          function openTrainingRecordEditorFromLink(rowId) {
              if (!rowId) return;
              loadTrainingRecordEditor(rowId);
              trainingExpandedId.value = rowId;
          }
  
          watch(
              () => trainingRecordModal.isOnline,
              (isOnline) => {
                  if (!isOnline && !String(trainingRecordModal.venue || '').trim()) {
                      trainingRecordModal.venue = '法官學院';
                  }
              }
          );
  
          function triggerTrainingModalFilePick() {
              nextTick(() => {
                  if (trainingModalFileInput.value) trainingModalFileInput.value.click();
              });
          }
  
          async function onTrainingModalFileChange(e) {
              const input = e.target;
              const files = input.files ? Array.from(input.files) : [];
              input.value = '';
              if (!files.length) return;
              trainingModalUploading.value = true;
              try {
                  for (let i = 0; i < files.length; i++) {
                      const f = files[i];
                      try {
                          const r = await apiService.uploadAttachment('training', f);
                          if (!r.success) {
                              alert(r.error || '上傳失敗（請確認已啟動本機伺服器）');
                              continue;
                          }
                          const url = String(r.url || '').trim();
                          if (!url) {
                              alert('上傳完成但未取得附件網址');
                              continue;
                          }
                          trainingRecordModal.attachments.push({
                              url,
                              name: String(r.fileName || f.name || '').trim() || '附件',
                          });
                      } catch (err) {
                          alert((err && err.message) || '上傳失敗（請稍後重試）');
                      }
                  }
              } finally {
                  trainingModalUploading.value = false;
              }
          }
  
          function removeTrainingModalAttachmentAt(index) {
              if (index < 0 || index >= trainingRecordModal.attachments.length) return;
              trainingRecordModal.attachments.splice(index, 1);
          }
  
          function submitTrainingRecordModal() {
              const title = String(trainingRecordModal.title || '').trim();
              if (!title) {
                  alert('請輸入研習名稱');
                  return;
              }
              const sr = util.normalizeRocDate7(trainingRecordModal.startRoc7);
              const er = util.normalizeRocDate7(trainingRecordModal.endRoc7);
              if (sr.length !== 7 || er.length !== 7 || !util.rocDate7ToIso(sr) || !util.rocDate7ToIso(er)) {
                  alert('請輸入正確起迄日（民國 7 碼）');
                  return;
              }
              const startIso = util.rocDate7ToIso(sr);
              const endIso = util.rocDate7ToIso(er);
              const isOnline = !!trainingRecordModal.isOnline;
              const venue = isOnline ? '' : String(trainingRecordModal.venue || '').trim();
              const trainingAttachments = (trainingRecordModal.attachments || [])
                  .map((a) => ({
                      url: String((a && a.url) || '').trim(),
                      name: String((a && a.name) || '').trim(),
                  }))
                  .filter((a) => a.url);
              const payload = {
                  title,
                  startRoc7: sr,
                  endRoc7: er,
                  startIso,
                  endIso,
                  isOnline,
                  venue,
                  hours: String(trainingRecordModal.hours || '').trim(),
                  trainingAttachments,
                  attachmentUrl: '',
                  attachmentName: '',
              };
              if (trainingRecordModal.editingId) {
                  const idx = (personalAdmin.trainingRecords || []).findIndex((x) => x.id === trainingRecordModal.editingId);
                  if (idx < 0) {
                      closeTrainingRecordEditor();
                      return;
                  }
                  Object.assign(personalAdmin.trainingRecords[idx], payload);
              } else {
                  personalAdmin.trainingRecords.push({
                      id: 'TR_' + Date.now(),
                      ...payload,
                  });
              }
              closeTrainingRecordEditor();
          }

          function deleteTrainingRecordFromModal() {
              const id = trainingRecordModal.editingId;
              if (!id) return;
              if (!confirm('確定刪除此筆研習紀錄？')) return;
              removeTrainingRecord(id);
              closeTrainingRecordEditor();
          }

          function removeTrainingRecord(id) {
              personalAdmin.trainingRecords = personalAdmin.trainingRecords.filter((x) => x.id !== id);
              if (trainingRecordModal.editingId === id || trainingExpandedId.value === id) {
                  closeTrainingRecordEditor();
              }
          }
  
          function emptyCareerTimelineRow() {
              return migrateCareerTimelineRecord({
                  id: `CR_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                  startRoc7: '',
                  endRoc7: '',
                  title: '',
                  content: '',
                  period: '',
                  note: '',
                  careerAttachments: [],
                  careerTier: 'main',
                  parentId: '',
              });
          }
  
          function addCareerTimelineRowAfter(afterId) {
              if (!Array.isArray(personalAdmin.careerTimelineRecords)) {
                  personalAdmin.careerTimelineRecords = [];
              }
              const row = emptyCareerTimelineRow();
              if (afterId == null) {
                  personalAdmin.careerTimelineRecords.push(row);
                  return;
              }
              const idx = personalAdmin.careerTimelineRecords.findIndex((r) => r.id === afterId);
              if (idx < 0) personalAdmin.careerTimelineRecords.push(row);
              else personalAdmin.careerTimelineRecords.splice(idx + 1, 0, row);
          }
  
          function removeCareerTimelineRecord(id) {
              const list = personalAdmin.careerTimelineRecords || [];
              list.forEach((r) => {
                  if (r.parentId === id) {
                      r.careerTier = 'main';
                      r.parentId = '';
                  }
              });
              personalAdmin.careerTimelineRecords = list.filter((x) => x.id !== id);
              sanitizeCareerTimelineLinks(personalAdmin.careerTimelineRecords);
          }
  
          function openEventModalGlobal() {
              eventModal.dateRoc = util.todayRocDate7();
              eventModal.endRoc7 = '';
              eventModal.time = '';
              eventModal.title = '';
              eventModal.open = true;
          }

          function openEventModalForDay(fullDate) {
              const d = util.normalizeRocDate7(fullDate) || util.todayRocDate7();
              eventModal.dateRoc = d;
              eventModal.endRoc7 = '';
              eventModal.time = '';
              eventModal.title = '';
              eventModal.open = true;
          }

          function saveEventModal() {
              const title = eventModal.title.trim();
              if (!title) {
                  alert('請輸入標題');
                  return;
              }
              const dr = util.normalizeRocDate7(eventModal.dateRoc);
              if (dr.length !== 7 || !util.rocDate7ToIso(dr)) {
                  alert('請輸入正確開始日期（民國 7 碼）');
                  return;
              }
              const erRaw = util.normalizeRocDate7(eventModal.endRoc7);
              const er = erRaw.length === 7 && util.rocDate7ToIso(erRaw) ? erRaw : dr;
              if (String(er).localeCompare(String(dr)) < 0) {
                  alert('結束日期不可早於開始日期');
                  return;
              }
              personalAdmin.calendarEvents.unshift({
                  id: 'EV_' + Date.now(),
                  dateRoc: dr,
                  startRoc7: dr,
                  endRoc7: er,
                  time: util.normalizeRocTime4(eventModal.time),
                  title,
                  isCase: false,
                  isLinked: false,
              });
              eventModal.open = false;
              refreshCalendars();
          }
  
          function removeCalendarEventById(id) {
              personalAdmin.calendarEvents = personalAdmin.calendarEvents.filter((e) => e.id !== id);
              refreshCalendars();
          }
  
          watch(
              () => personalAdmin.calendarEvents,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(
              () => personalAdmin.overtimeEntries,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(
              () => personalAdmin.leaveRecords,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(
              () => personalAdmin.trainingRecords,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(
              allCases,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(
              currentWorkspace,
              () => refreshCalendars(),
              { deep: true }
          );
          watch(googleCalendarSettingsOpen, (open) => {
              if (open) loadGoogleCalendarOAuthConfig();
          });
          watch(
              () => googleCalendarStatus.connected,
              (connected, wasConnected) => {
                  if (connected && !wasConnected) refreshCalendars();
              }
          );

          watch(
              dashViewActive,
              (active) => {
                  if (active) {
                      calendarShouldSnapToday = true;
                      calendarSnapPending = true;
                      calendarUserScrolled = false;
                      if (googleCalendarStatus.connected) {
                          refreshCalendarScroll();
                      } else if (events.scrollWeeks.length) {
                          scheduleScrollCalendarToToday('auto');
                      }
                  }
              },
              { immediate: true }
          );

          watch(
              () => events.scrollWeeks.length,
              (len) => {
                  if (len > 0 && dashViewActive.value && shouldSnapCalendarToToday()) {
                      scheduleScrollCalendarToToday('auto');
                  }
              }
          );

          onMounted(async () => {
              handleGoogleCalendarReturnQuery();
              await loadGoogleCalendarStatus();
              refreshCalendars();

              try {
                  isDbConnected.value = await apiService.checkHealth();
                  if (isDbConnected.value) {
                      await loadGoogleCalendarStatus();
                      await refreshCalendars();
                      await hydrateSettingsFromDb();
                      await hydratePersonalAdminFromDb();
                      refreshCalendars();
                      syncAttendanceMonthLimitFromStore();
                      syncAttendanceLeaveYearPanelFromStore();
                      if (adminActiveTab.value === 'payscale') {
                          await refreshPayscaleDataFromApi();
                      }
                  }
              } catch (err) {
                  console.error('[JCMS] startup hydrate failed:', err);
              }
              casesManager.load();
              if (!isDbConnected.value) {
                  const t = setInterval(async () => {
                      if (await apiService.checkHealth()) {
                          isDbConnected.value = true;
                          clearInterval(t);
                          casesManager.load();
                          await hydrateSettingsFromDb();
                          await hydratePersonalAdminFromDb();
                          refreshCalendars();
                          syncAttendanceMonthLimitFromStore();
                          syncAttendanceLeaveYearPanelFromStore();
                      }
                  }, 3000);
              }
          });
  
          return {
              util, time, currentView, switchView, gotoOvertimeAdmin, navClass, exportAppDbBackup, dbBackupBusy, isLoading, isDbConnected, dbStatusClass, isMobileLayout,
              currentWorkspace, settings, addWorkspace, removeWorkspace, activeWorkspaceLabel, dashWorkspaceStartDateRoc7,
              prefixInput, addPrefix, removePrefix,
              casesManager, isLoadingCases, dashStats, dashBreakdownMode, dashBreakdownSlotCount, dashBreakdownSlots, dashBreakdownHasData, dashBreakdownLabelDisplay,
              dashRootRef, dashMapRootRef, dashCalendarScrollRef, workMapEditRootRef, dashMapTodoPendingCount,
              workMapDoc, workMapUi, workMapFeatureEditor,
              agencyLayerDoc, agencyFeatureEditor, mapCurrentLocation,
              agencySelectedFeature, agencyFeatureList, hasMapCurrentLocation,
              workMapCanUndo, workMapCanRedo, workMapColorPresets,
              workMapSelectedFeature, workMapSelectedFeatureMeasure, workMapDraftMeasureLabel,
              openWorkMapEdit, saveWorkMapAndReturnDashboard,
              activateWorkMapEditTarget, selectAgencyFeature,
              saveAgencySelectedFeatureProperties, saveCurrentLocationProperties, clearCurrentLocation,
              addWorkMapList, startRenameWorkMapLayer, renameWorkMapList, finishRenameWorkMapLayer,
              cancelRenameWorkMapLayer, onWorkMapLayerNameClick,
              selectWorkMapLayerForEdit, toggleWorkMapLayerVisible, toggleWorkMapLayerCheck,
              removeWorkMapList, setWorkMapToolMode, undoWorkMap, redoWorkMap,
              clearWorkMapSelection, saveWorkMapSelectedFeatureProperties,
              updateWorkMapFeatureColorDraft, selectWorkMapFeatureFromList,
              removeWorkMapSelectedFeature,
              workMapFeatureTypeLabel,
              gotoDashUnresolved,
              gotoDashNewlyReceived,
              gotoDashClosedThisMonth,
              gotoDashProceedingThisMonth,
              gotoDashNotProceeding,
              overtimeMetrics, personalAdmin,
              adminActiveTab, adminTabs,
              overtimeMonthMetrics, dashOvertimeMonthLimitTotal, dashOvertimeBarScale,
              dashMapOtRegularDotSpec, dashMapOtProjectDotSpec,
              dashMapOtRegularTooltip, dashMapOtProjectTooltip,
              dashMapOtRegularUsedDisplay, dashMapOtProjectUsedDisplay,
              dashMapOtRegularReportableDisplay, dashMapOtProjectReportableDisplay,
              dashMapOtRegularRemainingDisplay, dashMapOtProjectRemainingDisplay,
              dashDetailOtRegularBarSpec, dashDetailOtProjectBarSpec, dashDetailLeaveBarSpec,
              dashDetailOtYearRegularBarSpec, dashDetailOtYearProjectBarSpec,
              dashDetailOtYearRegularDisplay, dashDetailOtYearProjectDisplay,
              attnDashOtLimitRegularNum,
              attnDashOtLimitProjectNum,
              attnDashOtLimitRegularDisplay,
              attnDashOtLimitProjectDisplay,
              attnDashOtRegularRemaining,
              attnDashOtProjectRemaining,
              attnDashOtRegularRemainingDisplay,
              attnDashOtProjectRemainingDisplay,
              attnDashOtRegularUsedDisplay,
              attnDashOtProjectUsedDisplay,
              attnDashOtRegularDotSpec,
              attnDashOtProjectDotSpec,
              attnDashLeaveDotSpec,
              attendanceDashLeaveRemainingDisplay,
              attendanceLeaveUsedDaysEqDisplay,
              attnDashLeaveQuotaLineDisplay,
              attnDashLeaveUsedLineDisplay,
              attnDashLeaveRemainingLineDisplay,
              attendanceDashLeaveQuotaNum,
              attendanceDashLeaveQuotaDisplay,
              attendanceDashLeaveRemainingDaysNum,
              attendanceMonthRoc5, attendanceMonthLimit, attendanceMonthLimitTotal,
              attendanceMonthLimitEditorOpen,
              attendanceMonthLimitDraft,
              attendanceMonthLimitDraftTotal,
              openAttendanceMonthLimitEditor,
              closeAttendanceMonthLimitEditor,
              applyAttendanceMonthLimitEditor,
              attendanceMonthPickerOpen,
              attendanceMonthPickerDraft,
              openAttendanceMonthPicker,
              closeAttendanceMonthPicker,
              applyAttendanceMonthPicker,
              shiftAttendanceMonthPickerDraft,
              setAttendanceMonthPickerDraftToThis,
              setAttendanceMonthToThis,
              attendanceOtModal,
              attendanceOtModalComputed,
              attendanceOtModalEntryHoursDisplay,
              attendanceOtModalRemaining,
              attendanceOtModalRemainingDisplay,
              attendanceOtPanelAddLabel,
              closeAttendanceOtModal,
              openAttendanceOtModalAdd,
              openAttendanceOtModalEdit,
              submitAttendanceOtModal,
              deleteAttendanceOtFromModal,
              deleteAttendanceLeaveFromModal,
              attendanceLeaveModal,
              attendanceLeaveModalSameDay,
              attendanceLeaveModalDurationPreview,
              attendanceLeavePanelAddLabel,
              closeAttendanceLeaveModal,
              openAttendanceLeaveModalAdd,
              openAttendanceLeaveModalEdit,
              submitAttendanceLeaveModal,
              attendanceLeaveYearRoc3,
              attendanceLeaveYearRoc3Padded,
              attendanceLeaveYearPickerOpen,
              attendanceLeaveYearPickerDraft,
              attendanceLeaveYearPickerDraftPadded,
              openAttendanceLeaveYearPicker,
              closeAttendanceLeaveYearPicker,
              applyAttendanceLeaveYearPicker,
              shiftAttendanceLeaveYearPickerDraft,
              setAttendanceLeaveYearPickerDraftToThis,
              onAttendanceLeaveYearPickerInput,
              attendanceLeaveYearSettingsEditorOpen,
              attendanceLeaveYearSettingsDraft,
              openAttendanceLeaveYearSettingsEditor,
              closeAttendanceLeaveYearSettingsEditor,
              applyAttendanceLeaveYearSettingsEditor,
              attendanceLeaveYearPanel,
              shiftAttendanceLeaveYear, setAttendanceLeaveYearToThis,
              attendanceOvertimeRowsRegular,
              attendanceOvertimeRowsProject,
              attendanceLeaveRows,
              shiftAttendanceMonth,
              attendanceOvertimeMonthMetrics,
              events,
              shiftWeek,
              goToThisWeek,
              shiftCalendarMonth,
              goToCalendarToday,
              onDashCalendarScroll,
              isCalendarPastDay,
              MONTH_DOW_LABELS,
              dashDetailLeaveTooltip,
              googleCalendarSettingsOpen,
              googleCalendarStatus,
              googleCalendarOAuthDraft,
              loadGoogleCalendarOAuthConfig,
              saveGoogleCalendarOAuthConfig,
              formatGoogleSyncAt,
              connectGoogleCalendar,
              syncGoogleCalendarNow,
              disconnectGoogleCalendar,
              eventModal, openEventModalGlobal, openEventModalForDay, saveEventModal, removeCalendarEventById,
              addPersonalTodo, removePersonalTodo, togglePersonalTodoDone,
              todoDragOverId, onTodoDragStart, onTodoDragOver, onTodoDrop, onTodoDragEnd,
              submitOvertimeForm, removeOvertimeEntry, submitLeaveForm, removeLeaveRecord,
              salaryYearRows: SALARY_YEAR_ROWS,
              salaryTimelineYearGroups,
              salaryNewYearGroup,
              salaryNewYearDraft,
              salaryNewYearToggleLabel,
              toggleSalaryNewYear,
              submitSalaryNewYear,
              closeSalaryNewYear,
              salaryAllYearsCollapsed,
              isSalaryYearCollapsed,
              toggleSalaryYearSection,
              toggleAllSalaryYearSections,
              collapsePriorSalaryYears,
              salaryColPanel,
              isSalaryColPanelOpen,
              toggleSalaryColPanel,
              closeSalaryColPanel,
              salaryNewColDraft,
              salaryNewRowDraft,
              salaryColNotice,
              submitSalaryNewCol,
              submitSalaryNewRow,
              setSalaryColLabel,
              onSalaryColLabelBlur,
              setSalaryRowLabel,
              onSalaryRowLabelBlur,
              deleteSalaryCol,
              deleteSalaryRow,
              getSalaryRowsForYear,
              getSalaryAddColsForYear,
              getSalarySubColsForYear,
              salaryTableColspanForYear,
              salaryRowAddSumForYear,
              salaryRowSubSumForYear,
              getSalaryYearEntry,
              getSalaryYearRow,
              PAYSCALE_BUILTIN_EFFECTIVE_ROC7,
              PAYSCALE_BUILTIN_ROWS,
              payscaleRowTotal,
              payscaleApiLatest,
              payscaleMergedRows,
              payscaleChartEffectiveLabel,
              payscaleChartEffectiveRoc7Line,
              payscaleChartCanvas,
              payscaleDataVersions,
              payscaleExpandedId,
              payscaleHistoryVersionGroups,
              payscaleAllVersionsCollapsed,
              isPayscaleVersionCollapsed,
              getPayscaleVersionPanel,
              togglePayscaleVersionSection,
              toggleAllPayscaleVersionSections,
              collapsePriorPayscaleVersions,
              cancelPayscaleVersionEdit,
              payscaleNewToggleLabel,
              payscaleHistoryModalDetail,
              payscaleHistoryEditDraft,
              payscaleHistoryEditRows,
              payscaleHistoryBusy,
              payscaleIsCurrentPayscaleVersion,
              togglePayscaleHistoryEditor,
              closePayscaleEditor,
              submitPayscaleHistoryUpdate,
              deletePayscaleHistoryVersion,
              payscaleNewDraft,
              payscaleNewTableRows,
              payscaleNewBusy,
              togglePayscaleNewEditor,
              submitPayscaleNewVersion,
              refreshPayscaleDataFromApi,
              payscaleClearMyGradeMark,
              trainingModalFileInput,
              trainingModalUploading,
              trainingRecordModal,
              trainingExpandedId,
              trainingTableRows,
              trainingAddToggleLabel,
              trainingTimelineYearGroups,
              isTrainingYearCollapsed,
              toggleTrainingYearSection,
              trainingAllYearsCollapsed,
              toggleAllTrainingYearSections,
              collapsePriorTrainingYears,
              openTrainingRecordEditor,
              openTrainingRecordEditorFromLink,
              closeTrainingRecordEditor,
              submitTrainingRecordModal,
              deleteTrainingRecordFromModal,
              triggerTrainingModalFilePick,
              onTrainingModalFileChange,
              removeTrainingModalAttachmentAt,
              careerMainsSorted,
              careerMainSelectOptions,
              isCareerBranchExpanded,
              toggleCareerBranch,
              careerChildCount,
              careerParentTitle,
              careerTimelineLayout,
              careerTimelineTicks,
              careerEventModal,
              careerExpandedId,
              careerTableRows,
              careerAddToggleLabel,
              careerModalFileInput,
              careerModalUploading,
              careerModalDurationPreview,
              careerRowDateLabel,
              careerRowPeriodLabel,
              careerRowAttachments,
              careerRowHasAttachment,
              openCareerEventModal,
              openCareerEventEditorFromLink,
              closeCareerEventEditor,
              deleteCareerEventFromModal,
              triggerCareerModalFilePick,
              onCareerModalFileChange,
              removeCareerModalAttachment,
              submitCareerEventModal,
              addCareerTimelineRowAfter,
              removeCareerTimelineRecord,
              resolveUploadUrl,
              formatRocFromIso: util.formatRocFromIso,
              formatDateDisplay: util.formatDateDisplay,
              formatMonthDisplay: util.formatMonthDisplay,
              dynamicsPersons,
              dynamicsPersonRosterByClass,
              dynamicsImportBusy,
              dynamicsPersonDetail,
              dynamicsPersonLatestPostingUnit,
              dynamicsPersonDrawerOpen,
              dynamicsPersonPopoverStyle,
              dynamicsPersonSaveBusy,
              dynamicsNewPersonOpen,
              dynamicsNewPersonDraft,
              dynamicsPersonEdit,
              dynamicsDirectEvent,
              dynamicsPersonNotesFileInput,
              dynamicsPersonNotesUploading,
              dynamicsDirectEventFileInput,
              dynamicsDirectEventUploading,
              dynamicsTimelineAttachmentFileInput,
              dynamicsTimelineEventAttachBusy,
              dynamicsTimelineEventSaving,
              dynamicsRoleLabel,
              dynamicsKindLabel,
              dynamicsTimelineEventBody,
              dynamicsTimelineEventAttachments,
              dynamicsSearchQuery,
              dynamicsSearchResults,
              dynamicsSearchBusy,
              dynamicsSearchMessage,
              dynamicsFtsRebuildBusy,
              dynamicsDedupeBusy,
              dynamicsJudgeRosterMeta,
              dynamicsJudgeRosterUploadBusy,
              dynamicsJudgeRosterMessage,
              dynamicsJudgeRosterFileInput,
              dynamicsIntelDrawerOpen,
              dynamicsIntelPipeRaw,
              dynamicsIntelLegacyOpen,
              dynamicsIntelGeminiPasteOpen,
              dynamicsIntelPasteBundle,
              dynamicsIntelDraft,
              dynamicsIntelNewPersonRole,
              openDynamicsIntelDrawer,
              closeDynamicsIntelDrawer,
              toggleDynamicsIntelLegacy,
              toggleDynamicsIntelGeminiPaste,
              parseDynamicsIntelBundle,
              submitDynamicsIntelDrawerDirect,
              refreshDynamicsLists,
              onDynamicsJudgeRosterFileChange,
              openDynamicsPerson,
              onDynamicsSearchHit,
              runDynamicsSearch,
              rebuildDynamicsFtsIndex,
              dedupeDynamicsDuplicateEvents,
              closeDynamicsPersonDetail,
              saveDynamicsPersonProfile,
              triggerDynamicsPersonNotesFilePick,
              onDynamicsPersonNotesFileChange,
              removeDynamicsPersonNotesAttachmentAt,
              createDynamicsNewPerson,
              deleteDynamicsPersonById,
              triggerDynamicsDirectEventFilePick,
              onDynamicsDirectEventFileChange,
              removeDynamicsDirectEventAttachmentAt,
              triggerDynamicsTimelineEventAttachmentFilePick,
              onDynamicsTimelineAttachmentFileChange,
              removeDynamicsTimelineEventAttachment,
              saveDynamicsTimelineEventAttachments,
              submitDynamicsDirectEvent,
              deleteDynamicsTimelineEvent,
          };
      }
  }).mount('#app');
}
