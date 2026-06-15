/** 同源 API 基底（Docker / 反向代理部署預設為相對路徑 /api） */
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
    return '/api';
}
