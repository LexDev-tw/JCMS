/**
 * 中華民國政府行政機關辦公日曆表（政府資料開放平台）
 * JSON 來源：https://github.com/ruyut/TaiwanCalendar
 */
import { util } from '../utils.js?v=0.1.20260626';

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data';

/** @type {Map<string, { isHoliday: boolean, description: string }>} */
const holidayByRoc7 = new Map();
const loadedYears = new Set();
/** @type {Map<number, Promise<void>>} */
const loadingYears = new Map();

function ingestYearRows(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
        const raw = String(row?.date || '').replace(/\D/g, '');
        if (raw.length !== 8) continue;
        const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        const roc7 = util.isoToRocDate7(iso);
        if (roc7.length !== 7) continue;
        holidayByRoc7.set(roc7, {
            isHoliday: !!row.isHoliday,
            description: String(row.description || '').trim(),
        });
    }
}

async function loadYear(year) {
    const y = Number(year);
    if (!Number.isFinite(y) || y < 2017) return;
    if (loadedYears.has(y)) return;
    if (loadingYears.has(y)) return loadingYears.get(y);

    const task = (async () => {
        try {
            const res = await fetch(`${CDN_BASE}/${y}.json`, { cache: 'default' });
            if (!res.ok) return;
            ingestYearRows(await res.json());
            loadedYears.add(y);
        } catch {
            /* 離線或 CDN 不可用時略過 */
        } finally {
            loadingYears.delete(y);
        }
    })();

    loadingYears.set(y, task);
    return task;
}

/** 依西元年清單預載假日（週曆跨年时须载入多个年度） */
export async function ensureTaiwanHolidaysForYears(years) {
    const unique = [...new Set((years || []).map((y) => Number(y)).filter((y) => Number.isFinite(y)))];
    await Promise.all(unique.map((y) => loadYear(y)));
}

export function getTaiwanGovHolidayInfo(roc7) {
    const key = util.normalizeRocDate7(roc7);
    if (key.length !== 7) return null;
    return holidayByRoc7.get(key) || null;
}

export function isTaiwanGovHoliday(roc7) {
    const info = getTaiwanGovHolidayInfo(roc7);
    return info ? info.isHoliday : false;
}

export function getTaiwanGovHolidayDescription(roc7) {
    return getTaiwanGovHolidayInfo(roc7)?.description || '';
}

/** 行事曆表頭顯示用：僅有官方說明時顯示（週末例假無說明則不標文字） */
export function getTaiwanGovHolidayDisplayLabel(roc7) {
    const info = getTaiwanGovHolidayInfo(roc7);
    if (!info?.isHoliday) return '';
    return String(info.description || '').trim();
}
