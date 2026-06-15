import { ref, reactive, computed, watch, nextTick } from '../vue-api.js';
import { util } from '../utils.js';

function workspaceStartDateRoc7(settingsRef, workspaceId) {
    const id = String(workspaceId || 'WS_001');
    const ws = (settingsRef?.data?.workspaces || []).find((w) => String(w.id) === id);
    if (!ws) return '';
    return util.normalizeRocDate7(ws.startDate || '');
}

function clampAssignDateToWorkspaceStart(rawDate, workspaceId, settingsRef) {
    const floor = workspaceStartDateRoc7(settingsRef, workspaceId);
    if (floor.length !== 7) return rawDate;
    const d = util.normalizeRocDate7(rawDate) || util.toRocDate7FromAny(rawDate) || '';
    if (d.length !== 7) return rawDate;
    return d < floor ? floor : d;
}

export function useCasesManager(api, workspaceIdRef, settingsRef) {
    const allCases = ref([]);
    const isLoadingCases = ref(false);
    const showAddModal = ref(false);
    /** 編輯中凍結清單快照（含篩選列），避免輸入時列被即時篩除或重排 */
    const listEditSnapshot = ref(null);
    const createDraft = reactive({
        caseNumRaw: '',
        reason: '',
        dates: '',
    });
    const workspaceCases = computed(() => {
        const ws = String(workspaceIdRef.value || 'WS_001');
        return allCases.value.filter((c) => String(c.workspaceId || 'WS_001') === ws);
    });
    const availableTabs = computed(() => {
        const groupsRaw = Array.isArray(settingsRef?.data?.caseWordGroups)
            ? settingsRef.data.caseWordGroups
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
        const resolveGroupLabel = (word) => {
            const w = util.normalizeCaseWord(word);
            if (!w) return '';
            const hit = groupRules.find((g) => g.name === w || g.members.includes(w));
            return hit ? hit.name : w;
        };
        const tabs = Array.from(
            new Set(
                workspaceCases.value
                    .map((c) => resolveGroupLabel(c.word))
                    .filter(Boolean)
            )
        );
        return tabs.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    });

    let caseListSettingsNoticeClearTimer = null;
    let addCaseNoticeClearTimer = null;
    const caseTableScrollEl = ref(null);
    const caseListScroll = reactive({
        canScroll: false,
        atTop: true,
        atBottom: false,
    });
    let caseTableScrollResizeObserver = null;
    let caseListScrollRaf = null;

    function updateCaseListScrollLayout() {
        const el = caseTableScrollEl.value;
        const wrap = el?.closest('.case-table-scroll-wrap');
        if (!wrap) return;
        const thead = el?.querySelector('.case-grid-table thead');
        const theadH = thead?.offsetHeight || 0;
        wrap.style.setProperty('--case-list-thead-offset', `${theadH}px`);
    }

    function updateCaseListScrollState() {
        const el = caseTableScrollEl.value;
        if (!el) {
            caseListScroll.canScroll = false;
            caseListScroll.atTop = true;
            caseListScroll.atBottom = false;
            return;
        }
        const maxScroll = el.scrollHeight - el.clientHeight;
        const threshold = 4;
        caseListScroll.canScroll = maxScroll > threshold;
        caseListScroll.atTop = el.scrollTop <= threshold;
        caseListScroll.atBottom = el.scrollTop >= maxScroll - threshold;
    }

    function scheduleCaseListScrollStateUpdate() {
        if (caseListScrollRaf) return;
        caseListScrollRaf = requestAnimationFrame(() => {
            caseListScrollRaf = null;
            updateCaseListScrollState();
        });
    }

    function scheduleCaseListScrollLayoutUpdate() {
        nextTick(() => {
            updateCaseListScrollLayout();
            scheduleCaseListScrollStateUpdate();
        });
    }

    function teardownCaseTableScrollObserver() {
        if (caseTableScrollResizeObserver) {
            caseTableScrollResizeObserver.disconnect();
            caseTableScrollResizeObserver = null;
        }
    }

    const casesManager = reactive({
        activeTab: '全部',
        statusFilter: '全部',
        sortKey: 'assignDate',
        sortOrder: 'asc',
        caseFilterPanelOpen: false,
        caseFilters: {
            reason: '',
            activeParty: '',
            passiveParty: '',
            assignDateQ: '',
            proceedDateQ: '',
            closeDateQ: '',
            closeReason: '',
            targetMin: '',
            targetMax: '',
            judgmentMin: '',
            judgmentMax: '',
        },
        get hasActiveCaseFilters() {
            const f = this.caseFilters;
            const texts = [
                f.reason,
                f.activeParty,
                f.passiveParty,
                f.assignDateQ,
                f.proceedDateQ,
                f.closeDateQ,
                f.closeReason,
                f.targetMin,
                f.targetMax,
                f.judgmentMin,
                f.judgmentMax,
            ];
            if (texts.some((t) => String(t || '').trim())) return true;
            return false;
        },
        get availableTabs() {
            return availableTabs.value;
        },
        get showAddModal() {
            return showAddModal.value;
        },
        get wordGroups() {
            if (!Array.isArray(settingsRef?.data?.caseWordGroups)) {
                settingsRef.data.caseWordGroups = [];
            }
            return settingsRef.data.caseWordGroups;
        },
        get createDraft() {
            return createDraft;
        },
        getWordGroupRules() {
            const groupsRaw = Array.isArray(settingsRef?.data?.caseWordGroups)
                ? settingsRef.data.caseWordGroups
                : [];
            return groupsRaw
                .map((g) => {
                    const name = util.normalizeCaseWord(g?.name || '');
                    const members = Array.isArray(g?.members)
                        ? g.members.map((m) => util.normalizeCaseWord(m)).filter(Boolean)
                        : util.splitCaseWordMembers(g?.membersText || '');
                    return { name, members };
                })
                .filter((g) => g.name);
        },
        resolveWordGroupLabel(word) {
            const w = util.normalizeCaseWord(word);
            if (!w) return '';
            const hit = this.getWordGroupRules().find((g) => g.name === w || g.members.includes(w));
            return hit ? hit.name : w;
        },
        get tabFilteredCases() {
            let cases = workspaceCases.value.slice();
            if (this.activeTab !== '全部') {
                cases = cases.filter((c) => this.resolveWordGroupLabel(c.word) === this.activeTab);
            }
            return cases.filter((c) => this.casePassesAdvancedFilters(c));
        },
        get statusCounts() {
            const cases = this.tabFilteredCases;
            let 未結 = 0;
            let 已結 = 0;
            let 未進行 = 0;
            for (const c of cases) {
                if (this.isCaseClosed(c)) 已結 += 1;
                else 未結 += 1;
                if (this.isCaseNotProceeding(c)) 未進行 += 1;
            }
            return { 全部: cases.length, 未結, 已結, 未進行 };
        },
        isCaseClosed(c) {
            return !!String(c?.closeDate || '').trim();
        },
        isCaseNotProceeding(c) {
            if (this.isCaseClosed(c)) return false;
            const pd = String(this.latestProceedDate(c) || '').trim();
            if (!pd) return true;
            const today = util.todayRocDate7();
            if (!today) return false;
            return pd < today;
        },
        sortThClass(key) {
            const base =
                'py-1.5 px-1.5 text-[12px] font-bold uppercase tracking-widest select-none cursor-pointer hover:text-ink-900 transition-colors';
            return `${base} ${this.sortKey === key ? 'text-ink-900' : 'text-ink-400'}`;
        },
        sortIndicator(key) {
            if (this.sortKey !== key) return '';
            return this.sortOrder === 'asc' ? ' ↑' : ' ↓';
        },
        async load() {
            isLoadingCases.value = true;
            try {
                const rows = await api.fetchCases();
                allCases.value = Array.isArray(rows)
                    ? rows.map((row) => reactive({ ...row, _persisted: true }))
                    : [];
                await this.enforceAllWorkspaceAssignDateFloors();
            } catch (err) {
                console.error('Data Fetch Error:', err);
            } finally {
                isLoadingCases.value = false;
                nextTick(() => scheduleCaseListScrollLayoutUpdate());
            }
        },
        noteRowCount(note) {
            const text = String(note ?? '');
            if (!text) return 1;
            return text.split('\n').length;
        },
        setCaseTableScrollEl(el) {
            if (caseTableScrollEl.value === el) return;
            teardownCaseTableScrollObserver();
            caseTableScrollEl.value = el;
            if (!el) {
                updateCaseListScrollState();
                return;
            }
            scheduleCaseListScrollLayoutUpdate();
            if (typeof ResizeObserver !== 'undefined') {
                caseTableScrollResizeObserver = new ResizeObserver(() => {
                    scheduleCaseListScrollLayoutUpdate();
                });
                caseTableScrollResizeObserver.observe(el);
            }
        },
        onCaseTableScroll() {
            scheduleCaseListScrollStateUpdate();
        },
        scrollCaseListToTop() {
            const el = caseTableScrollEl.value;
            if (!el) return;
            el.scrollTo({ top: 0, behavior: 'smooth' });
        },
        scrollCaseListToBottom() {
            const el = caseTableScrollEl.value;
            if (!el) return;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        },
        get showCaseListScrollToTop() {
            return caseListScroll.canScroll && !caseListScroll.atTop;
        },
        get showCaseListScrollToBottom() {
            return caseListScroll.canScroll && !caseListScroll.atBottom;
        },
        markListEditing(c) {
            if (!c || listEditSnapshot.value) return;
            listEditSnapshot.value = this.buildFilteredList().slice();
        },
        clearListEditing() {
            if (listEditSnapshot.value) {
                listEditSnapshot.value.forEach((row) => {
                    delete row._dateDraftAssign;
                    delete row._dateDraftProceed;
                    delete row._dateDraftClose;
                    delete row._caseNumEdit;
                    delete row._moneyDraftTarget;
                });
            }
            listEditSnapshot.value = null;
        },
        normalizeDateDraft(raw) {
            return String(raw ?? '').replace(/\D/g, '').slice(0, 7);
        },
        getAssignDateEdit(c) {
            if (!c) return '';
            if (c._dateDraftAssign != null) return String(c._dateDraftAssign);
            return this.firstAssignDate(c);
        },
        getProceedDateEdit(c) {
            if (!c) return '';
            if (c._dateDraftProceed != null) return String(c._dateDraftProceed);
            return this.latestProceedDate(c);
        },
        getCloseDateEdit(c) {
            if (!c) return '';
            if (c._dateDraftClose != null) return String(c._dateDraftClose);
            return util.formatDateDisplay(c.closeDate);
        },
        commitPendingDateDrafts(c) {
            if (!c) return;
            if (c._dateDraftAssign != null) this.commitAssignDate(c);
            if (c._dateDraftProceed != null) this.commitProceedDate(c);
            if (c._dateDraftClose != null) this.commitCloseDate(c);
            if (c._moneyDraftTarget != null) this.commitTargetAmount(c);
        },
        getTargetAmountEdit(c) {
            if (!c) return '';
            if (c._moneyDraftTarget != null) return String(c._moneyDraftTarget);
            const raw = String(c.targetAmount ?? '').replace(/,/g, '').trim();
            if (!raw) return '';
            const v = util.parseMoney(raw);
            return v === 0 ? '' : util.formatMoney(v);
        },
        onTargetAmountFocus(c, el) {
            if (!c) return;
            this.markListEditing(c);
            this.ensureTargetAmountDraft(c);
            if (!el) return;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const next = String(c._moneyDraftTarget ?? '');
                    const pos = Math.min(el.selectionStart ?? next.length, next.length);
                    try {
                        el.setSelectionRange(pos, pos);
                    } catch (_) {
                        /* ignore */
                    }
                });
            });
        },
        ensureTargetAmountDraft(c) {
            if (!c || c._moneyDraftTarget != null) return;
            const trimmed = String(c.targetAmount ?? '').replace(/,/g, '').trim();
            c._moneyDraftTarget = trimmed ? String(util.parseMoney(trimmed)) : '';
        },
        onTargetAmountMouseDown(c) {
            if (!c) return;
            this.markListEditing(c);
            this.ensureTargetAmountDraft(c);
        },
        onTargetAmountInput(c, raw) {
            if (!c) return;
            c._moneyDraftTarget = String(raw ?? '').replace(/[^\d]/g, '');
        },
        commitTargetAmount(c) {
            if (!c) return;
            const draft =
                c._moneyDraftTarget != null
                    ? String(c._moneyDraftTarget).trim()
                    : String(c.targetAmount ?? '').replace(/,/g, '').trim();
            delete c._moneyDraftTarget;
            if (!draft) {
                c.targetAmount = '';
                return;
            }
            const v = util.parseMoney(draft);
            c.targetAmount = v === 0 ? '' : util.formatMoney(v);
        },
        onTargetAmountBlur(c) {
            this.commitTargetAmount(c);
            return this.saveListRow(c);
        },
        getCaseNumEdit(c) {
            if (!c) return '';
            if (c._caseNumEdit != null) return String(c._caseNumEdit);
            return util.formatCaseNoFromParts(c.year, c.word, c.number);
        },
        onCaseNumInput(c, raw) {
            if (!c) return;
            c._caseNumEdit = String(raw ?? '');
        },
        changeTab(t) {
            this.clearListEditing();
            this.activeTab = t;
        },
        changeStatusFilter(v) {
            this.clearListEditing();
            this.statusFilter = v;
        },
        toggleSettingsPanel() {
            this.showSettingsPanel = !this.showSettingsPanel;
        },
        toggleCaseFilterPanel() {
            this.caseFilterPanelOpen = !this.caseFilterPanelOpen;
        },
        flashCaseListSettingsNotice(msg) {
            this.caseListSettingsNotice = msg;
            if (caseListSettingsNoticeClearTimer) clearTimeout(caseListSettingsNoticeClearTimer);
            caseListSettingsNoticeClearTimer = setTimeout(() => {
                this.caseListSettingsNotice = '';
                caseListSettingsNoticeClearTimer = null;
            }, 3200);
        },
        clearAddCaseNotice() {
            this.addCaseNotice = '';
            if (addCaseNoticeClearTimer) {
                clearTimeout(addCaseNoticeClearTimer);
                addCaseNoticeClearTimer = null;
            }
        },
        flashAddCaseNotice(msg) {
            this.addCaseNotice = String(msg || '').trim() || '發生錯誤';
            if (addCaseNoticeClearTimer) clearTimeout(addCaseNoticeClearTimer);
            addCaseNoticeClearTimer = setTimeout(() => {
                this.addCaseNotice = '';
                addCaseNoticeClearTimer = null;
            }, 4800);
        },
        clearCaseFilters() {
            Object.assign(this.caseFilters, {
                reason: '',
                activeParty: '',
                passiveParty: '',
                assignDateQ: '',
                proceedDateQ: '',
                closeDateQ: '',
                closeReason: '',
                targetMin: '',
                targetMax: '',
                judgmentMin: '',
                judgmentMax: '',
            });
        },
        filterTextPartial(haystack, needle) {
            if (!needle || !String(needle).trim()) return true;
            const n = String(needle).trim().toLowerCase();
            const h = String(haystack ?? '').toLowerCase();
            return h.includes(n);
        },
        filterDatePartialForCase(c, field, needle) {
            if (!needle || !String(needle).trim()) return true;
            const q = String(needle).trim();
            const qLow = q.toLowerCase();
            const qDig = q.replace(/\D/g, '');
            let blob = '';
            if (field === 'assign') {
                blob = `${String((c && c.dates) || '')} ${String(this.firstAssignDate(c) || '')}`;
            } else if (field === 'proceed') {
                const list = util.normalizeProceedingsList(util.parseProceedingsJson(c?.proceedingsJson));
                const ds = list
                    .map((r) => util.normalizeRocDate7(r.dateRoc7))
                    .filter((d) => d.length >= 7);
                blob = `${ds.join(' ')} ${String(this.latestProceedDate(c) || '')}`;
            } else {
                blob = `${String((c && c.closeDate) || '')} ${String(util.formatDateDisplay(c?.closeDate) || '')}`;
            }
            if (blob.toLowerCase().includes(qLow)) return true;
            if (qDig && blob.replace(/\D/g, '').includes(qDig)) return true;
            return false;
        },
        filterMoneyPredicate(rawVal, minStr, maxStr) {
            const n = util.parseMoney(rawVal);
            const vmin = util.parseMoney(minStr);
            const vmax = util.parseMoney(maxStr);
            const hasMin = String(minStr ?? '').replace(/,/g, '').trim() !== '';
            const hasMax = String(maxStr ?? '').replace(/,/g, '').trim() !== '';
            if (!hasMin && !hasMax) return true;
            if (hasMin && !hasMax) return n >= vmin;
            if (!hasMin && hasMax) return n <= vmax;
            const lo = Math.min(vmin, vmax);
            const hi = Math.max(vmin, vmax);
            return n >= lo && n <= hi;
        },
        casePassesAdvancedFilters(c) {
            const f = this.caseFilters;
            if (!this.filterTextPartial(c.reason, f.reason)) return false;
            if (!this.filterTextPartial(c.activeParty, f.activeParty)) return false;
            if (!this.filterTextPartial(c.passiveParty, f.passiveParty)) return false;
            if (!this.filterDatePartialForCase(c, 'assign', f.assignDateQ)) return false;
            if (!this.filterDatePartialForCase(c, 'proceed', f.proceedDateQ)) return false;
            if (!this.filterDatePartialForCase(c, 'close', f.closeDateQ)) return false;
            if (!this.filterTextPartial(c.closeReason, f.closeReason)) return false;
            if (!this.filterMoneyPredicate(c.targetAmount, f.targetMin, f.targetMax)) return false;
            if (!this.filterMoneyPredicate(c.judgmentAmount, f.judgmentMin, f.judgmentMax)) return false;
            return true;
        },
        addWordGroup() {
            if (!Array.isArray(settingsRef.data.caseWordGroups)) {
                settingsRef.data.caseWordGroups = [];
            }
            settingsRef.data.caseWordGroups.push({ name: '', members: [], membersText: '' });
        },
        removeWordGroup(idx) {
            if (!Array.isArray(settingsRef.data.caseWordGroups)) return;
            settingsRef.data.caseWordGroups.splice(idx, 1);
        },
        async saveCaseListSettings() {
            if (!settingsRef?.data) return;
            if (!Array.isArray(settingsRef.data.caseWordGroups)) {
                settingsRef.data.caseWordGroups = [];
            }
            settingsRef.data.caseWordGroups.forEach((g) => {
                const members = util.splitCaseWordMembers(g.membersText || '');
                g.members = members;
                g.membersText = util.joinCaseWordMembers(members);
                g.name = util.normalizeCaseWord(g.name || '');
            });
            this.caseListSettingsSaving = true;
            try {
                if (!(await api.checkHealth())) {
                    this.flashCaseListSettingsNotice('後端未連線，無法儲存。');
                    return;
                }
                await api.saveAppSettings({
                    currentWorkspaceId: workspaceIdRef.value,
                    data: JSON.parse(JSON.stringify(settingsRef.data)),
                });
                this.flashCaseListSettingsNotice('已儲存至資料庫。');
            } catch (e) {
                this.flashCaseListSettingsNotice(`儲存失敗：${e.message || ''}`);
            } finally {
                this.caseListSettingsSaving = false;
            }
        },
        openAddModal() {
            if (showAddModal.value) {
                showAddModal.value = false;
                this.clearAddCaseNotice();
                return;
            }
            createDraft.caseNumRaw = '';
            createDraft.reason = '';
            createDraft.dates = '';
            this.clearAddCaseNotice();
            showAddModal.value = true;
        },
        closeAddModal() {
            showAddModal.value = false;
            this.clearAddCaseNotice();
        },
        async createFromModal() {
            const ws = String(workspaceIdRef.value || 'WS_001');
            const parsed = this.parseCaseNumLoose(createDraft.caseNumRaw);
            const year = String(parsed.year || '').trim();
            const word = String(parsed.word || '').trim();
            const number = String(parsed.number || '').trim();
            const datesRoc = util.toRocDate7FromAny(createDraft.dates) || '';
            const datesNorm = util.normalizeRocDate7(createDraft.dates);
            const datesClamped = clampAssignDateToWorkspaceStart(datesRoc, ws, settingsRef);
            const id = String(Date.now());
            const payload = {
                id,
                workspaceId: ws,
                isPinned: false,
                seqTotal: workspaceCases.value.length + 1,
                year,
                word,
                number,
                reason: (createDraft.reason || '').trim(),
                activeParty: '',
                passiveParty: '',
                dates: datesClamped,
                closeDate: '',
                closeReason: '',
                targetAmount: '',
                judgmentAmount: '',
                note: '',
                filingDateRoc7: '',
                courtFee: '',
                courtFeeDetailJson: '{}',
                proceedingsJson: '[]',
                partiesJson: util.stringifyPartiesTree(util.emptyPartiesTree()),
            };
            if (!payload.reason) {
                this.flashAddCaseNotice('請輸入案由');
                return;
            }
            if (!payload.year || !payload.word || !payload.number) {
                this.flashAddCaseNotice('請輸入可解析的案號（年度、字別、號碼連寫，例如 111士簡聲9999）');
                return;
            }
            if (datesNorm.length !== 7) {
                this.flashAddCaseNotice('請輸入分案日（民國日期 7 碼或點日曆選擇）');
                return;
            }
            try {
                const data = await api.createCase(util.toApiPayload(payload));
                allCases.value.unshift(
                    reactive({
                        ...payload,
                        ...data,
                        _persisted: true,
                    })
                );
                this.clearAddCaseNotice();
                showAddModal.value = false;
            } catch (e) {
                this.flashAddCaseNotice(`建立失敗：${e.message || ''}`);
            }
        },
        sortBy(key) {
            this.clearListEditing();
            if (this.sortKey === key) {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortKey = key;
                this.sortOrder = 'asc';
            }
        },
        parseCaseNum(c, val) {
            const p = util.parseCaseNoToParts(val);
            c.year = p.year;
            c.word = p.word;
            c.number = p.number;
        },
        parseCaseNumLoose(val) {
            const src = String(val || '').replace(/\s+/g, '');
            const m = src.match(/^(\d+)([^\d]+)(\d+)$/);
            if (!m) return { year: '', word: '', number: '' };
            return { year: m[1], word: m[2], number: m[3] };
        },
        latestProceedDate(c) {
            const list = util.normalizeProceedingsList(util.parseProceedingsJson(c && c.proceedingsJson));
            const ds = list.map((r) => util.normalizeRocDate7(r.dateRoc7)).filter((d) => d.length === 7);
            if (!ds.length) return '';
            return [...new Set(ds)].sort().slice(-1)[0];
        },
        caseHasProceedingInMonth(c, monthRoc5) {
            const m = String(monthRoc5 || '')
                .replace(/\D/g, '')
                .slice(0, 5);
            if (m.length !== 5) return false;
            const list = util.normalizeProceedingsList(util.parseProceedingsJson(c?.proceedingsJson));
            const ds = list
                .map((r) => util.normalizeRocDate7(r.dateRoc7))
                .filter((d) => d.length >= 5);
            return ds.some((d) => d.slice(0, 5) === m);
        },
        firstAssignDate(c) {
            const raw = String((c && c.dates) || '').trim();
            if (!raw) return '';
            const matches = raw.match(/\d{7}/g);
            if (matches && matches.length) {
                return matches.sort()[0];
            }
            return util.formatDateDisplay(raw);
        },
        onAssignDateInput(c, raw) {
            if (!c) return;
            c._dateDraftAssign = this.normalizeDateDraft(raw);
        },
        onProceedDateInput(c, raw) {
            if (!c) return;
            c._dateDraftProceed = this.normalizeDateDraft(raw);
        },
        onCloseDateInput(c, raw) {
            if (!c) return;
            c._dateDraftClose = this.normalizeDateDraft(raw);
        },
        commitAssignDate(c) {
            if (!c) return;
            const d =
                c._dateDraftAssign != null
                    ? String(c._dateDraftAssign)
                    : this.firstAssignDate(c);
            delete c._dateDraftAssign;
            const ws = String(c.workspaceId || workspaceIdRef.value || 'WS_001');
            c.dates = clampAssignDateToWorkspaceStart(d, ws, settingsRef);
        },
        commitProceedDate(c) {
            if (!c) return;
            const d = util.normalizeRocDate7(
                c._dateDraftProceed != null ? String(c._dateDraftProceed) : this.latestProceedDate(c)
            );
            delete c._dateDraftProceed;
            const list = util.normalizeProceedingsList(util.parseProceedingsJson(c.proceedingsJson));
            if (!d) {
                c.proceedingsJson = '[]';
                return;
            }
            const prev = list.length ? list[list.length - 1] : null;
            c.proceedingsJson = util.proceedingsJsonStringify([
                {
                    id: prev?.id || `pe_${Date.now()}`,
                    dateRoc7: d,
                    content: prev?.content || '',
                },
            ]);
        },
        commitCloseDate(c) {
            if (!c) return;
            const raw =
                c._dateDraftClose != null
                    ? String(c._dateDraftClose)
                    : util.formatDateDisplay(c.closeDate);
            delete c._dateDraftClose;
            c.closeDate = util.normalizeRocDate7(raw) || util.toRocDate7FromAny(raw) || '';
        },
        onAssignDateBlur(c) {
            this.commitAssignDate(c);
            return this.saveListRow(c);
        },
        onProceedDateBlur(c) {
            this.commitProceedDate(c);
            return this.saveListRow(c);
        },
        onCloseDateBlur(c) {
            this.commitCloseDate(c);
            return this.saveListRow(c);
        },
        onCaseNumBlur(c, e) {
            const val =
                c && c._caseNumEdit != null
                    ? String(c._caseNumEdit)
                    : e && e.target
                      ? e.target.value
                      : '';
            this.parseCaseNum(c, val);
            if (c && '_caseNumEdit' in c) delete c._caseNumEdit;
            return this.saveListRow(c);
        },
        async saveListRow(c) {
            if (!c || !c._persisted) {
                this.clearListEditing();
                return;
            }
            this.commitPendingDateDrafts(c);
            try {
                await this.saveSingle(c);
            } catch (_) {
                /* saveSingle 已提示 */
            } finally {
                this.clearListEditing();
            }
        },
        buildFilteredList() {
            let cases = this.tabFilteredCases.slice();
            if (this.statusFilter === '未結') {
                cases = cases.filter((c) => !this.isCaseClosed(c));
            } else if (this.statusFilter === '已結') {
                cases = cases.filter((c) => this.isCaseClosed(c));
            } else if (this.statusFilter === '未進行') {
                cases = cases.filter((c) => this.isCaseNotProceeding(c));
            }
            const ord = this.sortOrder === 'asc' ? 1 : -1;
            const sk = this.sortKey;
            const textCmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'zh-Hant') * ord;
            const numCmp = (a, b) => ((Number(a) || 0) - (Number(b) || 0)) * ord;
            const rocDateCmp = (a, b) => {
                const da = String(a || '').replace(/\D/g, '').slice(0, 7);
                const db = String(b || '').replace(/\D/g, '').slice(0, 7);
                return textCmp(da, db);
            };
            const compareCore = (a, b) => {
                if (sk === 'pin') {
                    return numCmp(a.isPinned ? 1 : 0, b.isPinned ? 1 : 0);
                }
                if (sk === 'seqTotal') {
                    const na = parseInt(String(a.seqTotal), 10) || 0;
                    const nb = parseInt(String(b.seqTotal), 10) || 0;
                    return (na - nb) * ord;
                }
                if (sk === 'caseNum') {
                    const key = (c) => `${c.year || ''}${c.word || ''}${c.number || ''}`;
                    return key(a).localeCompare(key(b), 'zh-Hant') * ord;
                }
                if (sk === 'status') {
                    const sa = this.isCaseClosed(a) ? 1 : 0;
                    const sb = this.isCaseClosed(b) ? 1 : 0;
                    return (sa - sb) * ord;
                }
                if (sk === 'reason') return textCmp(a.reason, b.reason);
                if (sk === 'activeParty') return textCmp(a.activeParty, b.activeParty);
                if (sk === 'passiveParty') return textCmp(a.passiveParty, b.passiveParty);
                if (sk === 'assignDate') return rocDateCmp(this.firstAssignDate(a), this.firstAssignDate(b));
                if (sk === 'proceedDate') return rocDateCmp(this.latestProceedDate(a), this.latestProceedDate(b));
                if (sk === 'closeDate') return rocDateCmp(a.closeDate, b.closeDate);
                if (sk === 'closeReason') return textCmp(a.closeReason, b.closeReason);
                if (sk === 'targetAmount') return numCmp(util.parseMoney(a.targetAmount), util.parseMoney(b.targetAmount));
                if (sk === 'judgmentAmount') return numCmp(util.parseMoney(a.judgmentAmount), util.parseMoney(b.judgmentAmount));
                if (sk === 'note') return textCmp(a.note, b.note);
                return String(b.id).localeCompare(String(a.id), 'en');
            };
            cases.sort((a, b) => {
                const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
                if (pinDiff !== 0) return pinDiff;
                return compareCore(a, b);
            });
            return cases;
        },
        get filtered() {
            if (listEditSnapshot.value) return listEditSnapshot.value;
            return this.buildFilteredList();
        },
        showSettingsPanel: false,
        caseListSettingsSaving: false,
        caseListSettingsNotice: '',
        addCaseNotice: '',
        async enforceWorkspaceAssignDateFloor(workspaceId) {
            const ws = String(workspaceId || 'WS_001');
            const floor = workspaceStartDateRoc7(settingsRef, ws);
            if (floor.length !== 7) return;
            const saves = [];
            for (const c of allCases.value) {
                if (String(c.workspaceId || 'WS_001') !== ws) continue;
                const current =
                    util.normalizeRocDate7(this.firstAssignDate(c) || c.dates || '') || '';
                if (current.length !== 7 || current >= floor) continue;
                c.dates = floor;
                if (c._persisted) saves.push(this.saveSingle(c));
            }
            await Promise.all(saves);
        },
        async enforceAllWorkspaceAssignDateFloors() {
            const ids = (settingsRef?.data?.workspaces || []).map((w) => String(w.id));
            for (const id of ids) {
                await this.enforceWorkspaceAssignDateFloor(id);
            }
        },
        async saveSingle(c) {
            const ws = String(c.workspaceId || workspaceIdRef.value || 'WS_001');
            const assignRaw =
                c._dateDraftAssign != null
                    ? String(c._dateDraftAssign)
                    : this.firstAssignDate(c) || String(c.dates || '');
            const clamped = clampAssignDateToWorkspaceStart(assignRaw, ws, settingsRef);
            if (clamped !== assignRaw) c.dates = clamped;
            const payload = util.toApiPayload(c);
            try {
                if (c._persisted) {
                    const data = await api.updateCase(c.id, payload);
                    util.mergeCaseRow(c, data);
                } else {
                    const data = await api.createCase(payload);
                    util.mergeCaseRow(c, data);
                }
            } catch (e) {
                alert(`儲存失敗：${e.message || '請檢查後端連線'}`);
                throw e;
            }
        },
        async togglePin(c) {
            const next = !c.isPinned;
            c.isPinned = next;
            if (!c._persisted) return;
            try {
                await api.updateCase(c.id, { isPinned: next });
            } catch (e) {
                c.isPinned = !next;
                alert(`釘選更新失敗：${e.message || ''}`);
            }
        },
        async remove(id) {
            const sid = String(id);
            const row = allCases.value.find((x) => String(x.id) === sid);
            try {
                if (row && row._persisted) {
                    await api.deleteCase(sid);
                }
                allCases.value = allCases.value.filter((x) => String(x.id) !== sid);
                return true;
            } catch (e) {
                alert(`刪除失敗：${e.message || ''}`);
                return false;
            }
        },
        async batchAdd() {
            const picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = '.xlsx,.xls';
            picker.onchange = async () => {
                const file = picker.files && picker.files[0];
                if (!file) return;
                const ws = String(workspaceIdRef.value || 'WS_001');
                try {
                    const preview = await api.importCasesExcel(file, { workspaceId: ws, dryRun: true });
                    const msg =
                        `預覽完成：總筆數 ${preview.total || 0}，可匯入 ${preview.success || 0}，失敗 ${preview.failed || 0}，警告 ${preview.warnings || 0}。\n` +
                        `是否正式匯入？`;
                    if (!window.confirm(msg)) return;
                    const result = await api.importCasesExcel(file, { workspaceId: ws, dryRun: false });
                    await this.load();
                    alert(
                        `匯入完成：成功 ${result.committed || 0} 筆；` +
                        `失敗 ${result.failed || 0} 筆；警告 ${result.warnings || 0} 筆。`
                    );
                } catch (e) {
                    alert(`批次匯入失敗：${e.message || ''}`);
                }
            };
            picker.click();
        },
    });

    watch([workspaceCases, availableTabs], () => {
        if (casesManager.activeTab !== '全部' && !availableTabs.value.includes(casesManager.activeTab)) {
            casesManager.activeTab = '全部';
        }
        if (!['全部', '未結', '已結', '未進行'].includes(casesManager.statusFilter)) {
            casesManager.statusFilter = '全部';
        }
    }, { immediate: true });

    watch(
        () => casesManager.caseFilters,
        () => {
            casesManager.clearListEditing();
        },
        { deep: true }
    );

    watch(
        () => casesManager.filtered.length,
        () => {
            scheduleCaseListScrollLayoutUpdate();
        }
    );

    watch(
        () =>
            (settingsRef?.data?.workspaces || []).map((w) => ({
                id: w.id,
                startDate: util.normalizeRocDate7(w.startDate || ''),
            })),
        async (next, prev) => {
            if (!prev) return;
            for (const ws of next) {
                const old = prev.find((p) => p.id === ws.id);
                if (old && old.startDate !== ws.startDate && ws.startDate.length === 7) {
                    await casesManager.enforceWorkspaceAssignDateFloor(ws.id);
                }
            }
        },
        { deep: true }
    );

    return { allCases, casesManager, isLoadingCases };
}