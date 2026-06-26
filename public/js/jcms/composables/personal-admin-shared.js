/** 個人行政：薪資／俸表／職涯／差勤共用常數與純函式 */
import { util } from '../utils.js?v=0.1.20260626';
import {
    getTaiwanGovHolidayDisplayLabel,
    isTaiwanGovHoliday,
} from './use-taiwan-holidays.js?v=0.1.20260626';


export function buildThisWeekSchedule(weekOffset = 0) {
    const realToday = new Date();
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const dow = base.getDay();
    const monOffset = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(base);
    mon.setDate(base.getDate() + monOffset);
    const pad = (n) => String(n).padStart(2, '0');
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        const fullDate = util.isoToRocDate7(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        );
        days.push({
            fullDate,
            label: pad(d.getDate()),
            day: labels[i],
            isToday: d.toDateString() === realToday.toDateString(),
            isHoliday: isTaiwanGovHoliday(fullDate),
            holidayLabel: getTaiwanGovHolidayDisplayLabel(fullDate),
            events: [],
        });
    }
    const start7 = days[0].fullDate;
    const end7 = days[6].fullDate;
    const weekRange = `${start7} — ${end7}`;
    return { days, weekRange };
}

export const MONTH_DOW_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** 月行事曆格線（週一為一週起始，含前後月補齊列） */
export function buildMonthSchedule(monthOffset = 0) {
    const realToday = new Date();
    const ref = new Date(realToday.getFullYear(), realToday.getMonth() + monthOffset, 1);
    const year = ref.getFullYear();
    const monthIdx = ref.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const firstOfMonth = new Date(year, monthIdx, 1);
    const lastOfMonth = new Date(year, monthIdx + 1, 0);

    const gridStart = new Date(firstOfMonth);
    const startDow = gridStart.getDay();
    gridStart.setDate(gridStart.getDate() + (startDow === 0 ? -6 : 1 - startDow));

    const gridEnd = new Date(lastOfMonth);
    const endDow = gridEnd.getDay();
    if (endDow !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDow));

    const weeks = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(cursor);
            d.setDate(cursor.getDate() + i);
            const fullDate = util.isoToRocDate7(
                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
            );
            days.push({
                fullDate,
                label: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
                day: MONTH_DOW_LABELS[i],
                isToday: d.toDateString() === realToday.toDateString(),
                isHoliday: isTaiwanGovHoliday(fullDate),
                holidayLabel: getTaiwanGovHolidayDisplayLabel(fullDate),
                isCurrentMonth: d.getMonth() === monthIdx,
                events: [],
            });
        }
        weeks.push({ days });
        cursor.setDate(cursor.getDate() + 7);
    }

    const firstRoc5 = util.isoToRocDate7(`${year}-${pad(monthIdx + 1)}-01`);
    const monthRange =
        firstRoc5.length === 7
            ? `${firstRoc5.slice(0, 3)}年${firstRoc5.slice(3, 5)}月`
            : `${year}年${pad(monthIdx + 1)}月`;

    return { weeks, monthRange };
}

/** 連續月曆：週一為起始，前後各 monthRadius 個月 */
export function buildContinuousCalendarSchedule(options = {}) {
    const realToday = new Date();
    const monthRadius = Number(options.monthRadius) > 0 ? Number(options.monthRadius) : 24;
    const pad = (n) => String(n).padStart(2, '0');

    const rangeStart = new Date(realToday.getFullYear(), realToday.getMonth() - monthRadius, 1);
    const gridStart = new Date(rangeStart);
    const startDow = gridStart.getDay();
    gridStart.setDate(gridStart.getDate() + (startDow === 0 ? -6 : 1 - startDow));

    const rangeEnd = new Date(realToday.getFullYear(), realToday.getMonth() + monthRadius + 1, 0);
    const gridEnd = new Date(rangeEnd);
    const endDow = gridEnd.getDay();
    if (endDow !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDow));

    const weeks = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(cursor);
            d.setDate(cursor.getDate() + i);
            const fullDate = util.isoToRocDate7(
                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
            );
            days.push({
                fullDate,
                label: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`,
                day: MONTH_DOW_LABELS[i],
                isToday: d.toDateString() === realToday.toDateString(),
                isHoliday: isTaiwanGovHoliday(fullDate),
                holidayLabel: getTaiwanGovHolidayDisplayLabel(fullDate),
                events: [],
            });
        }
        weeks.push({
            days,
            weekStart: days[0].fullDate,
            weekEnd: days[6].fullDate,
        });
        cursor.setDate(cursor.getDate() + 7);
    }

    return { weeks };
}

export function formatCalendarViewMonthLabel(monthOffset = 0) {
    const realToday = new Date();
    const ref = new Date(realToday.getFullYear(), realToday.getMonth() + monthOffset, 1);
    const pad = (n) => String(n).padStart(2, '0');
    const firstRoc5 = util.isoToRocDate7(
        `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-01`
    );
    if (firstRoc5.length === 7) {
        return `${firstRoc5.slice(0, 3)}年${firstRoc5.slice(3, 5)}月`;
    }
    return `${ref.getFullYear()}年${pad(ref.getMonth() + 1)}月`;
}

export function findTodayWeekIndex(weeks) {
    if (!Array.isArray(weeks)) return -1;
    return weeks.findIndex((week) => (week.days || []).some((d) => d.isToday));
}

export function findWeekIndexForRocDate(weeks, roc7) {
    const r = util.normalizeRocDate7(roc7);
    if (r.length !== 7 || !Array.isArray(weeks)) return -1;
    return weeks.findIndex((week) => {
        const start = week.weekStart || week.days?.[0]?.fullDate;
        const end = week.weekEnd || week.days?.[6]?.fullDate;
        if (!start || !end) return false;
        return compareRocDate7(start, r) <= 0 && compareRocDate7(r, end) <= 0;
    });
}

function compareRocDate7(a, b) {
    return String(a || '').localeCompare(String(b || ''));
}

function clipRocDate7ToWeek(roc7, weekStart, weekEnd) {
    const r = util.normalizeRocDate7(roc7);
    if (r.length !== 7) return '';
    if (compareRocDate7(r, weekStart) < 0) return weekStart;
    if (compareRocDate7(r, weekEnd) > 0) return weekEnd;
    return r;
}

const TAIPEI_TZ = 'Asia/Taipei';

function taipeiPartsFromDateTime(dateTime) {
    const d = new Date(dateTime);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TAIPEI_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return {
        iso: `${get('year')}-${get('month')}-${get('day')}`,
        hhmm: `${hour}${get('minute')}`,
    };
}

function isoDateMinusOneDay(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
    if (!m) return '';
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

/** Google 事件：由 API 回傳之 googleStart／googleEnd 推算跨日區間（全日或定時跨日） */
function enrichGoogleCalendarEvent(ev) {
    if (!ev?.isGoogle) return ev;
    const gs = ev.googleStart;
    const ge = ev.googleEnd;
    if (!gs || typeof gs !== 'object') return ev;

    if (gs.date && !gs.dateTime) {
        const startRoc7 = util.toRocDate7FromAny(gs.date);
        if (startRoc7.length !== 7) return ev;
        let endRoc7 = startRoc7;
        const exclusiveEnd = String(ge?.date || '').trim();
        if (exclusiveEnd && exclusiveEnd > String(gs.date || '')) {
            endRoc7 = util.toRocDate7FromAny(isoDateMinusOneDay(exclusiveEnd)) || startRoc7;
        }
        return { ...ev, dateRoc: startRoc7, startRoc7, endRoc7, time: '' };
    }

    if (gs.dateTime) {
        const startParts = taipeiPartsFromDateTime(gs.dateTime);
        const endParts = taipeiPartsFromDateTime(ge?.dateTime || gs.dateTime);
        if (!startParts) return ev;
        const startRoc7 = util.toRocDate7FromAny(startParts.iso);
        const endRoc7 = util.toRocDate7FromAny(endParts?.iso || startParts.iso) || startRoc7;
        if (startRoc7.length !== 7) return ev;
        const spansDays = compareRocDate7(startRoc7, endRoc7) !== 0;
        return {
            ...ev,
            dateRoc: startRoc7,
            startRoc7,
            endRoc7: endRoc7.length === 7 ? endRoc7 : startRoc7,
            time: spansDays ? '' : util.normalizeRocTime4(startParts.hhmm),
        };
    }

    return ev;
}

function mapCalendarEventView(e) {
    const dateRoc = util.toRocDate7FromAny(e?.dateRoc || e?.dateIso || '');
    const startRoc7 = util.toRocDate7FromAny(e?.startRoc7 || dateRoc);
    const endRoc7 = util.toRocDate7FromAny(e?.endRoc7 || startRoc7 || dateRoc);
    let time = String(e?.time || '');
    if (time.includes(':')) time = util.hhmmToRocTime4(time);
    else time = util.normalizeRocTime4(time);
    return {
        id: e?.id,
        dateRoc,
        startRoc7,
        endRoc7,
        time,
        title: e?.title || '（無標題）',
        isCase: !!e?.isCase,
        isLinked: !!e?.isLinked,
        isGoogle: !!e?.isGoogle,
        linkTarget: e?.linkTarget || null,
        googleStart: e?.googleStart || null,
        googleEnd: e?.googleEnd || null,
    };
}

function spanBarsOverlap(a, b) {
    const aEnd = a.startCol + a.spanCols - 1;
    const bEnd = b.startCol + b.spanCols - 1;
    return !(aEnd < b.startCol || bEnd < a.startCol);
}

function assignWeekSpanBarRows(bars) {
    const sorted = [...bars].sort(
        (a, b) => a.startCol - b.startCol || b.spanCols - a.spanCols
    );
    const rows = [];
    return sorted.map((bar) => {
        let rowIdx = 0;
        while (true) {
            if (!rows[rowIdx]) rows[rowIdx] = [];
            const conflict = rows[rowIdx].some((placed) => spanBarsOverlap(placed, bar));
            if (!conflict) {
                rows[rowIdx].push(bar);
                return { ...bar, row: rowIdx + 1 };
            }
            rowIdx += 1;
        }
    });
}

function buildWeekSpanBars(spanEvents, weekDays) {
    const weekStart = weekDays[0].fullDate;
    const weekEnd = weekDays[6].fullDate;
    const bars = [];
    for (const ev of spanEvents) {
        const start = ev.startRoc7 || ev.dateRoc;
        const end = ev.endRoc7 || start;
        if (compareRocDate7(start, end) === 0) continue;
        if (compareRocDate7(end, weekStart) < 0 || compareRocDate7(start, weekEnd) > 0) continue;
        const effStart = clipRocDate7ToWeek(start, weekStart, weekEnd);
        const effEnd = clipRocDate7ToWeek(end, weekStart, weekEnd);
        const startIdx = weekDays.findIndex((d) => d.fullDate === effStart);
        const endIdx = weekDays.findIndex((d) => d.fullDate === effEnd);
        if (startIdx < 0 || endIdx < 0) continue;
        bars.push({
            ...ev,
            startCol: startIdx + 1,
            spanCols: endIdx - startIdx + 1,
        });
    }
    return assignWeekSpanBarRows(bars);
}

function enrichWeekDaysWithEvents(weekDays, singleDayEvents, spanEvents) {
    const weekSpanBars = buildWeekSpanBars(spanEvents, weekDays);
    const weekBodyGridRow =
        weekSpanBars.reduce((max, bar) => Math.max(max, bar.row || 0), 0) + 2;
    const days = weekDays.map((day, dayIdx) => {
        const dayEvents = singleDayEvents.filter(
            (e) => (e.dateRoc || e.startRoc7) === day.fullDate
        );
        const allDayEvents = dayEvents
            .filter((e) => !e.time)
            .sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hant'));
        const timedEvents = dayEvents
            .filter((e) => !!e.time)
            .sort((a, b) => String(a.time).localeCompare(String(b.time)));
        const spanCovered = weekSpanBars.some((bar) => {
            const col = dayIdx + 1;
            return col >= bar.startCol && col < bar.startCol + bar.spanCols;
        });
        return {
            ...day,
            allDayEvents,
            timedEvents,
            spanCovered,
        };
    });
    return { days, spanBars: weekSpanBars, bodyGridRow: weekBodyGridRow };
}

function collectCalendarEventsForSync(personalAdmin, options = {}) {
    const linkedEvents = Array.isArray(options.linkedEvents) ? options.linkedEvents : [];
    const allEvents = [
        ...(Array.isArray(personalAdmin.calendarEvents) ? personalAdmin.calendarEvents : []),
        ...linkedEvents,
    ]
        .map((e) => mapCalendarEventView(enrichGoogleCalendarEvent(e)))
        .filter((e) => e.dateRoc.length === 7 || e.startRoc7.length === 7);

    return {
        spanEvents: allEvents.filter((e) => compareRocDate7(e.startRoc7, e.endRoc7) !== 0),
        singleDayEvents: allEvents.filter((e) => compareRocDate7(e.startRoc7, e.endRoc7) === 0),
    };
}

export function syncCalendarWeek(personalAdmin, eventsTarget, options = {}) {
    const off = typeof eventsTarget.weekOffset === 'number' ? eventsTarget.weekOffset : 0;
    const { days, weekRange } = buildThisWeekSchedule(off);
    eventsTarget.weekRange = weekRange;
    const { spanEvents, singleDayEvents } = collectCalendarEventsForSync(personalAdmin, options);
    const enriched = enrichWeekDaysWithEvents(days, singleDayEvents, spanEvents);
    eventsTarget.weekSpanBars = enriched.spanBars;
    eventsTarget.weekBodyGridRow = enriched.bodyGridRow;
    eventsTarget.weeklySchedule = enriched.days;
}

export function syncCalendarScroll(personalAdmin, eventsTarget, options = {}) {
    const baseWeeks = Array.isArray(options.scrollWeeksBase)
        ? options.scrollWeeksBase
        : buildContinuousCalendarSchedule(options.continuous || {}).weeks;
    const off =
        typeof eventsTarget.calendarViewMonthOffset === 'number'
            ? eventsTarget.calendarViewMonthOffset
            : 0;
    eventsTarget.monthRange = formatCalendarViewMonthLabel(off);
    const { spanEvents, singleDayEvents } = collectCalendarEventsForSync(personalAdmin, options);
    eventsTarget.scrollWeeks = baseWeeks.map((week) => ({
        ...enrichWeekDaysWithEvents(week.days, singleDayEvents, spanEvents),
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
    }));
}

export const PERSONAL_ADMIN_KEY = 'jcms_personal_admin_v1';

export function readPersonalAdminRaw() {
    try {
        const r = localStorage.getItem(PERSONAL_ADMIN_KEY);
        return r ? JSON.parse(r) : null;
    } catch {
        return null;
    }
}

export function migrateOvertimeEntry(e) {
    const x = { ...e };
    const d7 = x.dateRoc ? util.normalizeRocDate7(x.dateRoc) : util.isoToRocDate7(String(x.dateIso || '').slice(0, 10));
    x.dateRoc = d7;
    x.dateIso = d7 ? util.rocDate7ToIso(d7) : x.dateIso;
    if (x.note == null) x.note = '';
    if (x.otDeclared == null) x.otDeclared = !!x.claimedMonthlyOtPay;
    else x.otDeclared = !!x.otDeclared;
    delete x.claimedMonthlyOtPay;
    return x;
}

export function leaveRecordDaysFromSpan(x) {
    const a = util.normalizeRocDate7(util.toRocDate7FromAny(x.startRoc7 || x.startIso || ''));
    const b = util.normalizeRocDate7(util.toRocDate7FromAny(x.endRoc7 || x.endIso || ''));
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

export function migrateLeaveRecord(e) {
    const x = { ...e };
    x.startRoc7 = util.toRocDate7FromAny(x.startRoc7 || x.startIso || '');
    x.endRoc7 = util.toRocDate7FromAny(x.endRoc7 || x.endIso || '');
    if (x.proxyDivision == null) x.proxyDivision = '';
    if (x.leaveHoursHH == null || x.leaveHoursHH === '') x.leaveHoursHH = 0;
    if (x.leaveDaysDD == null || x.leaveDaysDD === '') {
        x.leaveDaysDD = leaveRecordDaysFromSpan(x);
    }
    if (x.leaveStartRocTime4 == null) x.leaveStartRocTime4 = '';
    if (x.leaveEndRocTime4 == null) x.leaveEndRocTime4 = '';
    return x;
}

export function mergeAttendanceLeaveYearSettingsFromPayload(p) {
    const legacy =
        p.attendanceLeaveYearDayQuotas && typeof p.attendanceLeaveYearDayQuotas === 'object'
            ? p.attendanceLeaveYearDayQuotas
            : {};
    const cur =
        p.attendanceLeaveYearSettings && typeof p.attendanceLeaveYearSettings === 'object'
            ? p.attendanceLeaveYearSettings
            : {};
    const keys = new Set([...Object.keys(legacy), ...Object.keys(cur)]);
    const out = {};
    for (const k of keys) {
        const row = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
        const leg = legacy[k];
        const qLegacy =
            leg !== undefined && leg !== null && leg !== '' && Number.isFinite(Number(leg)) ? Math.max(0, Number(leg)) : undefined;
        out[k] = {
            quotaDays:
                row.quotaDays !== undefined && row.quotaDays !== null && row.quotaDays !== ''
                    ? Math.max(0, Number(row.quotaDays) || 0)
                    : qLegacy !== undefined
                      ? qLegacy
                      : 0,
            mandatoryRestDays: Math.max(0, Number(row.mandatoryRestDays) || 0),
            mandatoryRestDateRoc7: String(row.mandatoryRestDateRoc7 || '').replace(/\D/g, '').slice(0, 7),
            travelCardSubsidy: row.travelCardSubsidy === 'received' ? 'received' : 'not_received',
        };
    }
    return out;
}

export const SALARY_YEAR_ROWS = [
    { id: 'final', label: '年終' },
    { id: 'eval', label: '職評' },
    { id: 'leave', label: '休假' },
    ...Array.from({ length: 12 }, (_, i) => ({
        id: 'm' + String(i + 1).padStart(2, '0'),
        label: `${i + 1}月`,
    })),
];
export const SALARY_YEAR_ROW_IDS = SALARY_YEAR_ROWS.map((r) => r.id);

export const SALARY_ADD_COLS = [
    { key: 'addPay', label: '本俸' },
    { key: 'addProf', label: '專業加給' },
    { key: 'addSuper', label: '主管加給' },
    { key: 'addOT', label: '加班費' },
    { key: 'addDutyFee', label: '值班費' },
    { key: 'addOther', label: '其他' },
];
export const SALARY_SUB_COLS = [
    { key: 'subTax', label: '所得稅' },
    { key: 'subPension', label: '退撫金' },
    { key: 'subIns', label: '保險費' },
    { key: 'subHealth', label: '健保費' },
    { key: 'subHousingRec', label: '房屋津貼收回' },
    { key: 'subDorm', label: '宿舍管理費' },
    { key: 'subOther', label: '其他' },
];
export const SALARY_ADD_INPUT_KEYS = SALARY_ADD_COLS.map((c) => c.key);
export const SALARY_SUB_INPUT_KEYS = SALARY_SUB_COLS.map((c) => c.key);

export function migrateSalaryCustomCols(raw) {
    const empty = { add: [], sub: [] };
    if (!raw || typeof raw !== 'object') return empty;
    const norm = (list, prefix) =>
        (Array.isArray(list) ? list : [])
            .map((c) => ({
                id: String(c?.id || '').trim(),
                label: String(c?.label || '').trim(),
            }))
            .filter((c) => c.id.startsWith(prefix) && c.label);
    return {
        add: norm(raw.add, 'addCustom_'),
        sub: norm(raw.sub, 'subCustom_'),
    };
}

export function getSalaryYearCustomCols(entry) {
    return migrateSalaryCustomCols(entry?.customCols);
}

export function mergeSalaryAddCols(customCols) {
    const extra = (customCols?.add || []).map((c) => ({
        key: c.id,
        label: c.label,
        custom: true,
    }));
    return [...SALARY_ADD_COLS, ...extra];
}

export function mergeSalarySubCols(customCols) {
    const extra = (customCols?.sub || []).map((c) => ({
        key: c.id,
        label: c.label,
        custom: true,
    }));
    return [...SALARY_SUB_COLS, ...extra];
}

function migrateSalaryHiddenCols(raw) {
    const empty = { add: [], sub: [] };
    if (!raw || typeof raw !== 'object') return empty;
    const norm = (list, builtins) => {
        const allowed = new Set(builtins.map((c) => c.key));
        return (Array.isArray(list) ? list : [])
            .map((k) => String(k || '').trim())
            .filter((k) => allowed.has(k) || k.startsWith('addCustom_') || k.startsWith('subCustom_'));
    };
    return {
        add: norm(raw.add, SALARY_ADD_COLS),
        sub: norm(raw.sub, SALARY_SUB_COLS),
    };
}

function migrateSalaryColLabels(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((k) => {
        const label = String(raw[k] || '').trim();
        if (k && label) out[k] = label;
    });
    return out;
}

function migrateSalaryRowLabels(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach((k) => {
        const label = String(raw[k] || '').trim();
        if (k && SALARY_YEAR_ROW_IDS.includes(k) && label) out[k] = label;
    });
    return out;
}

function migrateSalaryCustomRows(raw) {
    return (Array.isArray(raw) ? raw : [])
        .map((r) => ({
            id: String(r?.id || '').trim(),
            label: String(r?.label || '').trim(),
        }))
        .filter((r) => r.id.startsWith('rowCustom_') && r.label);
}

function migrateSalaryHiddenRows(raw) {
    return (Array.isArray(raw) ? raw : [])
        .map((id) => String(id || '').trim())
        .filter((id) => SALARY_YEAR_ROW_IDS.includes(id) || id.startsWith('rowCustom_'));
}

/** 唯讀正規化：供 computed／渲染使用，不寫回 reactive 物件（避免觸發無限更新） */
export function readSalaryYearEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return {
            rows: {},
            customCols: migrateSalaryCustomCols(null),
            colLabels: {},
            rowLabels: {},
            hiddenCols: migrateSalaryHiddenCols(null),
            customRows: [],
            hiddenRows: [],
            note: '',
        };
    }
    return {
        rows: entry.rows && typeof entry.rows === 'object' ? entry.rows : {},
        customCols: migrateSalaryCustomCols(entry.customCols),
        colLabels: migrateSalaryColLabels(entry.colLabels),
        rowLabels: migrateSalaryRowLabels(entry.rowLabels),
        hiddenCols: migrateSalaryHiddenCols(entry.hiddenCols),
        customRows: migrateSalaryCustomRows(entry.customRows),
        hiddenRows: migrateSalaryHiddenRows(entry.hiddenRows),
        note: entry.note == null ? '' : String(entry.note),
    };
}

function salaryYearSchemaEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function normalizeSalaryYearEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return {
            rows: {},
            customCols: migrateSalaryCustomCols(null),
            colLabels: {},
            rowLabels: {},
            hiddenCols: migrateSalaryHiddenCols(null),
            customRows: [],
            hiddenRows: [],
            note: '',
        };
    }
    if (!entry.rows || typeof entry.rows !== 'object') entry.rows = {};
    const customCols = migrateSalaryCustomCols(entry.customCols);
    if (!salaryYearSchemaEqual(entry.customCols, customCols)) entry.customCols = customCols;
    const colLabels = migrateSalaryColLabels(entry.colLabels);
    if (!salaryYearSchemaEqual(entry.colLabels, colLabels)) entry.colLabels = colLabels;
    const rowLabels = migrateSalaryRowLabels(entry.rowLabels);
    if (!salaryYearSchemaEqual(entry.rowLabels, rowLabels)) entry.rowLabels = rowLabels;
    const hiddenCols = migrateSalaryHiddenCols(entry.hiddenCols);
    if (!salaryYearSchemaEqual(entry.hiddenCols, hiddenCols)) entry.hiddenCols = hiddenCols;
    const customRows = migrateSalaryCustomRows(entry.customRows);
    if (!salaryYearSchemaEqual(entry.customRows, customRows)) entry.customRows = customRows;
    const hiddenRows = migrateSalaryHiddenRows(entry.hiddenRows);
    if (!salaryYearSchemaEqual(entry.hiddenRows, hiddenRows)) entry.hiddenRows = hiddenRows;
    if (entry.note == null) entry.note = '';
    return entry;
}

export function getSalaryColLabel(entry, key, defaultLabel) {
    const override = String(entry?.colLabels?.[key] || '').trim();
    return override || defaultLabel || key;
}

export function getSalaryRowLabel(entry, rowId, defaultLabel) {
    const override = String(entry?.rowLabels?.[rowId] || '').trim();
    return override || defaultLabel || rowId;
}

export function getSalaryAddColsEffective(entry) {
    const normalized = readSalaryYearEntry(entry);
    const hidden = new Set(normalized.hiddenCols?.add || []);
    return mergeSalaryAddCols(normalized.customCols)
        .filter((c) => !hidden.has(c.key))
        .map((c) => ({
            ...c,
            label: getSalaryColLabel(normalized, c.key, c.label),
        }));
}

export function getSalarySubColsEffective(entry) {
    const normalized = readSalaryYearEntry(entry);
    const hidden = new Set(normalized.hiddenCols?.sub || []);
    return mergeSalarySubCols(normalized.customCols)
        .filter((c) => !hidden.has(c.key))
        .map((c) => ({
            ...c,
            label: getSalaryColLabel(normalized, c.key, c.label),
        }));
}

export function getSalaryRowsEffective(entry) {
    const normalized = readSalaryYearEntry(entry);
    const hidden = new Set(normalized.hiddenRows || []);
    const base = SALARY_YEAR_ROWS.filter((r) => !hidden.has(r.id)).map((r) => ({
        id: r.id,
        label: getSalaryRowLabel(normalized, r.id, r.label),
        custom: false,
    }));
    const custom = (normalized.customRows || [])
        .filter((r) => !hidden.has(r.id))
        .map((r) => ({ id: r.id, label: r.label, custom: true }));
    return [...base, ...custom];
}

export function getSalaryRowIdsEffective(entry) {
    return getSalaryRowsEffective(entry).map((r) => r.id);
}

export function copySalaryYearSchema(sourceEntry) {
    const src = readSalaryYearEntry(sourceEntry);
    return {
        customCols: {
            add: src.customCols.add.map((c) => ({ ...c })),
            sub: src.customCols.sub.map((c) => ({ ...c })),
        },
        colLabels: { ...src.colLabels },
        rowLabels: { ...src.rowLabels },
        hiddenCols: {
            add: [...(src.hiddenCols.add || [])],
            sub: [...(src.hiddenCols.sub || [])],
        },
        customRows: src.customRows.map((r) => ({ ...r })),
        hiddenRows: [...(src.hiddenRows || [])],
    };
}

export function salaryAddInputKeys(customCols) {
    return mergeSalaryAddCols(customCols).map((c) => c.key);
}

export function salarySubInputKeys(customCols) {
    return mergeSalarySubCols(customCols).map((c) => c.key);
}

/** 直式表單欄 Tab 順序：同一期別欄內由上而下（加項 → 減項），到底後切下一期 */
export const SALARY_COL_TAB_KEYS = [...SALARY_ADD_INPUT_KEYS, ...SALARY_SUB_INPUT_KEYS];

/** 直式薪資表：Tab／Shift+Tab 只在當前期別欄內垂直移動，填完一欄再進下一期 */
export function salaryTransposeHandleTabKeydown(ev, periodId, fieldKey) {
    if (ev.key !== 'Tab' || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const table = ev.target.closest('.salary-year-table--transposed');
    if (!table || !(ev.target instanceof HTMLInputElement)) return;
    const keys = SALARY_COL_TAB_KEYS;
    const periods = SALARY_YEAR_ROW_IDS;
    const ki = keys.indexOf(fieldKey);
    if (ki < 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const focusAt = (pid, k) => {
        const el = table.querySelector(`[data-salary-period="${pid}"][data-salary-key="${k}"]`);
        if (el instanceof HTMLInputElement) {
            el.focus();
            requestAnimationFrame(() => {
                try {
                    el.select();
                } catch (_) {
                    /* ignore */
                }
            });
        }
    };
    if (!ev.shiftKey) {
        if (ki + 1 < keys.length) {
            focusAt(periodId, keys[ki + 1]);
        } else {
            const pi = periods.indexOf(periodId);
            const nextIdx = pi >= 0 && pi + 1 < periods.length ? pi + 1 : 0;
            focusAt(periods[nextIdx], keys[0]);
        }
    } else if (ki - 1 >= 0) {
        focusAt(periodId, keys[ki - 1]);
    } else {
        const pi = periods.indexOf(periodId);
        const prevIdx = pi > 0 ? pi - 1 : periods.length - 1;
        focusAt(periods[prevIdx], keys[keys.length - 1]);
    }
}

/** 直式薪資表列定義（與橫式同一資料來源，僅呈現軸向對調） */
export const SALARY_TRANSPOSE_ROWS = (() => {
    const rows = [];
    SALARY_ADD_COLS.forEach((c, i) => {
        rows.push({ type: 'addIn', key: c.key, label: c.label, footIdx: i });
    });
    rows.push({ type: 'addSum', label: '加項總和' });
    SALARY_SUB_COLS.forEach((c, i) => {
        rows.push({ type: 'subIn', key: c.key, label: c.label, footIdx: i });
    });
    rows.push({ type: 'subSum', label: '減項總和' });
    rows.push({ type: 'net', label: '實領' });
    return rows;
})();

/** 民國 114 年 1 月 1 日起；1 級／24 級與附表一致，中間俸級為線性內插之示意（請以法規與掃描檔為準） */
export const PAYSCALE_BUILTIN_EFFECTIVE_ROC7 = '1140101';
export const PAYSCALE_BUILTIN_ARTIFACT_ID = '__builtin_payscale_1140101';
/** 新增俸表表單預設：俸級 1–24 與俸點（法規俸點附表）；本俸／加給欄由使用者填寫 */
export const PAYSCALE_NEW_FORM_GRADE_POINTS = [
    { grade: 1, points: 800 },
    { grade: 2, points: 790 },
    { grade: 3, points: 780 },
    { grade: 4, points: 750 },
    { grade: 5, points: 730 },
    { grade: 6, points: 710 },
    { grade: 7, points: 690 },
    { grade: 8, points: 670 },
    { grade: 9, points: 650 },
    { grade: 10, points: 630 },
    { grade: 11, points: 610 },
    { grade: 12, points: 590 },
    { grade: 13, points: 550 },
    { grade: 14, points: 535 },
    { grade: 15, points: 520 },
    { grade: 16, points: 505 },
    { grade: 17, points: 490 },
    { grade: 18, points: 475 },
    { grade: 19, points: 460 },
    { grade: 20, points: 445 },
    { grade: 21, points: 430 },
    { grade: 22, points: 415 },
    { grade: 23, points: 400 },
    { grade: 24, points: 385 },
];
export const PAYSCALE_BUILTIN_ROWS = [
    { grade: 1, points: 800, basic: 63570, professional: 105200, job: 41630 },
    { grade: 2, points: 782, basic: 62079, professional: 104136, job: 40032 },
    { grade: 3, points: 764, basic: 60587, professional: 103071, job: 38433 },
    { grade: 4, points: 746, basic: 59096, professional: 102007, job: 36835 },
    { grade: 5, points: 728, basic: 57605, professional: 100943, job: 35237 },
    { grade: 6, points: 710, basic: 56113, professional: 99878, job: 33639 },
    { grade: 7, points: 692, basic: 54622, professional: 98814, job: 32040 },
    { grade: 8, points: 674, basic: 53131, professional: 97750, job: 30442 },
    { grade: 9, points: 656, basic: 51640, professional: 96685, job: 28844 },
    { grade: 10, points: 638, basic: 50148, professional: 95621, job: 27246 },
    { grade: 11, points: 620, basic: 48657, professional: 94557, job: 25647 },
    { grade: 12, points: 602, basic: 47166, professional: 93492, job: 24049 },
    { grade: 13, points: 583, basic: 45674, professional: 92428, job: 22451 },
    { grade: 14, points: 565, basic: 44183, professional: 91363, job: 20853 },
    { grade: 15, points: 547, basic: 42692, professional: 90299, job: 19254 },
    { grade: 16, points: 529, basic: 41200, professional: 89235, job: 17656 },
    { grade: 17, points: 511, basic: 39709, professional: 88170, job: 16058 },
    { grade: 18, points: 493, basic: 38218, professional: 87106, job: 14460 },
    { grade: 19, points: 475, basic: 36727, professional: 86042, job: 12861 },
    { grade: 20, points: 457, basic: 35235, professional: 84977, job: 11263 },
    { grade: 21, points: 439, basic: 33744, professional: 83913, job: 9665 },
    { grade: 22, points: 421, basic: 32253, professional: 82849, job: 8067 },
    { grade: 23, points: 403, basic: 30761, professional: 81784, job: 6468 },
    { grade: 24, points: 385, basic: 29270, professional: 80720, job: 4870 },
];

export function payscaleRowTotal(r) {
    if (!r) return 0;
    return util.parseMoney(r.basic) + util.parseMoney(r.professional) + util.parseMoney(r.job);
}

export function payscaleEffectiveRoc7ToNum(s) {
    const d = util.normalizeRocDate7(String(s || ''));
    if (d.length !== 7) return 0;
    const n = parseInt(d, 10);
    return Number.isFinite(n) ? n : 0;
}

export function emptySalaryYearRow(entry) {
    const normalized = readSalaryYearEntry(entry);
    const row = {
        addPay: '',
        addProf: '',
        addSuper: '',
        addOT: '',
        addDutyFee: '',
        addOther: '',
        subTax: '',
        subPension: '',
        subIns: '',
        subHealth: '',
        subHousingRec: '',
        subDorm: '',
        subOther: '',
    };
    getSalaryAddColsEffective(normalized).forEach((c) => {
        if (row[c.key] == null) row[c.key] = '';
    });
    getSalarySubColsEffective(normalized).forEach((c) => {
        if (row[c.key] == null) row[c.key] = '';
    });
    return row;
}

export function ensureSalaryYear(book, rocYear3) {
    let y = String(rocYear3 || '').replace(/\D/g, '');
    if (!y) y = util.todayRocDate7().slice(0, 3);
    y = y.length <= 3 ? y.padStart(3, '0') : y.slice(0, 3);
    if (!book[y]) book[y] = normalizeSalaryYearEntry(null);
    normalizeSalaryYearEntry(book[y]);
    const entry = book[y];
    const addKeys = getSalaryAddColsEffective(entry).map((c) => c.key);
    const subKeys = getSalarySubColsEffective(entry).map((c) => c.key);
    const keys = [...addKeys, ...subKeys];
    getSalaryRowIdsEffective(entry).forEach((rid) => {
        if (!entry.rows[rid]) {
            entry.rows[rid] = emptySalaryYearRow(entry);
        } else {
            const r = entry.rows[rid];
            keys.forEach((k) => {
                if (r[k] == null) r[k] = '';
            });
        }
    });
    return y;
}

export function salaryYearEntryHasData(entry) {
    if (String(entry?.note || '').trim()) return true;
    if (!entry?.rows) return false;
    const normalized = readSalaryYearEntry(entry);
    const addKeys = getSalaryAddColsEffective(normalized).map((c) => c.key);
    const subKeys = getSalarySubColsEffective(normalized).map((c) => c.key);
    const keys = [...addKeys, ...subKeys];
    return getSalaryRowIdsEffective(normalized).some((rid) => {
        const row = normalized.rows[rid];
        if (!row) return false;
        return keys.some((k) => String(row[k] || '').trim() !== '');
    });
}

export function migrateSalaryYearBook(raw, legacyGlobalCustomCols) {
    const book = {};
    if (!raw || typeof raw !== 'object') return book;
    const legacyGlobal = migrateSalaryCustomCols(legacyGlobalCustomCols);
    Object.keys(raw).forEach((yk) => {
        const yr = raw[yk];
        if (!yr || typeof yr !== 'object' || !yr.rows || typeof yr.rows !== 'object') return;
        let customCols = migrateSalaryCustomCols(yr.customCols);
        if (!customCols.add.length && !customCols.sub.length && (legacyGlobal.add.length || legacyGlobal.sub.length)) {
            customCols = {
                add: legacyGlobal.add.map((c) => ({ ...c })),
                sub: legacyGlobal.sub.map((c) => ({ ...c })),
            };
        }
        book[yk] = normalizeSalaryYearEntry({
            rows: {},
            customCols,
            colLabels: yr.colLabels,
            rowLabels: yr.rowLabels,
            hiddenCols: yr.hiddenCols,
            customRows: yr.customRows,
            hiddenRows: yr.hiddenRows,
            note: String(yr.note || ''),
        });
        SALARY_YEAR_ROW_IDS.forEach((rid) => {
            if (yr.rows[rid]) {
                book[yk].rows[rid] = Object.assign(emptySalaryYearRow(book[yk]), yr.rows[rid] || {});
            }
        });
        (book[yk].customRows || []).forEach((r) => {
            if (yr.rows[r.id]) {
                book[yk].rows[r.id] = Object.assign(emptySalaryYearRow(book[yk]), yr.rows[r.id] || {});
            }
        });
        ensureSalaryYear(book, yk);
    });
    return book;
}

export const LEGACY_SALARY_ADD = ['addBase', 'addDuty', 'addProf', 'addSup', 'addAlwA', 'addAlwB', 'addBonus'];
export const LEGACY_SALARY_SUB = ['subTax', 'subHealth', 'subLabor', 'subPension', 'subLaborRet', 'subHousing', 'subOther', 'subHealth2'];

export function migrateLegacySalaryRecord(e) {
    const x = { ...e };
    if (x.monthRoc5 && util.normalizeRocMonth5(x.monthRoc5).length === 5) {
        x.monthRoc5 = util.normalizeRocMonth5(x.monthRoc5);
    } else if (x.monthIso) {
        x.monthRoc5 = util.yyyyMmToRocMonth5(x.monthIso);
    } else {
        x.monthRoc5 = '';
    }
    LEGACY_SALARY_ADD.forEach((k) => {
        if (x[k] == null) x[k] = '';
    });
    LEGACY_SALARY_SUB.forEach((k) => {
        if (x[k] == null) x[k] = '';
    });
    if (String(x.addBase || '') === '' && x.baseAmount != null && String(x.baseAmount).trim() !== '') {
        x.addBase = String(x.baseAmount).trim();
    }
    if (String(x.addAlwA || '') === '' && x.allowance != null && String(x.allowance).trim() !== '') {
        x.addAlwA = String(x.allowance).trim();
    }
    if (String(x.addBonus || '') === '' && x.bonus != null && String(x.bonus).trim() !== '') {
        x.addBonus = String(x.bonus).trim();
    }
    if (x.monthRoc5 && x.monthRoc5.length === 5) {
        const ym = util.rocMonth5ToYyyyMm(x.monthRoc5);
        if (ym) x.monthIso = ym;
    }
    return x;
}

export function tryMigrateSalaryRecordsToYearBook(legacyList, book) {
    if (!Array.isArray(legacyList) || !legacyList.length) return;
    if (book && typeof book === 'object' && Object.keys(book).length > 0) return;
    legacyList.forEach((rec) => {
        const r = migrateLegacySalaryRecord({ ...rec });
        const mr = r.monthRoc5;
        if (!mr || mr.length !== 5) return;
        const ry = mr.slice(0, 3);
        const mNum = parseInt(mr.slice(3, 5), 10);
        if (mNum < 1 || mNum > 12) return;
        const rid = 'm' + String(mNum).padStart(2, '0');
        ensureSalaryYear(book, ry);
        const row = book[ry].rows[rid];
        const merge = (k, v) => {
            if (v != null && String(v).trim() !== '' && !String(row[k] || '').trim()) row[k] = String(v).trim();
        };
        merge('addPay', r.addBase);
        merge('addProf', r.addProf);
        merge('addSuper', r.addSup);
        merge('addOT', r.addDuty);
        merge('addDutyFee', r.addAlwA);
        if (!String(row.addOther || '').trim() && (r.addAlwB || r.addBonus)) {
            row.addOther = [r.addAlwB, r.addBonus]
                .filter((x) => x && String(x).trim())
                .map((x) => String(x).trim())
                .join('／');
        }
        merge('subTax', r.subTax);
        merge('subPension', r.subPension);
        merge('subIns', r.subLabor || r.subLaborRet);
        merge('subHealth', r.subHealth);
        merge('subHousingRec', r.subHousing);
        merge('subDorm', r.subHealth2);
        if (!String(row.subOther || '').trim() && r.subOther) row.subOther = String(r.subOther).trim();
    });
}

export function salaryRowAddSum(row, customCols) {
    if (!row) return 0;
    return salaryAddInputKeys(customCols).reduce((s, k) => s + util.parseMoney(row[k]), 0);
}

export function salaryRowSubSum(row, customCols) {
    if (!row) return 0;
    return salarySubInputKeys(customCols).reduce((s, k) => s + util.parseMoney(row[k]), 0);
}

export function salaryYearFootAggregate(book, rocYear3) {
    const y = String(rocYear3 || '').replace(/\D/g, '');
    const yk = y.length <= 3 ? y.padStart(3, '0') : y.slice(0, 3);
    const entry = readSalaryYearEntry(book[yk]);
    const addColsDef = getSalaryAddColsEffective(entry);
    const subColsDef = getSalarySubColsEffective(entry);
    const addKeys = addColsDef.map((c) => c.key);
    const subKeys = subColsDef.map((c) => c.key);
    if (!book[yk] || !entry.rows) {
        return {
            addCols: addKeys.map(() => 0),
            subCols: subKeys.map(() => 0),
            addGrand: 0,
            subGrand: 0,
            net: 0,
        };
    }
    const addCols = addKeys.map(() => 0);
    const subCols = subKeys.map(() => 0);
    let addGrand = 0;
    let subGrand = 0;
    getSalaryRowIdsEffective(entry).forEach((rid) => {
        const row = entry.rows[rid];
        if (!row) return;
        addKeys.forEach((k, i) => {
            addCols[i] += util.parseMoney(row[k]);
        });
        subKeys.forEach((k, i) => {
            subCols[i] += util.parseMoney(row[k]);
        });
        addGrand += addKeys.reduce((s, k) => s + util.parseMoney(row[k]), 0);
        subGrand += subKeys.reduce((s, k) => s + util.parseMoney(row[k]), 0);
    });
    return { addCols, subCols, addGrand, subGrand, net: addGrand - subGrand };
}

export function migratePayscaleArtifact(e) {
    const x = { ...e };
    x.id = String(x.id || `pa_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`);
    x.effectiveRoc7 = util.normalizeRocDate7(util.toRocDate7FromAny(x.effectiveRoc7 || x.effectiveIso || ''));
    x.imageUrl = String(x.imageUrl || '').trim();
    x.fileName = String(x.fileName || '').trim();
    x.uploadedAt = Number(x.uploadedAt) || Date.now();
    return x;
}

export function shouldApplyPayscaleFromServer(data) {
    if (!data || typeof data !== 'object') return false;
    if (Array.isArray(data.payscaleArtifacts) && data.payscaleArtifacts.length > 0) return true;
    const g = Number(data.payscaleMyGrade);
    if (Number.isInteger(g) && g >= 1 && g <= 24) return true;
    const o = data.payscaleRowOverrides;
    if (o && typeof o === 'object' && Object.keys(o).length > 0) return true;
    return false;
}

/** 俸表：依俸級覆寫內建數值（與個人行政一併存於 app.db） */
export function migratePayscaleRowOverrides(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (let g = 1; g <= 24; g++) {
        const k = String(g);
        const v = obj[k];
        if (!v || typeof v !== 'object') continue;
        const points = Math.round(Number(v.points));
        const basicN = util.parseMoney(v.basic);
        const professionalN = util.parseMoney(v.professional);
        const jobN = util.parseMoney(v.job);
        if (!Number.isFinite(points) || points < 0) continue;
        if (![basicN, professionalN, jobN].every((n) => Number.isFinite(n) && n >= 0)) continue;
        out[k] = {
            points,
            basic: basicN === 0 ? '' : util.formatMoney(basicN),
            professional: professionalN === 0 ? '' : util.formatMoney(professionalN),
            job: jobN === 0 ? '' : util.formatMoney(jobN),
        };
    }
    return out;
}

export function migratePayscaleMyGrade(v) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 24) return n;
    return 0;
}

/** 24 級完整列（供表內 v-model）；舊版局部 overrides 會合併進來 */
export function buildInitialPayscaleRowOverrides(rawOv) {
    const base = {};
    PAYSCALE_BUILTIN_ROWS.forEach((r) => {
        const k = String(r.grade);
        base[k] = {
            points: r.points,
            basic: util.formatMoney(r.basic),
            professional: util.formatMoney(r.professional),
            job: util.formatMoney(r.job),
        };
    });
    const migrated = migratePayscaleRowOverrides(rawOv || {});
    Object.keys(migrated).forEach((k) => {
        if (base[k]) Object.assign(base[k], migrated[k]);
    });
    PAYSCALE_BUILTIN_ROWS.forEach((r) => {
        const k = String(r.grade);
        const o = base[k];
        ['basic', 'professional', 'job'].forEach((f) => {
            const n = util.parseMoney(o[f]);
            o[f] = n === 0 ? '' : util.formatMoney(n);
        });
    });
    return base;
}

export function migrateTrainingRecord(e) {
    const x = { ...e };
    x.startRoc7 = util.toRocDate7FromAny(x.startRoc7 || x.startIso || '');
    x.endRoc7 = util.toRocDate7FromAny(x.endRoc7 || x.endIso || '');
    if (x.isOnline == null) x.isOnline = true;
    if (x.venue == null) x.venue = '';
    if (x.attachmentUrl == null) x.attachmentUrl = '';
    if (x.attachmentName == null) x.attachmentName = '';
    if (!Array.isArray(x.trainingAttachments)) {
        if (x.attachmentUrl && String(x.attachmentUrl).trim()) {
            x.trainingAttachments = [
                { url: String(x.attachmentUrl).trim(), name: String(x.attachmentName || '').trim() },
            ];
        } else {
            x.trainingAttachments = [];
        }
    } else {
        x.trainingAttachments = x.trainingAttachments
            .map((a) => ({
                url: String(a && a.url != null ? a.url : '').trim(),
                name: String(a && a.name != null ? a.name : '').trim(),
            }))
            .filter((a) => a.url);
    }
    return x;
}

export function careerIsoAtNoonMs(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return NaN;
    return new Date(`${iso}T12:00:00`).getTime();
}

export function careerCalendarDiffYmd(isoStart, isoEnd) {
    if (!isoStart || !isoEnd) return { y: 0, m: 0, d: 0 };
    const d1 = new Date(`${isoStart}T12:00:00`);
    const d2 = new Date(`${isoEnd}T12:00:00`);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return { y: 0, m: 0, d: 0 };
    let y1 = d1.getFullYear();
    let m1 = d1.getMonth();
    let day1 = d1.getDate();
    let y2 = d2.getFullYear();
    let m2 = d2.getMonth();
    let day2 = d2.getDate();
    let yy = y2 - y1;
    let mm = m2 - m1;
    let dd = day2 - day1;
    if (dd < 0) {
        dd += new Date(y2, m2, 0).getDate();
        mm -= 1;
    }
    if (mm < 0) {
        mm += 12;
        yy -= 1;
    }
    return { y: yy, m: mm, d: dd };
}

/** 期間：日曆差；滿一年顯示 y年m月d日，不足一年僅 m月d日（數字不補零） */
export function formatCareerSpanPeriod(isoStart, isoEnd) {
    const { y, m, d } = careerCalendarDiffYmd(isoStart, isoEnd);
    if (y === 0 && m === 0 && d === 0) return '';
    if (y === 0) {
        return `${m}月${d}日`;
    }
    return `${y}年${m}月${d}日`;
}

export function careerRowInterval(row) {
    const s = util.normalizeRocDate7(row.startRoc7 || '');
    const isoS = util.rocDate7ToIso(s);
    if (!isoS) return null;
    let e = util.normalizeRocDate7(row.endRoc7 || '');
    let isoE = e.length === 7 && util.rocDate7ToIso(e) ? util.rocDate7ToIso(e) : isoS;
    if (careerIsoAtNoonMs(isoE) < careerIsoAtNoonMs(isoS)) isoE = isoS;
    const isPoint = isoE === isoS;
    return { isoS, isoE, isPoint };
}

/** 粗估 10px bold 單行標題寬度（時間軸橫向寬度依標題收斂，不再按總日數拉長） */
export function estimateCareerTitleWidthPx(title) {
    const t = String(title || '').trim() || '（無標題）';
    let w = 0;
    for (const ch of t) {
        const cp = ch.codePointAt(0);
        w += cp <= 0x007f ? 6 : 10;
    }
    return Math.ceil(w);
}

export function careerTimelineBBoxOverlap(a, b) {
    const e = 0.25;
    return !(
        a.right <= b.left + e ||
        a.left + e >= b.right ||
        a.bottom <= b.top + e ||
        a.top + e >= b.bottom
    );
}

export function careerAttachmentLabelFromUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '附件';
    const seg = u.split('?')[0].split('/').filter(Boolean);
    const tail = seg.length ? seg[seg.length - 1] : '';
    return tail || '附件';
}

/** 職務年表事件之附件清單（新欄位 careerAttachments；相容舊版單一 attachmentUrl） */
export function careerRowAttachments(row) {
    if (!row) return [];
    const out = [];
    const seen = new Set();
    const push = (url, name) => {
        const u = String(url || '').trim();
        if (!u || seen.has(u)) return;
        seen.add(u);
        const n = String(name || '').trim();
        out.push({ url: u, name: n || careerAttachmentLabelFromUrl(u) });
    };
    if (Array.isArray(row.careerAttachments)) {
        row.careerAttachments.forEach((a) => push(a?.url, a?.name));
    }
    push(row.attachmentUrl, row.attachmentName);
    return out;
}

export function careerRowHasAttachment(row) {
    return careerRowAttachments(row).length > 0;
}

export function migrateCareerTimelineRecord(e) {
    const x = { ...e };
    x.id = String(x.id || `CR_${Date.now()}_${Math.random().toString(16).slice(2, 9)}`);
    x.startRoc7 = util.toRocDate7FromAny(x.startRoc7 || x.startIso || '');
    x.endRoc7 = util.toRocDate7FromAny(x.endRoc7 || x.endIso || '');
    const hasNewTitle = x.title != null && String(x.title).trim() !== '';
    if (hasNewTitle) {
        x.title = String(x.title || '').trim();
        x.content = String(x.content != null ? x.content : '');
    } else {
        x.title = String(x.content != null ? x.content : '').trim();
        x.content = String(x.note != null ? x.note : '').trim();
    }
    x.period = String(x.period != null ? x.period : '').trim();
    x.note = String(x.note != null ? x.note : '');
    x.careerAttachments = careerRowAttachments(x);
    delete x.attachmentUrl;
    delete x.attachmentName;
    x.careerTier = x.careerTier === 'child' ? 'child' : 'main';
    x.parentId = String(x.parentId != null ? x.parentId : '').trim();
    if (x.careerTier === 'main') x.parentId = '';
    return x;
}

/** 修正子事件 parent 不存在、或子事件誤設 parent 為另一子事件等情形 */
export function sanitizeCareerTimelineLinks(records) {
    const list = records || [];
    const byId = new Map(list.map((r) => [r.id, r]));
    list.forEach((r) => {
        if (r.careerTier === 'child') {
            const p = r.parentId && byId.get(r.parentId);
            if (!p || p.careerTier === 'child') {
                r.careerTier = 'main';
                r.parentId = '';
            }
        } else {
            r.parentId = '';
        }
    });
}

export function buildCareerTimelineLayout(records) {
    const items = [];
    (records || []).forEach((row) => {
        const iv = careerRowInterval(row);
        if (!iv) return;
        const t0 = careerIsoAtNoonMs(iv.isoS);
        const t1 = careerIsoAtNoonMs(iv.isoE);
        if (!Number.isFinite(t0) || !Number.isFinite(t1)) return;
        const isChild = row.careerTier === 'child';
        items.push({ row, isChild, ...iv, t0, t1 });
    });
    const mainItems = items.filter((i) => !i.isChild).sort((a, b) => a.t0 - b.t0);
    const childItems = items.filter((i) => i.isChild).sort((a, b) => a.t0 - b.t0);
    let minT;
    let maxT;
    if (items.length === 0) {
        const tToday = careerIsoAtNoonMs(util.rocDate7ToIso(util.todayRocDate7()));
        const pad = 86400000 * 365 * 2;
        const base = Number.isFinite(tToday) ? tToday : Date.now();
        minT = base - pad;
        maxT = base + pad;
    } else {
        minT = Math.min(...items.map((i) => i.t0));
        maxT = Math.max(...items.map((i) => i.t1));
        const pad = Math.max((maxT - minT) * 0.08, 86400000 * 90);
        minT -= pad;
        maxT += pad;
    }
    const span = Math.max(maxT - minT, 86400000);
    let maxLabelNeed = 280;
    items.forEach((it) => {
        const title = String(it.row.title || '').trim() || '（無標題）';
        const tw = estimateCareerTitleWidthPx(title);
        const need = tw + (it.isPoint ? 18 : 6);
        if (need > maxLabelNeed) maxLabelNeed = need;
    });
    const nEv = items.length;
    const scrollMinWidthPx =
        nEv === 0
            ? 520
            : Math.max(520, Math.min(1000, 300 + maxLabelNeed + nEv * 10));
    const W = scrollMinWidthPx;
    const LANE_H_PX = 34;

    function placeCareerBand(bandItems, trackYOffset) {
        const placedBBoxes = [];
        const segs = [];
        let maxLocal = -1;
        bandItems.forEach((it) => {
            const st = it.t0;
            const en = it.t1;
            const leftPct = ((st - minT) / span) * 100;
            const widthPctRaw = ((en - st) / span) * 100;
            const widthPct = it.isPoint ? 0 : Math.max(widthPctRaw, 0.35);
            const title = String(it.row.title || '').trim() || '（無標題）';
            const titleWpx = estimateCareerTitleWidthPx(title);
            const barLeftPx = ((st - minT) / span) * W;
            const barRightPx = ((en - minT) / span) * W;
            let labelLeftPx;
            let labelRightPx;
            if (it.isPoint) {
                const dotLeftPx = barLeftPx - 3;
                const gapPx = 4;
                labelLeftPx = dotLeftPx;
                labelRightPx = dotLeftPx + 6 + gapPx + titleWpx;
            } else {
                const barWpx = Math.max(barRightPx - barLeftPx, (0.35 / 100) * W);
                const barEndPx = barLeftPx + barWpx;
                labelLeftPx = barLeftPx;
                labelRightPx = Math.max(barEndPx, barLeftPx + titleWpx);
            }
            let placed = 0;
            while (placed < 256) {
                const top = (trackYOffset + placed) * LANE_H_PX;
                const bottom = top + LANE_H_PX;
                const cand = {
                    left: labelLeftPx,
                    right: labelRightPx,
                    top,
                    bottom,
                };
                const hit = placedBBoxes.some((r) => careerTimelineBBoxOverlap(r, cand));
                if (!hit) {
                    placedBBoxes.push(cand);
                    maxLocal = Math.max(maxLocal, placed);
                    break;
                }
                placed += 1;
            }
            const visualTrack = trackYOffset + placed;
            const btnStyle = it.isPoint
                ? {
                      top: `calc(${visualTrack} * var(--career-lane-h))`,
                      left: `calc(${leftPct}% - 3px)`,
                      width: 'max-content',
                      maxWidth: 'none',
                  }
                : {
                      top: `calc(${visualTrack} * var(--career-lane-h))`,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      minWidth: '4px',
                  };
            segs.push({
                id: it.row.id,
                row: it.row,
                track: visualTrack,
                leftPct,
                widthPct,
                isPoint: it.isPoint,
                isChild: it.isChild,
                title,
                btnStyle,
            });
        });
        return { segs, trackCount: Math.max(maxLocal + 1, 0) };
    }

    const mainPlaced = placeCareerBand(mainItems, 0);
    const mainTrackCount = mainPlaced.trackCount;
    const childPlaced = placeCareerBand(childItems, mainTrackCount);
    const segments = [...mainPlaced.segs, ...childPlaced.segs];
    const totalTracks = mainTrackCount + childPlaced.trackCount;
    return {
        segments,
        trackCount: Math.max(totalTracks, 1),
        scrollMinWidthPx,
        minT,
        maxT,
        span,
    };
}

export function buildCareerTimelineTicks(minT, maxT) {
    const span = Math.max(maxT - minT, 1);
    const yStart = new Date(minT).getFullYear();
    const yEnd = new Date(maxT).getFullYear();
    let step = 1;
    const ny = yEnd - yStart + 1;
    if (ny > 40) step = 5;
    else if (ny > 25) step = 2;
    const ticks = [];
    for (let y = yStart; y <= yEnd; y += step) {
        const iso = `${y}-01-01`;
        const tm = careerIsoAtNoonMs(iso);
        const pct = ((tm - minT) / span) * 100;
        if (pct < -1 || pct > 101) continue;
        const rocY = y - 1911;
        ticks.push({
            key: `y${y}`,
            label: String(rocY),
            pct: Math.min(100, Math.max(0, pct)),
        });
    }
    if (ticks.length === 0) {
        const y = new Date(minT + span / 2).getFullYear();
        const ry = y - 1911;
        ticks.push({ key: `y${y}`, label: String(ry), pct: 50 });
    }
    return ticks;
}

export function migrateCalendarEvent(e) {
    const x = { ...e };
    x.dateRoc = util.toRocDate7FromAny(x.dateRoc || x.dateIso || '');
    x.startRoc7 = util.toRocDate7FromAny(x.startRoc7 || x.dateRoc || '');
    x.endRoc7 = util.toRocDate7FromAny(x.endRoc7 || x.startRoc7 || x.dateRoc || '');
    let t = String(x.time || '');
    if (t.includes(':')) {
        x.time = util.hhmmToRocTime4(t);
    } else {
        x.time = util.normalizeRocTime4(t);
    }
    return x;
}

function stripBlobMeta(o) {
    if (!o || typeof o !== 'object') return {};
    const { _updatedAt, ...rest } = o;
    return rest;
}

/** 用於與資料庫比對：localStorage 若明顯較完整，應優先採用，避免「僅薪資骨架」的 DB 覆寫較完整的前端備份。 */
export function personalAdminBlobPayloadSize(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    try {
        return JSON.stringify(stripBlobMeta(payload)).length;
    } catch {
        return 0;
    }
}

export function isPersonalAdminBlobMeaningful(payload) {
    const p = stripBlobMeta(payload);
    if (!p || typeof p !== 'object') return false;
    if ((p.overtimeEntries || []).length > 0) return true;
    if ((p.leaveRecords || []).length > 0) return true;
    if (
        p.attendanceOvertimeMonthLimits &&
        typeof p.attendanceOvertimeMonthLimits === 'object' &&
        Object.keys(p.attendanceOvertimeMonthLimits).length > 0
    ) {
        return true;
    }
    if (
        p.attendanceLeaveYearDayQuotas &&
        typeof p.attendanceLeaveYearDayQuotas === 'object' &&
        Object.keys(p.attendanceLeaveYearDayQuotas).length > 0
    ) {
        return true;
    }
    if (
        p.attendanceLeaveYearSettings &&
        typeof p.attendanceLeaveYearSettings === 'object' &&
        Object.keys(p.attendanceLeaveYearSettings).length > 0
    ) {
        return true;
    }
    if ((p.calendarEvents || []).length > 0) return true;
    if ((p.todos || []).length > 0) return true;
    if (p.salaryYearBook && typeof p.salaryYearBook === 'object' && Object.keys(p.salaryYearBook).length > 0) {
        return true;
    }
    if ((p.trainingRecords || []).length > 0) return true;
    if ((p.careerTimelineRecords || []).length > 0) return true;
    if (shouldApplyPayscaleFromServer(p)) return true;
    return false;
}

export function applyPersonalAdminFromPayload(personalAdmin, payload) {
    const p = stripBlobMeta(payload);
    if (!p || typeof p !== 'object') return;
    personalAdmin.overtimeEntries = Array.isArray(p.overtimeEntries)
        ? p.overtimeEntries.map((e) => migrateOvertimeEntry({ ...e }))
        : [];
    personalAdmin.leaveRecords = Array.isArray(p.leaveRecords)
        ? p.leaveRecords.map((e) => migrateLeaveRecord({ ...e }))
        : [];
    personalAdmin.attendanceOvertimeMonthLimits =
        p.attendanceOvertimeMonthLimits && typeof p.attendanceOvertimeMonthLimits === 'object'
            ? p.attendanceOvertimeMonthLimits
            : {};
    personalAdmin.attendanceLeaveYearSettings = mergeAttendanceLeaveYearSettingsFromPayload(p);
    personalAdmin.calendarEvents = Array.isArray(p.calendarEvents)
        ? p.calendarEvents.map((e) => migrateCalendarEvent({ ...e }))
        : [];
    personalAdmin.todos = Array.isArray(p.todos) ? p.todos.map((e) => ({ ...e })) : [];
    personalAdmin.salaryYearBook = (() => {
        const book = migrateSalaryYearBook(p.salaryYearBook, p.salaryCustomCols);
        tryMigrateSalaryRecordsToYearBook(Array.isArray(p.salaryRecords) ? p.salaryRecords : [], book);
        return book;
    })();
    personalAdmin.payscaleRowOverrides = buildInitialPayscaleRowOverrides(p.payscaleRowOverrides);
    personalAdmin.payscaleMyGrade = migratePayscaleMyGrade(p.payscaleMyGrade);
    personalAdmin.payscaleArtifacts = Array.isArray(p.payscaleArtifacts)
        ? p.payscaleArtifacts
              .map((e) => migratePayscaleArtifact({ ...e }))
              .filter((a) => a.id !== PAYSCALE_BUILTIN_ARTIFACT_ID)
        : [];
    personalAdmin.trainingRecords = Array.isArray(p.trainingRecords)
        ? p.trainingRecords.map((e) => migrateTrainingRecord({ ...e }))
        : [];
    personalAdmin.careerTimelineRecords = Array.isArray(p.careerTimelineRecords)
        ? p.careerTimelineRecords.map((e) => migrateCareerTimelineRecord({ ...e }))
        : [];
    sanitizeCareerTimelineLinks(personalAdmin.careerTimelineRecords);
}

export function personalAdminToDbPayload(pa) {
    return {
        overtimeEntries: pa.overtimeEntries,
        leaveRecords: pa.leaveRecords,
        attendanceOvertimeMonthLimits: pa.attendanceOvertimeMonthLimits,
        attendanceLeaveYearSettings: pa.attendanceLeaveYearSettings,
        calendarEvents: pa.calendarEvents,
        todos: pa.todos,
        salaryYearBook: pa.salaryYearBook,
        trainingRecords: pa.trainingRecords,
        careerTimelineRecords: pa.careerTimelineRecords,
        payscaleArtifacts: pa.payscaleArtifacts,
        payscaleRowOverrides: pa.payscaleRowOverrides,
        payscaleMyGrade: pa.payscaleMyGrade,
    };
}
