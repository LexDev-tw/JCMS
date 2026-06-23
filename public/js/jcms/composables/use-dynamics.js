import { ref, reactive, computed, watch, nextTick } from '../vue-api.js?v=0.1.20260623g';
import { util } from '../utils.js?v=0.1.20260623g';

function dynamicsRoleLabel(role) {
    const m = { judge: '法官', prosecutor: '檢察官', lawyer: '律師', scholar: '學者' };
    return m[role] || role;
}
function dynamicsKindLabel(kind) {
    const m = { resolution: '人事／決議', news: '新聞', note: '備註', other: '其他' };
    return m[kind] || kind;
}
/** 管道匯入等 bulk_parse：raw_text 常為「姓名|單位|職稱|日期|來源|內容…」，時間軸只顯示第六段起（內容）。 */
function dynamicsTimelineEventBody(ev) {
    const raw = String(ev?.raw_text ?? '').trim();
    if (!raw) return '';
    if (ev?.source_channel === 'bulk_parse') {
        const parts = raw.split('|').map((x) => x.trim());
        if (parts.length >= 6) {
            const tail = parts.slice(5).join('|').trim();
            if (tail) return tail;
        }
    }
    return raw;
}

export function useDynamics(apiService, currentView, isDbConnected) {
    const dynamicsPersons = ref([]);
    const dynamicsImportBusy = ref(false);
    const dynamicsPersonDetail = ref(null);
    const dynamicsPersonDrawerOpen = ref(false);
    const dynamicsPersonPopoverStyle = ref({});
    const dynamicsPersonSaveBusy = ref(false);
    const dynamicsNewPersonOpen = ref(false);
    const dynamicsNewPersonDraft = reactive({
        display_name: '',
        role: 'judge',
        class_year: '',
    });
    const dynamicsPersonEdit = reactive({
        display_name: '',
        role: 'judge',
        class_year: '',
        notes: '',
        notes_attachments: [],
    });
    const dynamicsDirectEvent = reactive({
        dateRoc: '',
        kind: 'note',
        summary: '',
        raw_text: '',
        attachments: [],
    });
    const dynamicsPersonNotesFileInput = ref(null);
    const dynamicsPersonNotesUploading = ref(false);
    const dynamicsDirectEventFileInput = ref(null);
    const dynamicsDirectEventUploading = ref(false);
    const dynamicsTimelineAttachmentFileInput = ref(null);
    const dynamicsTimelineAttachmentUploadEventId = ref('');
    const dynamicsTimelineEventAttachDrafts = reactive({});
    const dynamicsTimelineEventAttachBusy = reactive({});
    const dynamicsTimelineEventSaving = reactive({});
    const dynamicsSearchQuery = ref('');
    const dynamicsSearchResults = ref([]);
    const dynamicsSearchBusy = ref(false);
    const dynamicsSearchMessage = ref('');
    const dynamicsFtsRebuildBusy = ref(false);
    const dynamicsDedupeBusy = ref(false);
    const dynamicsJudgeRosterMeta = ref(null);
    const dynamicsJudgeRosterUploadBusy = ref(false);
    const dynamicsJudgeRosterMessage = ref('');
    const dynamicsJudgeRosterFileInput = ref(null);

    const dynamicsIntelDrawerOpen = ref(false);
    const dynamicsIntelPipeRaw = ref('');
    const dynamicsIntelLegacyOpen = ref(false);
    const dynamicsIntelGeminiPasteOpen = ref(false);
    const dynamicsIntelPasteBundle = ref('');
    const dynamicsIntelDraft = reactive({
        title: '',
        raw: '',
        name_hints: '',
    });
    const dynamicsIntelNewPersonRole = ref('judge');

    function normalizeDynamicsPersonNotes(v) {
        if (v == null) return '';
        const s = String(v).trim();
        if (!s || /^null$/i.test(s)) return '';
        return s;
    }

    function normalizeDynamicsAttachments(v) {
        if (!Array.isArray(v)) return [];
        const seen = new Set();
        return v
            .map((a) => ({
                url: String(a && a.url != null ? a.url : '').trim(),
                name: String(a && a.name != null ? a.name : '').trim(),
            }))
            .filter((a) => {
                if (!a.url || seen.has(a.url)) return false;
                seen.add(a.url);
                return true;
            })
            .map((a) => ({ ...a, name: a.name || '附件' }));
    }

    function resetDynamicsTimelineEventAttachDrafts(events) {
        const next = {};
        const list = Array.isArray(events) ? events : [];
        for (let i = 0; i < list.length; i += 1) {
            const ev = list[i];
            if (!ev || !ev.id) continue;
            next[ev.id] = normalizeDynamicsAttachments(ev.attachments);
        }
        Object.keys(dynamicsTimelineEventAttachDrafts).forEach((k) => {
            delete dynamicsTimelineEventAttachDrafts[k];
        });
        Object.assign(dynamicsTimelineEventAttachDrafts, next);
    }

    function dynamicsTimelineEventAttachments(ev) {
        if (!ev || !ev.id) return [];
        if (!Array.isArray(dynamicsTimelineEventAttachDrafts[ev.id])) {
            dynamicsTimelineEventAttachDrafts[ev.id] = normalizeDynamicsAttachments(ev.attachments);
        }
        return dynamicsTimelineEventAttachDrafts[ev.id];
    }

    function triggerDynamicsTimelineEventAttachmentFilePick(eventId) {
        if (!eventId) return;
        dynamicsTimelineAttachmentUploadEventId.value = eventId;
        nextTick(() => {
            if (dynamicsTimelineAttachmentFileInput.value) dynamicsTimelineAttachmentFileInput.value.click();
        });
    }

    async function onDynamicsTimelineAttachmentFileChange(e) {
        const input = e.target;
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';
        const eventId = String(dynamicsTimelineAttachmentUploadEventId.value || '').trim();
        dynamicsTimelineAttachmentUploadEventId.value = '';
        if (!eventId || !files.length) return;
        dynamicsTimelineEventAttachBusy[eventId] = true;
        try {
            const base = dynamicsTimelineEventAttachments({ id: eventId, attachments: [] });
            const merged = Array.isArray(base) ? [...base] : [];
            for (let i = 0; i < files.length; i += 1) {
                const f = files[i];
                if (!f || !f.size) continue;
                const r = await apiService.uploadAttachment('dynamics', f);
                if (!r.success) {
                    alert(r.error || '上傳失敗（請確認已啟動本機伺服器）');
                    continue;
                }
                const url = String(r.url || '').trim();
                if (!url) continue;
                merged.push({
                    url,
                    name: String(r.fileName || f.name || '').trim() || '附件',
                });
            }
            dynamicsTimelineEventAttachDrafts[eventId] = normalizeDynamicsAttachments(merged);
        } finally {
            dynamicsTimelineEventAttachBusy[eventId] = false;
        }
    }

    function removeDynamicsTimelineEventAttachment(ev, index) {
        if (!ev || !ev.id) return;
        const list = dynamicsTimelineEventAttachments(ev);
        if (index < 0 || index >= list.length) return;
        list.splice(index, 1);
    }

    async function saveDynamicsTimelineEventAttachments(ev) {
        const pid = dynamicsPersonDetail.value?.person?.id;
        if (!pid || !ev || !ev.id) return;
        const eventId = ev.id;
        dynamicsTimelineEventSaving[eventId] = true;
        try {
            const attachments = normalizeDynamicsAttachments(dynamicsTimelineEventAttachments(ev));
            await apiService.patchDynamicsEvent(eventId, { attachments });
            await openDynamicsPerson(pid);
            await refreshDynamicsLists();
        } catch (e2) {
            alert(e2.message || String(e2));
        } finally {
            dynamicsTimelineEventSaving[eventId] = false;
        }
    }

    function triggerDynamicsPersonNotesFilePick() {
        nextTick(() => {
            if (dynamicsPersonNotesFileInput.value) dynamicsPersonNotesFileInput.value.click();
        });
    }

    async function onDynamicsPersonNotesFileChange(e) {
        const input = e.target;
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';
        if (!files.length) return;
        dynamicsPersonNotesUploading.value = true;
        try {
            for (let i = 0; i < files.length; i += 1) {
                const f = files[i];
                if (!f || !f.size) continue;
                const r = await apiService.uploadAttachment('dynamics', f);
                if (!r.success) {
                    alert(r.error || '上傳失敗（請確認已啟動本機伺服器）');
                    continue;
                }
                const url = String(r.url || '').trim();
                if (!url) continue;
                dynamicsPersonEdit.notes_attachments.push({
                    url,
                    name: String(r.fileName || f.name || '').trim() || '附件',
                });
                dynamicsPersonEdit.notes_attachments = normalizeDynamicsAttachments(
                    dynamicsPersonEdit.notes_attachments
                );
            }
        } finally {
            dynamicsPersonNotesUploading.value = false;
        }
    }

    function removeDynamicsPersonNotesAttachmentAt(index) {
        if (index < 0 || index >= dynamicsPersonEdit.notes_attachments.length) return;
        dynamicsPersonEdit.notes_attachments.splice(index, 1);
    }

    function triggerDynamicsDirectEventFilePick() {
        nextTick(() => {
            if (dynamicsDirectEventFileInput.value) dynamicsDirectEventFileInput.value.click();
        });
    }

    async function onDynamicsDirectEventFileChange(e) {
        const input = e.target;
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';
        if (!files.length) return;
        dynamicsDirectEventUploading.value = true;
        try {
            for (let i = 0; i < files.length; i += 1) {
                const f = files[i];
                if (!f || !f.size) continue;
                const r = await apiService.uploadAttachment('dynamics', f);
                if (!r.success) {
                    alert(r.error || '上傳失敗（請確認已啟動本機伺服器）');
                    continue;
                }
                const url = String(r.url || '').trim();
                if (!url) continue;
                dynamicsDirectEvent.attachments.push({
                    url,
                    name: String(r.fileName || f.name || '').trim() || '附件',
                });
                dynamicsDirectEvent.attachments = normalizeDynamicsAttachments(
                    dynamicsDirectEvent.attachments
                );
            }
        } finally {
            dynamicsDirectEventUploading.value = false;
        }
    }

    function removeDynamicsDirectEventAttachmentAt(index) {
        if (index < 0 || index >= dynamicsDirectEvent.attachments.length) return;
        dynamicsDirectEvent.attachments.splice(index, 1);
    }

    function updateDynamicsPersonPopoverPosition() {
        const m = 12;
        const maxPanelW = 672;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const panelW = Math.min(maxPanelW, vw - 2 * m);
        const preferredMaxH = Math.min(920, Math.floor(vh * 0.96) - 2 * m);
        const maxH = Math.min(preferredMaxH, vh - 2 * m);
        const top = Math.max(m, (vh - maxH) / 2);
        const left = Math.max(m, (vw - panelW) / 2);
        dynamicsPersonPopoverStyle.value = {
            position: 'fixed',
            left: `${Math.round(left)}px`,
            top: `${Math.round(top)}px`,
            width: `${Math.round(panelW)}px`,
            maxHeight: `${Math.round(maxH)}px`,
            zIndex: 97,
        };
    }

    const dynamicsPersonLatestPostingUnit = computed(() => {
        const d = dynamicsPersonDetail.value;
        const roster = d && typeof d.roster_posting_unit === 'string' ? d.roster_posting_unit.trim() : '';
        if (roster) return roster;
        const evs = d?.events;
        if (!Array.isArray(evs)) return '';
        for (const ev of evs) {
            if (ev.source_channel !== 'bulk_parse') continue;
            const raw = String(ev.raw_text || '').trim();
            if (!raw) continue;
            const parts = raw.split('|').map((x) => x.trim());
            if (parts.length >= 6 && parts[1]) return parts[1];
        }
        return '';
    });

    const dynamicsPersonRosterByClass = computed(() => {
        const list = Array.isArray(dynamicsPersons.value) ? dynamicsPersons.value : [];
        const buckets = new Map();
        for (const per of list) {
            const cy =
                per.class_year != null && String(per.class_year).trim() !== ''
                    ? String(per.class_year).trim()
                    : '';
            const key = cy || '__none';
            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    label: cy || '未填期別',
                    sortKey: cy,
                    people: [],
                });
            }
            buckets.get(key).people.push(per);
        }
        const groups = Array.from(buckets.values());
        const numericScore = (s) => {
            const n = parseInt(String(s).replace(/\D/g, ''), 10);
            return Number.isFinite(n) ? n : null;
        };
        for (const g of groups) {
            g.people.sort((a, b) =>
                String(a.display_name || '').localeCompare(String(b.display_name || ''), 'zh-Hant')
            );
        }
        groups.sort((a, b) => {
            if (a.key === '__none') return 1;
            if (b.key === '__none') return -1;
            const na = numericScore(a.sortKey);
            const nb = numericScore(b.sortKey);
            if (na != null && nb != null && na !== nb) return nb - na;
            if (na != null && nb == null) return -1;
            if (na == null && nb != null) return 1;
            return String(a.sortKey).localeCompare(String(b.sortKey), 'zh-Hant');
        });
        return groups;
    });

    function openDynamicsIntelDrawer() {
        dynamicsIntelGeminiPasteOpen.value = false;
        dynamicsIntelLegacyOpen.value = false;
        dynamicsIntelDrawerOpen.value = true;
        nextTick(() => {
            document.getElementById('dyn-intel-pipe')?.focus();
        });
    }
    function closeDynamicsIntelDrawer() {
        dynamicsIntelDrawerOpen.value = false;
    }
    function toggleDynamicsIntelLegacy() {
        dynamicsIntelLegacyOpen.value = !dynamicsIntelLegacyOpen.value;
    }
    function toggleDynamicsIntelGeminiPaste() {
        dynamicsIntelGeminiPasteOpen.value = !dynamicsIntelGeminiPasteOpen.value;
    }
    function parseDynamicsIntelBundle() {
        const t = String(dynamicsIntelPasteBundle.value || '').trim();
        if (!t) return;
        const tm = t.match(/---JCMS_TITLE---\s*[\r\n]+([\s\S]*?)(?=[\r\n]+---JCMS_RAW---)/);
        const rm = t.match(/---JCMS_RAW---\s*[\r\n]+([\s\S]*?)(?=[\r\n]+---JCMS_NAME_HINTS---)/);
        const hm = t.match(/---JCMS_NAME_HINTS---\s*[\r\n]+([\s\S]*)$/);
        if (tm) {
            const line = tm[1].trim();
            dynamicsIntelDraft.title = line === '無' ? '' : line;
        }
        if (rm) dynamicsIntelDraft.raw = rm[1].trim();
        if (hm) {
            const h = hm[1].trim();
            dynamicsIntelDraft.name_hints = h === '無' ? '' : h;
        }
        dynamicsIntelPasteBundle.value = '';
        dynamicsIntelGeminiPasteOpen.value = false;
        dynamicsIntelLegacyOpen.value = true;
    }
    async function submitDynamicsIntelDrawerDirect() {
        const pipe = String(dynamicsIntelPipeRaw.value || '').trim();
        const raw = String(dynamicsIntelDraft.raw || '').trim();
        if (pipe) {
            if (
                !confirm(
                    '略過審核：依「姓名|單位|職稱|民國七碼或UNKNOWN|來源|內容」逐列寫入；新建人物將套用抽屜內選定之身分（法官／檢察官／律師／學者）。確定？'
                )
            ) {
                return;
            }
        } else if (raw) {
            if (
                !confirm(
                    '將依全文擷取規則直接寫入（略過審核）；新建人物將套用抽屜內選定之身分。確定？'
                )
            ) {
                return;
            }
        } else {
            alert('請在上方貼上管道結構化資料，或展開進階填寫決議全文。');
            return;
        }
        if (!(await apiService.checkHealth())) {
            alert('後端未連線。');
            return;
        }
        dynamicsImportBusy.value = true;
        try {
            // 前端本機去重（避免使用者重複匯入同一段情報）
            // 目的：不再重複呼叫後端寫入；真正的去重仍以後端唯一約束為準。
            const DYN_SEEN_KEY = 'jcms_dynamics_import_seen_hashes_v1';
            const normalize = (s) =>
                String(s || '')
                    .replace(/\u3000/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            const fnv1a = (str) => {
                let h = 2166136261;
                const s = String(str || '');
                for (let i = 0; i < s.length; i++) {
                    h ^= s.charCodeAt(i);
                    h = Math.imul(h, 16777619);
                }
                return String(h >>> 0);
            };
            const loadSeenSet = () => {
                try {
                    const raw = localStorage.getItem(DYN_SEEN_KEY);
                    if (!raw) return new Set();
                    const arr = JSON.parse(raw);
                    if (!Array.isArray(arr)) return new Set();
                    return new Set(arr.map(String));
                } catch {
                    return new Set();
                }
            };
            const saveSeenSet = (set) => {
                try {
                    const arr = Array.from(set);
                    const capped = arr.slice(-20000);
                    localStorage.setItem(DYN_SEEN_KEY, JSON.stringify(capped));
                } catch {
                    // ignore
                }
            };

            const seenSet = loadSeenSet();
            let json;
            let skippedDuplicateCount = 0;

            if (pipe) {
                const lines = String(pipe || '')
                    .split(/\r?\n/)
                    .map((l) => String(l).trim())
                    .filter(Boolean);

                // 先去重：同一則「逐列」內容在同次貼上中不重複寫入
                const uniqMap = new Map(); // key -> line
                for (const line of lines) {
                    const key = fnv1a(normalize(line));
                    if (!uniqMap.has(key)) uniqMap.set(key, line);
                }
                const uniqEntries = Array.from(uniqMap.entries()); // [key, line]
                const toWriteEntries = uniqEntries.filter(([key]) => !seenSet.has(key));

                if (toWriteEntries.length === 0) {
                    dynamicsIntelDrawerOpen.value = false;
                    dynamicsIntelPipeRaw.value = '';
                    alert('偵測到重複情報：本次全部內容皆已匯入，已略過寫入。');
                    return;
                }

                skippedDuplicateCount = uniqEntries.length - toWriteEntries.length;

                const pipeTextToWrite = toWriteEntries
                    .map(([, line]) => line)
                    .join('\n');

                json = await apiService.postDynamicsPipeCommit({
                    title: String(dynamicsIntelDraft.title || '').trim() || null,
                    pipe_text: pipeTextToWrite,
                    new_person_role: dynamicsIntelNewPersonRole.value,
                });

                // 寫入成功後才記入本機去重快取
                for (const [key] of toWriteEntries) seenSet.add(key);
                saveSeenSet(seenSet);
            } else {
                const rawKey = fnv1a(normalize(raw));
                if (seenSet.has(rawKey)) {
                    alert('偵測到重複情報：此則內容似乎已匯入，已略過寫入。');
                    return;
                }

                json = await apiService.postDynamicsStructuredCommit({
                    title: String(dynamicsIntelDraft.title || '').trim() || null,
                    raw_text: raw,
                    name_hints: String(dynamicsIntelDraft.name_hints || '').trim() || null,
                    new_person_role: dynamicsIntelNewPersonRole.value,
                });

                seenSet.add(rawKey);
                saveSeenSet(seenSet);
            }
            const n =
                json.data?.batch?.event_count ??
                (Array.isArray(json.data?.events) ? json.data.events.length : 0);
            dynamicsIntelDrawerOpen.value = false;
            if (pipe) {
                dynamicsIntelPipeRaw.value = '';
            }
            await refreshDynamicsLists();
            alert(`已直接寫入 ${n} 筆紀錄（批次 committed）。`);
        } catch (e) {
            alert(e.message || String(e));
        } finally {
            dynamicsImportBusy.value = false;
        }
    }

    async function refreshDynamicsLists() {
        if (!isDbConnected.value) return;
        try {
            dynamicsPersons.value = await apiService.fetchDynamicsPersons();
        } catch (e) {
            console.error(e);
        }
        try {
            dynamicsJudgeRosterMeta.value = await apiService.fetchJudgeCourtRosterMeta();
        } catch (e) {
            console.error(e);
        }
    }

    function readMdFileAsText(file) {
        if (!file) return Promise.reject(new Error('未選取檔案'));
        if (typeof file.text === 'function') {
            return file.text().then((t) => String(t ?? ''));
        }
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ''));
            r.onerror = () => reject(r.error || new Error('讀取檔案失敗'));
            r.readAsText(file, 'UTF-8');
        });
    }

    async function submitDynamicsJudgeCourtRosterText(text) {
        dynamicsJudgeRosterUploadBusy.value = true;
        dynamicsJudgeRosterMessage.value = '上傳中…';
        try {
            if (!(await apiService.checkHealth())) {
                dynamicsJudgeRosterMessage.value = '後端未連線，無法上傳。';
                return;
            }
            const data = await apiService.postJudgeCourtRosterDpt(text);
            try {
                dynamicsJudgeRosterMeta.value = await apiService.fetchJudgeCourtRosterMeta();
            } catch (e2) {
                console.error(e2);
            }
            const rc = data && data.row_count != null ? data.row_count : '—';
            const amb = data && data.ambiguous_names_excluded != null ? data.ambiguous_names_excluded : 0;
            const dptRows = data && data.dpt_rows != null ? data.dpt_rows : null;
            let msg = `已自 DPT 寫入 ${rc} 筆法官對照。`;
            if (amb > 0) msg += ` 同名跨機關已排除 ${amb} 人。`;
            if (dptRows != null) msg += `（來源 ${dptRows} 列）`;
            dynamicsJudgeRosterMessage.value = msg;
            const pid = dynamicsPersonDetail.value?.person?.id;
            if (pid) await openDynamicsPerson(pid);
        } catch (e) {
            dynamicsJudgeRosterMessage.value = e.message || String(e);
        } finally {
            dynamicsJudgeRosterUploadBusy.value = false;
        }
    }

    async function onDynamicsJudgeRosterFileChange(ev) {
        const input = ev.target;
        const f = input && input.files && input.files[0];
        if (!f) return;
        try {
            const text = await readMdFileAsText(f);
            await submitDynamicsJudgeCourtRosterText(text);
        } catch (e) {
            dynamicsJudgeRosterMessage.value = e.message || String(e);
        } finally {
            input.value = '';
        }
    }

    watch(currentView, async (v) => {
        if (v === 'dynamics') {
            await refreshDynamicsLists();
        }
    });
    watch(isDbConnected, async (ok) => {
        if (ok && currentView.value === 'dynamics') {
            await refreshDynamicsLists();
        }
    });
    async function openDynamicsPerson(id, evt) {
        if (!id) {
            dynamicsPersonDetail.value = null;
            dynamicsPersonDrawerOpen.value = false;
            dynamicsPersonPopoverStyle.value = {};
            return;
        }
        if (!(await apiService.checkHealth())) {
            alert('後端未連線。');
            return;
        }
        try {
            const data = await apiService.fetchDynamicsPerson(id);
            dynamicsPersonDetail.value = data;
            Object.assign(dynamicsPersonEdit, {
                display_name: data.person.display_name,
                role: data.person.role,
                class_year: data.person.class_year || '',
                notes: normalizeDynamicsPersonNotes(data.person.notes),
                notes_attachments: normalizeDynamicsAttachments(data.person.notes_attachments),
            });
            dynamicsDirectEvent.dateRoc = '';
            dynamicsDirectEvent.kind = 'note';
            dynamicsDirectEvent.summary = '';
            dynamicsDirectEvent.raw_text = '';
            dynamicsDirectEvent.attachments = [];
            resetDynamicsTimelineEventAttachDrafts(data.events);
            dynamicsPersonDrawerOpen.value = true;
            await nextTick();
            updateDynamicsPersonPopoverPosition();
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    function onDynamicsSearchHit(hit, evt) {
        const pid = hit && hit.person_id;
        if (!pid) return;
        openDynamicsPerson(pid, evt);
    }

    async function runDynamicsSearch() {
        const rawQ = String(dynamicsSearchQuery.value || '').trim();
        if (!rawQ) {
            dynamicsSearchResults.value = [];
            dynamicsSearchMessage.value = '請輸入關鍵字。';
            return;
        }
        // 允許「輸入部分字串」命中：將每個關鍵字轉為 FTS 前綴查詢（term*）
        // 例如：`張三` -> `張三*`、`張 三` -> `張* 三*`（多關鍵字以空白 AND）
        const qParts = rawQ.split(/\s+/).map((s) => s.trim()).filter(Boolean);
        const q = qParts
            .map((part) => {
                // 保留使用者自行輸入的通配符／運算符（*、-xxx、+xxx 等）
                if (!part) return '';
                if (part.includes('*')) return part;
                // 去除可能的外部引號，避免查詢語法誤判
                let t = part.replace(/^"+|"+$/g, '');
                if (!t) return '';
                let sign = '';
                if (t.startsWith('-') || t.startsWith('+')) {
                    sign = t[0];
                    t = t.slice(1);
                }
                if (!t) return part; // 退回原樣（避免變成空）
                return `${sign}${t}*`;
            })
            .filter(Boolean)
            .join(' ');
        if (!q) {
            dynamicsSearchResults.value = [];
            dynamicsSearchMessage.value = '';
            return;
        }
        if (!(await apiService.checkHealth())) {
            dynamicsSearchMessage.value = '後端未連線。';
            return;
        }
        dynamicsSearchBusy.value = true;
        dynamicsSearchMessage.value = '';
        try {
            const data = await apiService.fetchDynamicsSearch(q, 40);
            dynamicsSearchResults.value = data;
            dynamicsSearchMessage.value = data.length ? `${data.length} 筆命中` : '無命中';
        } catch (e) {
            dynamicsSearchResults.value = [];
            dynamicsSearchMessage.value = e.message || String(e);
        } finally {
            dynamicsSearchBusy.value = false;
        }
    }

    async function rebuildDynamicsFtsIndex() {
        if (!confirm('將清空並重建司法動態全文索引（FTS5），可能需要數秒。確定？')) return;
        if (!(await apiService.checkHealth())) {
            alert(
                '目前無法連線後端 API（重建索引已中止）。\n請確認 JCMS 服務已啟動且可從目前網域存取 /api。'
            );
            return;
        }
        dynamicsFtsRebuildBusy.value = true;
        try {
            try {
                await apiService.postDynamicsFtsRebuild();
            } catch (firstErr) {
                // 偶發監看重啟或網路抖動時，短暫等待後重試一次。
                await new Promise((resolve) => setTimeout(resolve, 700));
                await apiService.postDynamicsFtsRebuild();
            }
            dynamicsSearchMessage.value = '索引已重建。';
            if (dynamicsSearchQuery.value.trim()) await runDynamicsSearch();
        } catch (e) {
            alert(e.message || String(e));
        } finally {
            dynamicsFtsRebuildBusy.value = false;
        }
    }

    async function dedupeDynamicsDuplicateEvents() {
        if (
            !confirm(
                '將掃描資料庫中「同一人物、內文相同（忽略多餘空白）」的紀錄，只保留最早建立的一筆，刪除其餘重複項。確定？'
            )
        ) {
            return;
        }
        if (!(await apiService.checkHealth())) {
            alert(
                '目前無法連線後端 API（清除重複紀錄已中止）。\n請確認 JCMS 服務已啟動且可從目前網域存取 /api。'
            );
            return;
        }
        dynamicsDedupeBusy.value = true;
        try {
            let data;
            try {
                data = await apiService.postDynamicsDedupeEvents();
            } catch (firstErr) {
                // 後端在重索引/寫入時可能短暫斷線；短延遲後重試一次。
                await new Promise((resolve) => setTimeout(resolve, 700));
                data = await apiService.postDynamicsDedupeEvents();
            }
            const d = data && typeof data === 'object' ? data : {};
            const msg = `已清除重複：刪除 ${d.deleted ?? 0} 筆（${d.duplicate_groups ?? 0} 組重複），剩餘 ${d.remaining_events ?? '—'} 筆紀錄。`;
            dynamicsSearchMessage.value = msg;
            alert(msg);
            await refreshDynamicsLists();
            if (dynamicsPersonDetail.value?.person?.id) {
                try {
                    await openDynamicsPerson(dynamicsPersonDetail.value.person.id);
                } catch (e) {
                    /* ignore */
                }
            }
        } catch (e) {
            alert(e.message || String(e));
        } finally {
            dynamicsDedupeBusy.value = false;
        }
    }

    function closeDynamicsPersonDetail() {
        dynamicsPersonDrawerOpen.value = false;
        dynamicsPersonDetail.value = null;
        dynamicsPersonPopoverStyle.value = {};
    }

    async function saveDynamicsPersonProfile() {
        if (!dynamicsPersonDetail.value?.person?.id) return;
        dynamicsPersonSaveBusy.value = true;
        try {
            const updated = await apiService.updateDynamicsPerson(dynamicsPersonDetail.value.person.id, {
                display_name: dynamicsPersonEdit.display_name.trim(),
                role: dynamicsPersonEdit.role,
                class_year: dynamicsPersonEdit.class_year.trim() || null,
                notes: dynamicsPersonEdit.notes.trim() || null,
                notes_attachments: normalizeDynamicsAttachments(dynamicsPersonEdit.notes_attachments),
            });
            dynamicsPersonDetail.value.person = updated;
            Object.assign(dynamicsPersonEdit, {
                display_name: updated.display_name,
                role: updated.role,
                class_year: updated.class_year || '',
                notes: normalizeDynamicsPersonNotes(updated.notes),
                notes_attachments: normalizeDynamicsAttachments(updated.notes_attachments),
            });
            await refreshDynamicsLists();
        } catch (e) {
            alert(e.message || String(e));
        } finally {
            dynamicsPersonSaveBusy.value = false;
        }
    }

    async function createDynamicsNewPerson() {
        const n = dynamicsNewPersonDraft.display_name.trim();
        if (!n) {
            alert('請輸入姓名。');
            return;
        }
        try {
            await apiService.createDynamicsPerson({
                display_name: n,
                role: dynamicsNewPersonDraft.role,
                class_year: dynamicsNewPersonDraft.class_year.trim() || null,
            });
            dynamicsNewPersonDraft.display_name = '';
            dynamicsNewPersonDraft.role = 'judge';

            dynamicsNewPersonDraft.class_year = '';
            dynamicsNewPersonOpen.value = false;
            await refreshDynamicsLists();
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    async function deleteDynamicsPersonById(id) {
        if (!confirm('確定刪除此人物及其所有關聯紀錄？')) return;
        try {
            await apiService.deleteDynamicsPerson(id);
            if (dynamicsPersonDetail.value?.person?.id === id) {
                dynamicsPersonDetail.value = null;
                dynamicsPersonDrawerOpen.value = false;
                dynamicsPersonPopoverStyle.value = {};
            }
            await refreshDynamicsLists();
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    async function submitDynamicsDirectEvent() {
        const pid = dynamicsPersonDetail.value?.person?.id;
        if (!pid) return;
        const raw = dynamicsDirectEvent.raw_text.trim();
        if (!raw) {
            alert('請輸入紀錄全文。');
            return;
        }
        let occurred_on = null;
        const dr = util.normalizeRocDate7(dynamicsDirectEvent.dateRoc);
        if (dr.length === 7) {
            const iso = util.rocDate7ToIso(dr);
            if (iso) occurred_on = iso;
        }
        try {
            await apiService.createDynamicsPersonEvent(pid, {
                occurred_on,
                kind: dynamicsDirectEvent.kind,
                summary: dynamicsDirectEvent.summary.trim() || null,
                raw_text: raw,
                attachments: normalizeDynamicsAttachments(dynamicsDirectEvent.attachments),
            });
            dynamicsDirectEvent.raw_text = '';
            dynamicsDirectEvent.summary = '';
            dynamicsDirectEvent.attachments = [];
            await openDynamicsPerson(pid);
            await refreshDynamicsLists();
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    async function deleteDynamicsTimelineEvent(ev) {
        const pid = dynamicsPersonDetail.value?.person?.id;
        if (!pid) return;
        if (!confirm('刪除此筆紀錄？')) return;
        try {
            await apiService.deleteDynamicsPersonEvent(pid, ev.id);
            await openDynamicsPerson(pid);
            await refreshDynamicsLists();
        } catch (e) {
            alert(e.message || String(e));
        }
    }

    return {
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