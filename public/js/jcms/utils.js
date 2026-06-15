/** 純函式：案件、日期、當事人樹等 */
export const util = {
    parseMoney: (val) => parseInt((val || '').toString().replace(/,/g, ''), 10) || 0,
    formatMoney: (val) => val === 0 ? '0' : (!val ? '' : Number(val).toLocaleString('en-US')),
    normalizeCaseWord(word) {
        return String(word || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/年/g, '')
            .replace(/字/g, '');
    },
    normalizeCaseNumber(number) {
        const digits = String(number || '').replace(/\D/g, '');
        if (!digits) return '';
        return String(parseInt(digits, 10) || 0);
    },
    formatCaseNoFromParts(year, word, number) {
        const y = String(year || '').trim();
        const w = util.normalizeCaseWord(word);
        const n = util.normalizeCaseNumber(number);
        return `${y}${w}${n}`;
    },
    /** 解析單欄案號字串（例：110簡上339）為年度、字別、號碼；無法辨識時盡力填入字別欄。 */
    parseCaseNoToParts(raw) {
        const t = String(raw || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/年/g, '');
        if (!t) return { year: '', word: '', number: '' };
        const m = t.match(/^(\d+)([^\d]+?)(\d+)$/);
        if (m) {
            return {
                year: m[1],
                word: util.normalizeCaseWord(m[2]),
                number: util.normalizeCaseNumber(m[3]),
            };
        }
        const headDigits = t.match(/^(\d+)/);
        const tailDigits = t.match(/(\d+)$/);
        if (headDigits && tailDigits && headDigits[1] !== tailDigits[1]) {
            const rest = t.slice(headDigits[1].length, t.length - tailDigits[1].length);
            if (rest && /[^\d]/.test(rest)) {
                return {
                    year: headDigits[1],
                    word: util.normalizeCaseWord(rest),
                    number: util.normalizeCaseNumber(tailDigits[1]),
                };
            }
        }
        if (/^\d+$/.test(t)) {
            return { year: t, word: '', number: '' };
        }
        return { year: '', word: util.normalizeCaseWord(t), number: '' };
    },
    newPartyId() {
        return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    },
    emptyPartyPerson() {
        return {
            id: util.newPartyId(),
            name: '',
            legalReps: [],
            litigationAgents: [],
            serviceAgents: [],
            specialAgents: [],
        };
    },
    emptyPartiesTree() {
        return { v: 1, active: [], passive: [] };
    },
    normalizeLegalRepRow(r) {
        if (!r || typeof r !== 'object') return null;
        return {
            id: String(r.id || util.newPartyId()),
            name: r.name != null ? String(r.name) : '',
            note: r.note != null ? String(r.note) : '',
        };
    },
    normalizeSubAgentRow(r) {
        if (!r || typeof r !== 'object') return null;
        return {
            id: String(r.id || util.newPartyId()),
            name: r.name != null ? String(r.name) : '',
        };
    },
    normalizeLitigationAgentRow(a) {
        if (!a || typeof a !== 'object') return null;
        const pt = String(a.proxyType || '').toLowerCase();
        const proxyType = pt === 'special' ? 'special' : 'ordinary';
        const subAgents = Array.isArray(a.subAgents)
            ? a.subAgents.map(util.normalizeSubAgentRow).filter(Boolean)
            : [];
        return {
            id: String(a.id || util.newPartyId()),
            name: a.name != null ? String(a.name) : '',
            mandatePages: a.mandatePages != null ? String(a.mandatePages) : '',
            proxyType,
            subAgents,
        };
    },
    normalizeServiceAgentRow(s) {
        if (!s || typeof s !== 'object') return null;
        return {
            id: String(s.id || util.newPartyId()),
            name: s.name != null ? String(s.name) : '',
            designatedPages: s.designatedPages != null ? String(s.designatedPages) : '',
        };
    },
    normalizeSpecialAgentRow(s) {
        if (!s || typeof s !== 'object') return null;
        return {
            id: String(s.id || util.newPartyId()),
            name: s.name != null ? String(s.name) : '',
            pages: s.pages != null ? String(s.pages) : '',
        };
    },
    normalizePartyPersonRow(p) {
        if (!p || typeof p !== 'object') return util.emptyPartyPerson();
        return {
            id: String(p.id || util.newPartyId()),
            name: p.name != null ? String(p.name) : '',
            legalReps: (Array.isArray(p.legalReps) ? p.legalReps : [])
                .map(util.normalizeLegalRepRow)
                .filter(Boolean),
            litigationAgents: (Array.isArray(p.litigationAgents) ? p.litigationAgents : [])
                .map(util.normalizeLitigationAgentRow)
                .filter(Boolean),
            serviceAgents: (Array.isArray(p.serviceAgents) ? p.serviceAgents : [])
                .map(util.normalizeServiceAgentRow)
                .filter(Boolean),
            specialAgents: (Array.isArray(p.specialAgents) ? p.specialAgents : [])
                .map(util.normalizeSpecialAgentRow)
                .filter(Boolean),
        };
    },
    normalizePartiesTree(o) {
        const empty = util.emptyPartiesTree();
        if (!o || typeof o !== 'object') return empty;
        empty.active = Array.isArray(o.active)
            ? o.active.map(util.normalizePartyPersonRow).filter(Boolean)
            : [];
        empty.passive = Array.isArray(o.passive)
            ? o.passive.map(util.normalizePartyPersonRow).filter(Boolean)
            : [];
        return empty;
    },
    parsePartiesJson(raw) {
        if (raw == null || raw === '') return util.emptyPartiesTree();
        try {
            const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return util.normalizePartiesTree(o && o.v === 1 ? o : {});
        } catch {
            return util.emptyPartiesTree();
        }
    },
    stringifyPartiesTree(tree) {
        return JSON.stringify(util.normalizePartiesTree(tree));
    },
    /** 成員字別：以空白分隔；讀取舊資料時先將逗號等轉成空白再切分。 */
    splitCaseWordMembers(text) {
        const s = String(text || '')
            .replace(/[,，、]/g, ' ')
            .trim();
        if (!s) return [];
        return s
            .split(/\s+/)
            .map((m) => util.normalizeCaseWord(m))
            .filter(Boolean);
    },
    joinCaseWordMembers(members) {
        if (!Array.isArray(members) || !members.length) return '';
        return members.map((m) => util.normalizeCaseWord(m)).filter(Boolean).join(' ');
    },
    parseProceedingsJson(str) {
        try {
            const p = JSON.parse(String(str || '[]'));
            return Array.isArray(p) ? p : [];
        } catch {
            return [];
        }
    },
    normalizeProceedingsList(arr) {
        if (!Array.isArray(arr)) return [];
        return arr
            .map((row) => {
                if (!row || typeof row !== 'object') return null;
                const d7 = util.normalizeRocDate7(row.dateRoc7);
                if (d7.length !== 7) return null;
                const content = row.content != null ? String(row.content) : '';
                const id =
                    row.id != null && String(row.id).trim() !== ''
                        ? String(row.id).trim()
                        : `pe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                return { id, dateRoc7: d7, content };
            })
            .filter(Boolean);
    },
    proceedingsJsonStringify(arr) {
        return JSON.stringify(util.normalizeProceedingsList(arr));
    },
    emptyCourtFeeDetail() {
        return {
            claimPages: '',
            g1CourtFee: '',
            g1CourtFeePages: '',
            g1Paid: '',
            g1PaidPages: '',
            g1PaidFull: false,
            g2CourtFee: '',
            g2CourtFeePages: '',
            g2Paid: '',
            g2PaidPages: '',
            g2PaidFull: false,
            reviewDateRoc7: '',
        };
    },
    hydrateCourtFeeDetail(jsonStr, legacyCourtFee) {
        const base = util.emptyCourtFeeDetail();
        let raw = {};
        try {
            if (typeof jsonStr === 'string' && jsonStr.trim()) {
                const p = JSON.parse(jsonStr);
                if (p && typeof p === 'object') raw = p;
            }
        } catch (_) {}
        base.claimPages = raw.claimPages != null ? String(raw.claimPages) : '';
        base.g1CourtFeePages = raw.g1CourtFeePages != null ? String(raw.g1CourtFeePages) : '';
        base.g1PaidPages = raw.g1PaidPages != null ? String(raw.g1PaidPages) : '';
        base.g2CourtFeePages = raw.g2CourtFeePages != null ? String(raw.g2CourtFeePages) : '';
        base.g2PaidPages = raw.g2PaidPages != null ? String(raw.g2PaidPages) : '';
        base.g1PaidFull = !!raw.g1PaidFull;
        base.g2PaidFull = !!raw.g2PaidFull;
        base.reviewDateRoc7 = util.normalizeRocDate7(raw.reviewDateRoc7 || '');
        const leg = legacyCourtFee != null ? String(legacyCourtFee).trim() : '';
        const g1Stored = raw.g1CourtFee != null ? String(raw.g1CourtFee) : '';
        base.g1CourtFee = g1Stored || leg || '';
        base.g1Paid = raw.g1Paid != null ? String(raw.g1Paid) : '';
        base.g2CourtFee = raw.g2CourtFee != null ? String(raw.g2CourtFee) : '';
        base.g2Paid = raw.g2Paid != null ? String(raw.g2Paid) : '';
        return base;
    },
    serializeCourtFeeDetailJson(detail) {
        const d = detail && typeof detail === 'object' ? detail : util.emptyCourtFeeDetail();
        return JSON.stringify({
            claimPages: String(d.claimPages ?? ''),
            g1CourtFee: String(d.g1CourtFee ?? ''),
            g1CourtFeePages: String(d.g1CourtFeePages ?? ''),
            g1Paid: String(d.g1Paid ?? ''),
            g1PaidPages: String(d.g1PaidPages ?? ''),
            g1PaidFull: !!d.g1PaidFull,
            g2CourtFee: String(d.g2CourtFee ?? ''),
            g2CourtFeePages: String(d.g2CourtFeePages ?? ''),
            g2Paid: String(d.g2Paid ?? ''),
            g2PaidPages: String(d.g2PaidPages ?? ''),
            g2PaidFull: !!d.g2PaidFull,
            reviewDateRoc7: util.normalizeRocDate7(d.reviewDateRoc7 || ''),
        });
    },
    /** 行事曆「下次開庭」：僅依進行情形（proceedingsJson），取今日（含）起最早日期；無進行或未來日期則空字串 */
    nextProceedDateRoc7FromToday(c) {
        const list = util.normalizeProceedingsList(util.parseProceedingsJson(c && c.proceedingsJson));
        if (!list.length) return '';
        const today = util.todayRocDate7();
        if (!today) return '';
        const ds = [
            ...new Set(
                list
                    .map((r) => util.normalizeRocDate7(r.dateRoc7))
                    .filter((d) => d.length === 7 && util.rocDate7ToIso(d))
            ),
        ].sort();
        const hit = ds.find((d) => d >= today);
        return hit || '';
    },
    getMins: (timeStr) => {
        if (!timeStr || timeStr.length < 3) return 0;
        const s = timeStr.padStart(4, '0');
        return (parseInt(s.slice(0, 2)) || 0) * 60 + (parseInt(s.slice(2, 4)) || 0);
    },
    parseTWDate: (str) => {
        const d7 = String(str || '').replace(/\D/g, '');
        if (d7.length < 7) return null;
        const y = parseInt(d7.slice(0, 3), 10) + 1911;
        const m = parseInt(d7.slice(3, 5), 10) - 1;
        const day = parseInt(d7.slice(5, 7), 10);
        const date = new Date(y, m, day);
        return isNaN(date.getTime()) ? null : date;
    },
    moneyBlur: (obj, field, allowZero = false) => {
        const raw = String(obj[field] ?? '').replace(/,/g, '').trim();
        if (!raw) {
            obj[field] = '';
            return;
        }
        const v = util.parseMoney(raw);
        obj[field] = v === 0 && !allowZero ? '' : util.formatMoney(v);
    },
    moneyFocus: (obj, field, allowZero = false, el = null) => {
        const raw = String(obj[field] ?? '');
        const trimmed = raw.replace(/,/g, '').trim();
        const digitBefore =
            el && el.selectionStart != null ? raw.slice(0, el.selectionStart).replace(/,/g, '').length : null;
        if (!trimmed) {
            obj[field] = '';
        } else {
            const v = util.parseMoney(trimmed);
            obj[field] = v === 0 && !allowZero ? '' : String(v);
        }
        if (el && digitBefore != null && /,/.test(raw)) {
            requestAnimationFrame(() => {
                const next = String(obj[field] ?? '');
                const pos = Math.min(digitBefore, next.length);
                try {
                    el.setSelectionRange(pos, pos);
                } catch (_) {
                    /* ignore */
                }
            });
        }
    },
    normalizeRocDate7(s) {
        return String(s || '').replace(/\D/g, '').slice(0, 7);
    },
    rocDate7ToIso(roc7) {
        const s = util.normalizeRocDate7(roc7);
        if (s.length !== 7) return null;
        const ry = parseInt(s.slice(0, 3), 10);
        const m = parseInt(s.slice(3, 5), 10);
        const d = parseInt(s.slice(5, 7), 10);
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        const gy = ry + 1911;
        const dt = new Date(gy, m - 1, d);
        if (dt.getFullYear() !== gy || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return `${gy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    },
    isoToRocDate7(iso) {
        if (!iso) return '';
        const part = String(iso).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return '';
        const d = new Date(`${part}T12:00:00`);
        if (isNaN(d.getTime())) return '';
        const ry = d.getFullYear() - 1911;
        return `${String(ry).padStart(3, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    },
    /** 本機系統日曆之當日（非 UTC 日期；避免跨日時段顯示成前一日／隔日） */
    todayRocDate7() {
        const d = new Date();
        const gy = d.getFullYear();
        const gm = String(d.getMonth() + 1).padStart(2, '0');
        const gd = String(d.getDate()).padStart(2, '0');
        return util.isoToRocDate7(`${gy}-${gm}-${gd}`) || '';
    },
    toRocDate7FromAny(val) {
        if (val == null || val === '') return '';
        const v = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
            const iso7 = util.isoToRocDate7(v.slice(0, 10));
            if (iso7.length === 7) return iso7;
        }
        const digits = v.replace(/\D/g, '');
        if (digits.length === 7 && /^\d{7}$/.test(digits)) return digits;
        if (digits.length > 7 && /^\d+$/.test(digits.slice(0, 7))) return digits.slice(0, 7);
        const m = v.match(/^(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/);
        if (m) {
            return `${String(parseInt(m[1], 10)).padStart(3, '0')}${String(parseInt(m[2], 10)).padStart(2, '0')}${String(parseInt(m[3], 10)).padStart(2, '0')}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return util.isoToRocDate7(v);
        return digits.length >= 7 ? digits.slice(0, 7) : '';
    },
    normalizeRocMonth5(s) {
        return String(s || '').replace(/\D/g, '').slice(0, 5);
    },
    rocMonth5ToYyyyMm(roc5) {
        const s = util.normalizeRocMonth5(roc5);
        if (s.length !== 5) return '';
        const ry = parseInt(s.slice(0, 3), 10);
        const m = parseInt(s.slice(3, 5), 10);
        if (m < 1 || m > 12 || ry < 0 || ry > 300) return '';
        const gy = ry + 1911;
        return `${gy}-${String(m).padStart(2, '0')}`;
    },
    yyyyMmToRocMonth5(yyyyMm) {
        if (!yyyyMm || typeof yyyyMm !== 'string') return '';
        const m = yyyyMm.match(/^(\d{4})-(\d{2})$/);
        if (!m) return '';
        const gy = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        if (mo < 1 || mo > 12) return '';
        const ry = gy - 1911;
        return `${String(ry).padStart(3, '0')}${String(mo).padStart(2, '0')}`;
    },
    normalizeRocTime4(s) {
        return String(s || '').replace(/\D/g, '').slice(0, 4);
    },
    hhmmToRocTime4(hhmm) {
        if (!hhmm) return '';
        const p = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
        if (!p) return util.normalizeRocTime4(hhmm);
        return `${String(parseInt(p[1], 10)).padStart(2, '0')}${String(parseInt(p[2], 10)).padStart(2, '0')}`;
    },
    rocTime4ToHHMM(t4) {
        const s = util.normalizeRocTime4(t4);
        if (s.length !== 4) return '';
        const hh = parseInt(s.slice(0, 2), 10);
        const mm = parseInt(s.slice(2, 4), 10);
        if (hh > 23 || mm > 59) return '';
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
    formatDateDisplay(val) {
        if (val == null || val === '') return '';
        const v = String(val).trim();
        if (/^\d{7}$/.test(v)) return v;
        return util.toRocDate7FromAny(v) || v;
    },
    formatMonthDisplay(val) {
        if (val == null || val === '') return '';
        const v = String(val).trim();
        const d5 = v.replace(/\D/g, '');
        if (d5.length === 5 && /^\d{5}$/.test(d5)) return d5;
        if (/^\d{4}-\d{2}$/.test(v)) return util.yyyyMmToRocMonth5(v) || v;
        return v;
    },
    formatRocFromIso(iso) {
        if (!iso) return '';
        if (/^\d{7}$/.test(String(iso))) return String(iso);
        const s = String(iso);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) return util.isoToRocDate7(s.slice(0, 10));
        return util.formatDateDisplay(iso);
    },
    /** 後端 case 欄位（不含 Vue / 前端狀態） */
    toApiPayload(c) {
        return {
            id: String(c.id),
            isPinned: !!c.isPinned,
            seqTotal: c.seqTotal === '' || c.seqTotal == null ? null : (parseInt(String(c.seqTotal), 10) || null),
            year: c.year ?? null,
            word: c.word ?? null,
            number: c.number ?? null,
            reason: c.reason ?? null,
            activeParty: c.activeParty ?? null,
            passiveParty: c.passiveParty ?? null,
            dates: c.dates ?? null,
            closeDate: c.closeDate ?? null,
            closeReason: c.closeReason ?? null,
            targetAmount: c.targetAmount ?? null,
            judgmentAmount: c.judgmentAmount ?? null,
            note: c.note ?? null,
            workspaceId:
                c.workspaceId != null && String(c.workspaceId).trim() !== ''
                    ? String(c.workspaceId).trim()
                    : null,
            filingDateRoc7: (() => {
                const d = util.normalizeRocDate7(c.filingDateRoc7);
                return d.length === 7 ? d : null;
            })(),
            courtFee: (() => {
                const det = c.courtFeeDetail;
                if (det && String(det.g1CourtFee ?? '').trim() !== '') {
                    const v = util.parseMoney(det.g1CourtFee);
                    return v === 0 ? null : util.formatMoney(v);
                }
                return c.courtFee != null && String(c.courtFee).trim() !== '' ? String(c.courtFee) : null;
            })(),
            courtFeeDetailJson: util.serializeCourtFeeDetailJson(c.courtFeeDetail),
            proceedingsJson: util.proceedingsJsonStringify(
                Array.isArray(c.proceedingsJson)
                    ? c.proceedingsJson
                    : util.parseProceedingsJson(c.proceedingsJson)
            ),
            partiesJson: util.stringifyPartiesTree(util.parsePartiesJson(c.partiesJson)),
        };
    },
    mergeCaseRow(target, data) {
        if (!data) return;
        Object.assign(target, data);
        target.isPinned = !!data.isPinned;
        if (Object.prototype.hasOwnProperty.call(data, 'workspaceId')) {
            target.workspaceId = data.workspaceId;
        }
        if (Object.prototype.hasOwnProperty.call(data, 'filingDateRoc7')) {
            const v = data.filingDateRoc7;
            target.filingDateRoc7 =
                v != null && String(v).replace(/\D/g, '').length >= 7
                    ? String(v).replace(/\D/g, '').slice(0, 7)
                    : '';
        }
        if (Object.prototype.hasOwnProperty.call(data, 'courtFee')) {
            target.courtFee = data.courtFee == null ? '' : String(data.courtFee);
        }
        if (Object.prototype.hasOwnProperty.call(data, 'courtFeeDetailJson')) {
            target.courtFeeDetail = util.hydrateCourtFeeDetail(
                data.courtFeeDetailJson,
                data.courtFee != null ? data.courtFee : target.courtFee
            );
            target.courtFeeDetailJson =
                typeof data.courtFeeDetailJson === 'string' ? data.courtFeeDetailJson : '{}';
        }
        if (Object.prototype.hasOwnProperty.call(data, 'proceedingsJson')) {
            const raw = data.proceedingsJson;
            target.proceedingsJson =
                typeof raw === 'string' ? raw : util.proceedingsJsonStringify(raw || []);
        }
        if (Object.prototype.hasOwnProperty.call(data, 'partiesJson')) {
            const raw = data.partiesJson;
            target.partiesJson =
                typeof raw === 'string' ? raw : util.stringifyPartiesTree(util.parsePartiesJson(raw));
        }
        target._persisted = true;
    }
};