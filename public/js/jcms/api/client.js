/** REST API 抽象層 */
import { util } from '../utils.js';
import { buildThisWeekSchedule } from '../composables/personal-admin-shared.js';

function weekIsoRangeForOffset(weekOffset = 0) {
    const { days } = buildThisWeekSchedule(weekOffset);
    if (!days?.length) return null;
    const startIso = util.rocDate7ToIso(days[0].fullDate);
    const endIso = util.rocDate7ToIso(days[days.length - 1].fullDate);
    if (!startIso || !endIso) return null;
    return {
        timeMin: `${startIso}T00:00:00+08:00`,
        timeMax: `${endIso}T23:59:59+08:00`,
    };
}

/** 自訂基底若只寫「來源:埠」未含 /api，請求會變成 /dynamics/… 而 404；補上 /api。 */
export function ensureJcmsApiBaseUrl(raw) {
    let s = String(raw || '').trim().replace(/\/+$/, '');
    if (!s) return s;
    if (/\/api$/i.test(s)) return s;
    if (/^https?:\/\/[^/]+$/i.test(s)) return `${s}/api`;
    return s;
}

export function resolveJcmsApiBaseUrl() {
    if (typeof window.JCMS_API_BASE === 'string' && window.JCMS_API_BASE.trim()) {
        return ensureJcmsApiBaseUrl(window.JCMS_API_BASE.trim());
    }
    try {
        const stored = localStorage.getItem('jcms_api_base');
        if (stored && String(stored).trim()) {
            return ensureJcmsApiBaseUrl(String(stored).trim());
        }
    } catch (_) {
        /* ignore */
    }
    if (window.location.protocol === 'file:') {
        return 'http://127.0.0.1:3000/api';
    }
    const port = window.location.port;
    const devStaticPorts = ['5500', '5501', '5173', '4173', '8888'];
    if (port && devStaticPorts.includes(port)) {
        return 'http://127.0.0.1:3000/api';
    }
    const { protocol, hostname } = window.location;
    const p = port || (protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : '');
    // 本機後端固定 3000：API 一律走 IPv4 的 127.0.0.1（與 listen(0.0.0.0) 一致）。網址列為 localhost 時與 127.0.0.1 視為不同源，後端已設 CORS；相對 /api 在 localhost→::1 時仍可能 Failed to fetch
    if (
        p === '3000' &&
        (hostname === 'localhost' || hostname === '127.0.0.1') &&
        (protocol === 'http:' || protocol === 'https:')
    ) {
        return protocol === 'https:' ? 'https://127.0.0.1:3000/api' : 'http://127.0.0.1:3000/api';
    }
    // 區網 IP、自訂埠等：與頁面同源
    return '/api';
}

export function getJcmsApiBaseUrl() {
    return resolveJcmsApiBaseUrl();
}

/** 網路層失敗時拋出可讀訊息（避免僅顯示 Failed to fetch） */
export async function jcmsFetch(input, init) {
    try {
        return await fetch(input, init);
    } catch (e) {
        const name = e && e.name;
        const base = getJcmsApiBaseUrl();
        let attempted = '';
        try {
            const s = typeof input === 'string' ? input : String(input);
            attempted = s.startsWith('http') ? s : new URL(s, window.location.href).href;
        } catch (_) {
            attempted = String(input);
        }
        if (name === 'TypeError') {
            throw new Error(
                `無法連線至 API（基底 ${base}，請求 ${attempted}）。請確認後端已啟動：執行 Start-JCMS.bat，或 pm2 list 見 jcms-api 為 online。勿另開 npm start 佔用 3000 埠。建議開 http://127.0.0.1:3000/JCMS.html。若曾改過 API 位址請執行 localStorage.removeItem('jcms_api_base') 後重整。`
            );
        }
        throw e;
    }
}

export const apiService = {
    async checkHealth() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/health`);
            if (!res.ok) return false;
            const j = await res.json();
            return j.status === 'ok';
        } catch {
            return false;
        }
    },
    async fetchCases() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/cases`);
            if (!res.ok) return [];
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return [];
            return json.data.map((row) => ({
                ...row,
                word: util.normalizeCaseWord(row.word),
                workspaceId: row.workspaceId != null && String(row.workspaceId).trim() !== '' ? String(row.workspaceId).trim() : 'WS_001',
                dates: util.toRocDate7FromAny(row.dates) || (row.dates != null ? String(row.dates) : ''),
                closeDate: util.toRocDate7FromAny(row.closeDate) || (row.closeDate != null ? String(row.closeDate) : ''),
                filingDateRoc7:
                    row.filingDateRoc7 != null && String(row.filingDateRoc7).replace(/\D/g, '').length >= 7
                        ? String(row.filingDateRoc7).replace(/\D/g, '').slice(0, 7)
                        : '',
                courtFee: row.courtFee != null ? String(row.courtFee) : '',
                courtFeeDetailJson:
                    row.courtFeeDetailJson != null && String(row.courtFeeDetailJson).trim() !== ''
                        ? String(row.courtFeeDetailJson)
                        : '{}',
                proceedingsJson:
                    typeof row.proceedingsJson === 'string' && row.proceedingsJson.trim() !== ''
                        ? row.proceedingsJson
                        : '[]',
                _persisted: true,
            }));
        } catch (e) {
            console.error('Fetch cases:', e);
            return [];
        }
    },
    async createCase(payload) {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/cases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `建立失敗 (${res.status})`);
        }
        return json.data;
    },
    async updateCase(id, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/cases/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `更新失敗 (${res.status})`);
        }
        return json.data;
    },
    async deleteCase(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/cases/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `刪除失敗 (${res.status})`);
        }
        return json.data;
    },
    async importCasesExcel(file, options = {}) {
        const form = new FormData();
        form.append('file', file);
        form.append('workspaceId', String(options.workspaceId || 'WS_001'));
        form.append('dryRun', options.dryRun === false ? 'false' : 'true');
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/cases/import-excel`, {
            method: 'POST',
            body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            if (res.status === 404) {
                throw new Error('匯入 API 不存在（目前後端為舊版）。請重啟 JCMS 後端後再試。');
            }
            throw new Error(json.error || `匯入失敗 (${res.status})`);
        }
        return json.data || {};
    },
    /** @param {string} category 與 uploads/{category} 子資料夾一致 */
    async uploadAttachment(category, file) {
        if (!file || !file.size) return { success: false, error: '未選擇檔案' };
        const fd = new FormData();
        fd.append('file', file);
        fd.append('originalFileName', file.name);
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/uploads/${encodeURIComponent(category)}`, {
                method: 'POST',
                body: fd,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                return { success: false, error: json.error || `上傳失敗 (${res.status})` };
            }
            return json;
        } catch (e) {
            return { success: false, error: String(e.message || e) };
        }
    },
    async fetchPersonalAdminBlob() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/personal/admin`);
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success || !json.data) return null;
            return json.data;
        } catch {
            return null;
        }
    },
    async savePersonalAdminBlob(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/personal/admin`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `儲存失敗 (${res.status})`);
        }
        return json.data;
    },
    async fetchCaseStatsBlob() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/case-stats`);
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success || !json.data) return null;
            return json.data;
        } catch {
            return null;
        }
    },
    async saveCaseStatsBlob(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/case-stats`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `儲存失敗 (${res.status})`);
        }
        return json.data;
    },
    async fetchPayscaleLatest() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/payscale-data/latest`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) return null;
        return json.data || null;
    },
    async fetchPayscaleVersions() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/payscale-data/versions`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) return [];
        return Array.isArray(json.data) ? json.data : [];
    },
    async fetchPayscaleVersionById(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/payscale-data/versions/${encodeURIComponent(id)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取失敗 (${res.status})`);
        return json.data;
    },
    async createPayscaleVersion(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/payscale-data/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `儲存俸表失敗 (${res.status})`);
        }
        return json.data;
    },
    async updatePayscaleVersion(id, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/payscale-data/versions/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            const hint404 =
                res.status === 404 || /^not\s*found$/i.test(String(json.error || '').trim())
                    ? ' 後端可能仍為舊版：請執行 Start-JCMS.bat（或 pm2 restart jcms-api）重啟後再試。'
                    : '';
            throw new Error((json.error || `更新俸表失敗 (${res.status})`) + hint404);
        }
        return json.data;
    },
    async deletePayscaleVersion(id) {
        const base = `${getJcmsApiBaseUrl()}/payscale-data/versions/${encodeURIComponent(id)}`;
        const tryPost = async () =>
            jcmsFetch(`${base}/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
        let res = await jcmsFetch(base, { method: 'DELETE' });
        let json = await res.json().catch(() => ({}));
        if (res.status === 404 || /^not\s*found$/i.test(String(json.error || '').trim())) {
            res = await tryPost();
            json = await res.json().catch(() => ({}));
        }
        if (!res.ok || json.success === false) {
            const hint404 =
                res.status === 404 || /^not\s*found$/i.test(String(json.error || '').trim())
                    ? ' 後端可能仍為舊版：請執行 Start-JCMS.bat（或 pm2 restart jcms-api）重啟後再試。'
                    : '';
            throw new Error((json.error || `刪除俸表失敗 (${res.status})`) + hint404);
        }
        return true;
    },
    async fetchAppSettings() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/settings/app`);
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success || !json.data) return null;
            return json.data;
        } catch {
            return null;
        }
    },
    async saveAppSettings(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/settings/app`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `儲存失敗 (${res.status})`);
        }
        return json.data;
    },
    async downloadAppDbBackup() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/settings/db-backup`);
        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error || `備份匯出失敗 (${res.status})`);
        }
        const blob = await res.blob();
        let filename = 'app-backup.db';
        const cd = res.headers.get('Content-Disposition');
        if (cd) {
            const m = /filename="([^"]+)"/i.exec(cd);
            if (m) filename = m[1];
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    async fetchDynamicsPersons() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取人物 (${res.status})`);
        return Array.isArray(json.data) ? json.data : [];
    },
    async fetchDynamicsPerson(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons/${encodeURIComponent(id)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取人物 (${res.status})`);
        return json.data;
    },
    async createDynamicsPerson(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `建立人物 (${res.status})`);
        return json.data;
    },
    async updateDynamicsPerson(id, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `更新人物 (${res.status})`);
        return json.data;
    },
    async deleteDynamicsPerson(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `刪除人物 (${res.status})`);
        return json.data;
    },
    async createDynamicsPersonEvent(personId, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/persons/${encodeURIComponent(personId)}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `新增紀錄 (${res.status})`);
        return json.data;
    },
    async deleteDynamicsPersonEvent(personId, eventId) {
        const res = await jcmsFetch(
            `${getJcmsApiBaseUrl()}/dynamics/persons/${encodeURIComponent(personId)}/events/${encodeURIComponent(eventId)}`,
            { method: 'DELETE' }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `刪除紀錄 (${res.status})`);
        return json.data;
    },
    async postDynamicsImportBatch(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-batches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `匯入解析 (${res.status})`);
        return json;
    },
    /** 與批次匯入相同擷取規則，略過初稿審核，交易內直接寫入 dynamics_event */
    async postDynamicsStructuredCommit(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-structured/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `結構化直寫 (${res.status})`);
        return json;
    },
    async postDynamicsPipeCommit(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-pipe/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `管道直寫 (${res.status})`);
        return json;
    },
    async fetchDynamicsImportBatches(limit) {
        const q = limit != null ? `?limit=${encodeURIComponent(limit)}` : '';
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-batches${q}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取批次 (${res.status})`);
        return Array.isArray(json.data) ? json.data : [];
    },
    async fetchDynamicsImportBatch(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-batches/${encodeURIComponent(id)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取批次 (${res.status})`);
        return json.data;
    },
    async deleteDynamicsImportBatch(id) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/import-batches/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `刪除批次 (${res.status})`);
        return json.data;
    },
    async patchDynamicsProposal(id, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/proposals/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `更新提案 (${res.status})`);
        return json.data;
    },
    async fetchDynamicsSearch(q, limit) {
        const params = new URLSearchParams();
        if (q != null && String(q).trim()) params.set('q', String(q).trim());
        if (limit != null) params.set('limit', String(limit));
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/search?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `全文檢索 (${res.status})`);
        return Array.isArray(json.data) ? json.data : [];
    },
    async postDynamicsFtsRebuild() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/fts/rebuild`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `重建索引 (${res.status})`);
        return json.data;
    },
    async postDynamicsDedupeEvents() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/dedupe-events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `清除重複紀錄 (${res.status})`);
        return json.data;
    },
    async fetchDynamicsAllEvents(limit, offset) {
        const params = new URLSearchParams();
        if (limit != null) params.set('limit', String(limit));
        if (offset != null) params.set('offset', String(offset));
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/events?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `讀取紀錄總表 (${res.status})`);
        return Array.isArray(json.data) ? json.data : [];
    },
    async patchDynamicsEvent(eventId, payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/events/${encodeURIComponent(eventId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) throw new Error(json.error || `更新紀錄 (${res.status})`);
        return json.data;
    },
    async fetchJudgeCourtRosterMeta() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/judge-roster`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            const hint = json.path ? `（${json.path}）` : '';
            throw new Error((json.error || `讀取法官清單 (${res.status})`) + hint);
        }
        return json.data;
    },
    async postJudgeCourtRosterDpt(content) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/dynamics/judge-roster`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: String(content ?? '') }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            const hint = json.path ? ` ${json.path}` : '';
            throw new Error((json.error || `上傳法官清單 (${res.status})`) + hint);
        }
        return json.data;
    },
    getGoogleCalendarAuthUrl() {
        return `${getJcmsApiBaseUrl()}/google-calendar/auth`;
    },
    async fetchGoogleCalendarStatus() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/google-calendar/status`);
            if (!res.ok) return { configured: false, connected: false, email: '', configSource: 'none' };
            const json = await res.json();
            if (!json.success || !json.data) {
                return { configured: false, connected: false, email: '', configSource: 'none' };
            }
            return json.data;
        } catch {
            return { configured: false, connected: false, email: '', configSource: 'none' };
        }
    },
    async fetchGoogleCalendarOAuthConfig() {
        try {
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/google-calendar/oauth-config`);
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success || !json.data) return null;
            return json.data;
        } catch {
            return null;
        }
    },
    async saveGoogleCalendarOAuthConfig(payload) {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/google-calendar/oauth-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `儲存 OAuth 設定失敗 (${res.status})`);
        }
        return json.data;
    },
    async fetchGoogleCalendarEvents(weekOffset = 0) {
        try {
            const range = weekIsoRangeForOffset(weekOffset);
            if (!range) return [];
            const params = new URLSearchParams(range);
            const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/google-calendar/events?${params.toString()}`);
            if (!res.ok) return [];
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return [];
            return json.data;
        } catch {
            return [];
        }
    },
    async disconnectGoogleCalendar() {
        const res = await jcmsFetch(`${getJcmsApiBaseUrl()}/google-calendar/disconnect`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `中斷連結失敗 (${res.status})`);
        }
        return true;
    },
};