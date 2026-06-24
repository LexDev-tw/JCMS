import { ref, reactive, computed, watch, nextTick } from '../vue-api.js?v=0.1.20260624';
import { util } from '../utils.js?v=0.1.20260624';
import {
    applyPersonalAdminFromPayload,
    buildInitialPayscaleRowOverrides,
    isPersonalAdminBlobMeaningful,
    migrateSalaryYearBook,
    personalAdminBlobPayloadSize,
    personalAdminToDbPayload,
    PERSONAL_ADMIN_KEY,
    readPersonalAdminRaw,
    tryMigrateSalaryRecordsToYearBook,
} from './personal-admin-shared.js?v=0.1.20260624';

export function usePersonalAdmin(api) {
    const t7 = util.todayRocDate7();
    const personalAdmin = reactive({
        overtimeEntries: [],
        leaveRecords: [],
        attendanceOvertimeMonthLimits: {},
        attendanceLeaveYearSettings: {},
        calendarEvents: [],
        todos: [],
        salaryYearBook: (() => {
            const book = migrateSalaryYearBook(null, null);
            tryMigrateSalaryRecordsToYearBook([], book);
            return book;
        })(),
        payscaleArtifacts: [],
        payscaleRowOverrides: buildInitialPayscaleRowOverrides({}),
        payscaleMyGrade: 0,
        trainingRecords: [],
        careerTimelineRecords: [],
        todoDraft: '',
        otDraft: { dateRoc: t7, type: 'regular', hours: 0, note: '' },
        leaveDraft: { kind: '事假', startRoc7: t7, endRoc7: t7, leaveDaysDD: 0, leaveHoursHH: 0, note: '' },
    });

    let adminSuppressDb = false;
    let adminDbSaveTimer = null;
    let adminDbHydrateDone = false;

    function schedulePersistPersonalAdminToDb() {
        if (!adminDbHydrateDone || !api || adminSuppressDb) return;
        if (adminDbSaveTimer) clearTimeout(adminDbSaveTimer);
        adminDbSaveTimer = setTimeout(async () => {
            adminDbSaveTimer = null;
            if (!(await api.checkHealth())) return;
            try {
                await api.savePersonalAdminBlob(personalAdminToDbPayload(personalAdmin));
            } catch (e) {
                console.warn('個人行政寫入資料庫失敗', e);
            }
        }, 500);
    }

    // 必須 deep 監聽整個 reactive：僅監聽頂屬性參考時，像 attendanceOvertimeMonthLimits[月].regular 這類深層變更不會觸發寫入 DB
    watch(personalAdmin, schedulePersistPersonalAdminToDb, { deep: true });

    async function hydratePersonalAdminFromDb() {
        if (!api) {
            adminDbHydrateDone = true;
            return;
        }
        if (!(await api.checkHealth())) {
            adminDbHydrateDone = true;
            return;
        }
        const rawLs = readPersonalAdminRaw();
        try {
            const data = await api.fetchPersonalAdminBlob();
            const wLs =
                rawLs && typeof rawLs === 'object' ? personalAdminBlobPayloadSize(rawLs) : 0;
            const wDb = data ? personalAdminBlobPayloadSize(data) : 0;
            const preferLocalStorage =
                rawLs && typeof rawLs === 'object' && wLs > wDb + 200;
            if (preferLocalStorage) {
                adminSuppressDb = true;
                applyPersonalAdminFromPayload(personalAdmin, rawLs);
                await nextTick();
                adminSuppressDb = false;
                try {
                    await api.savePersonalAdminBlob(personalAdminToDbPayload(personalAdmin));
                    localStorage.removeItem(PERSONAL_ADMIN_KEY);
                } catch (e) {
                    console.warn('個人行政自 localStorage 遷入資料庫失敗', e);
                }
            } else if (data && isPersonalAdminBlobMeaningful(data)) {
                adminSuppressDb = true;
                applyPersonalAdminFromPayload(personalAdmin, data);
                await nextTick();
                adminSuppressDb = false;
                try {
                    localStorage.removeItem(PERSONAL_ADMIN_KEY);
                } catch (_) {}
            } else if (rawLs && typeof rawLs === 'object') {
                adminSuppressDb = true;
                applyPersonalAdminFromPayload(personalAdmin, rawLs);
                await nextTick();
                adminSuppressDb = false;
                try {
                    await api.savePersonalAdminBlob(personalAdminToDbPayload(personalAdmin));
                    localStorage.removeItem(PERSONAL_ADMIN_KEY);
                } catch (e) {
                    console.warn('個人行政自 localStorage 遷入資料庫失敗', e);
                }
            }
        } finally {
            adminDbHydrateDone = true;
        }
    }

    const overtimeMetrics = computed(() => {
        const y = new Date().getFullYear();
        let rh = 0;
        let ph = 0;
        personalAdmin.overtimeEntries.forEach((e) => {
            const d7 = e.dateRoc || util.isoToRocDate7(String(e.dateIso || '').slice(0, 10));
            const iso = util.rocDate7ToIso(util.normalizeRocDate7(d7));
            if (!iso) return;
            const d = new Date(`${iso}T12:00:00`);
            if (isNaN(d.getTime()) || d.getFullYear() !== y) return;
            const h = Number(e.hours) || 0;
            if (e.type === 'project') {
                ph += h;
            } else {
                rh += h;
            }
        });
        return {
            regular: { h: rh, m: 0 },
            project: { h: ph, m: 0 },
            total: { h: rh + ph, m: 0 },
        };
    });

    return { personalAdmin, overtimeMetrics, hydratePersonalAdminFromDb };
}
