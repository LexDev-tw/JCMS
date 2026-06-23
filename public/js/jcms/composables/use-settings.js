import { ref, reactive, watch, nextTick } from '../vue-api.js?v=0.1.20260623g';
import { util } from '../utils.js?v=0.1.20260623g';

const SETTINGS_STORAGE_KEY = 'jcms_app_settings';

function readStoredSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function stripBlobMeta(o) {
    if (!o || typeof o !== 'object') return {};
    const { _updatedAt, ...rest } = o;
    return rest;
}

function isAppSettingsBlobMeaningful(payload) {
    return Object.keys(stripBlobMeta(payload)).length > 0;
}

function appSettingsBlobPayloadSize(payload) {
    if (!payload || typeof payload !== 'object') return 0;
    try {
        return JSON.stringify(stripBlobMeta(payload)).length;
    } catch {
        return 0;
    }
}

function applyAppSettingsPayload(currentWorkspaceRef, settingsReactive, payload) {
    const p = stripBlobMeta(payload);
    const defaultWs = [{ id: 'WS_001', court: '設定您的法院', division: '設定您的股別', startDate: '' }];
    if (typeof p.currentWorkspaceId === 'string' && p.currentWorkspaceId.trim()) {
        currentWorkspaceRef.value = p.currentWorkspaceId.trim();
    }
    const d = p.data;
    if (d && typeof d === 'object') {
        if (typeof d.userName === 'string') settingsReactive.data.userName = d.userName;
        if (Array.isArray(d.workspaces) && d.workspaces.length) {
            settingsReactive.data.workspaces = d.workspaces.map((w) => ({
                id: String(w.id || `WS_${Date.now()}`),
                court: w.court ?? '',
                division: w.division ?? '',
                startDate: util.normalizeRocDate7(w.startDate || '') || '',
            }));
        } else {
            settingsReactive.data.workspaces = [...defaultWs];
        }
        if (Array.isArray(d.caseTypes) && d.caseTypes.length) {
            settingsReactive.data.caseTypes = [...d.caseTypes];
        }
        if (Array.isArray(d.prefixes) && d.prefixes.length) {
            settingsReactive.data.prefixes = [...d.prefixes];
        }
        if (Array.isArray(d.caseWordGroups)) {
            settingsReactive.data.caseWordGroups = d.caseWordGroups.map((g) => {
                const members = Array.isArray(g?.members)
                    ? g.members.map((m) => util.normalizeCaseWord(m)).filter(Boolean)
                    : util.splitCaseWordMembers(g?.membersText || '');
                return {
                    name: util.normalizeCaseWord(g?.name || ''),
                    members,
                    membersText: util.joinCaseWordMembers(members),
                };
            });
        }
    }
    const ids = settingsReactive.data.workspaces.map((w) => w.id);
    if (!ids.includes(currentWorkspaceRef.value) && ids.length) {
        currentWorkspaceRef.value = ids[0];
    }
}

// 模組：系統設定（Workspace 等 · 權威資料於 app.db）
export function useSettings(api) {
    const stored = readStoredSettings();
    const defaultWs = [{ id: 'WS_001', court: '設定您的法院', division: '設定您的股別', startDate: '' }];
    const currentWorkspace = ref(
        stored && typeof stored.currentWorkspaceId === 'string'
            ? stored.currentWorkspaceId
            : 'WS_001'
    );
    const settings = reactive({
        data: {
            userName: stored?.data?.userName ?? '',
            workspaces:
                Array.isArray(stored?.data?.workspaces) && stored.data.workspaces.length
                    ? stored.data.workspaces.map((w) => ({
                          id: String(w.id || `WS_${Date.now()}`),
                          court: w.court ?? '',
                          division: w.division ?? '',
                          startDate: util.normalizeRocDate7(w.startDate || '') || '',
                      }))
                    : [...defaultWs],
            caseTypes:
                Array.isArray(stored?.data?.caseTypes) && stored.data.caseTypes.length
                    ? [...stored.data.caseTypes]
                    : ['民事', '刑事', '行政', '家事', '勞動'],
            prefixes:
                Array.isArray(stored?.data?.prefixes) && stored.data.prefixes.length
                    ? [...stored.data.prefixes]
                    : ['訴', '簡', '小', '重訴', '勞訴', '家訴'],
            caseWordGroups:
                Array.isArray(stored?.data?.caseWordGroups)
                    ? stored.data.caseWordGroups.map((g) => {
                          const members = Array.isArray(g?.members)
                              ? g.members.map((m) => util.normalizeCaseWord(m)).filter(Boolean)
                              : util.splitCaseWordMembers(g?.membersText || '');
                          return {
                              name: util.normalizeCaseWord(g?.name || ''),
                              members,
                              membersText: util.joinCaseWordMembers(members),
                          };
                      })
                    : [],
        },
    });

    let settingsSuppressDb = false;
    let settingsDbHydrateDone = false;
    let settingsDbSaveTimer = null;

    function schedulePersistSettingsToDb() {
        if (!settingsDbHydrateDone || !api || settingsSuppressDb) return;
        if (settingsDbSaveTimer) clearTimeout(settingsDbSaveTimer);
        settingsDbSaveTimer = setTimeout(async () => {
            settingsDbSaveTimer = null;
            if (!(await api.checkHealth())) return;
            try {
                await api.saveAppSettings({
                    currentWorkspaceId: currentWorkspace.value,
                    data: JSON.parse(JSON.stringify(settings.data)),
                });
            } catch (e) {
                console.warn('系統設定寫入資料庫失敗', e);
            }
        }, 500);
    }

    watch([currentWorkspace, () => settings.data], schedulePersistSettingsToDb, { deep: true });

    async function hydrateSettingsFromDb() {
        if (!api) {
            settingsDbHydrateDone = true;
            return;
        }
        if (!(await api.checkHealth())) {
            settingsDbHydrateDone = true;
            return;
        }
        const ls = readStoredSettings();
        try {
            const data = await api.fetchAppSettings();
            const wLs = ls ? appSettingsBlobPayloadSize(ls) : 0;
            const wDb = data ? appSettingsBlobPayloadSize(data) : 0;
            const preferLocalStorage = ls && wLs > wDb + 200;
            if (preferLocalStorage) {
                settingsSuppressDb = true;
                applyAppSettingsPayload(currentWorkspace, settings, ls);
                await nextTick();
                settingsSuppressDb = false;
                try {
                    await api.saveAppSettings({
                        currentWorkspaceId: currentWorkspace.value,
                        data: JSON.parse(JSON.stringify(settings.data)),
                    });
                    localStorage.removeItem(SETTINGS_STORAGE_KEY);
                } catch (e) {
                    console.warn('系統設定自 localStorage 遷入資料庫失敗', e);
                }
            } else if (data && isAppSettingsBlobMeaningful(data)) {
                settingsSuppressDb = true;
                applyAppSettingsPayload(currentWorkspace, settings, data);
                await nextTick();
                settingsSuppressDb = false;
                try {
                    localStorage.removeItem(SETTINGS_STORAGE_KEY);
                } catch (_) {}
            } else if (ls) {
                settingsSuppressDb = true;
                applyAppSettingsPayload(currentWorkspace, settings, ls);
                await nextTick();
                settingsSuppressDb = false;
                try {
                    await api.saveAppSettings({
                        currentWorkspaceId: currentWorkspace.value,
                        data: JSON.parse(JSON.stringify(settings.data)),
                    });
                    localStorage.removeItem(SETTINGS_STORAGE_KEY);
                } catch (e) {
                    console.warn('系統設定自 localStorage 遷入資料庫失敗', e);
                }
            }
        } finally {
            settingsDbHydrateDone = true;
        }
    }

    function addWorkspace() {
        const id = 'WS_' + Date.now();
        settings.data.workspaces.push({
            id,
            court: '',
            division: '',
            startDate: util.todayRocDate7(),
        });
        currentWorkspace.value = id;
    }

    function removeWorkspace(id) {
        if (settings.data.workspaces.length <= 1) {
            alert('至少保留一個工作區。');
            return;
        }
        settings.data.workspaces = settings.data.workspaces.filter((w) => w.id !== id);
        if (currentWorkspace.value === id) {
            currentWorkspace.value = settings.data.workspaces[0].id;
        }
    }

    const ids = settings.data.workspaces.map((w) => w.id);
    if (!ids.includes(currentWorkspace.value) && ids.length) {
        currentWorkspace.value = ids[0];
    }

    return { currentWorkspace, settings, addWorkspace, removeWorkspace, hydrateSettingsFromDb };
}