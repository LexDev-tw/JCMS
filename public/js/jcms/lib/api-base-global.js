/** 非 module 腳本共用：解析同源 /api 基底 */
(function (global) {
    function ensureApiSuffix(raw) {
        let s = String(raw || '').trim().replace(/\/+$/, '');
        if (!s) return s;
        if (/\/api$/i.test(s)) return s;
        if (/^https?:\/\/[^/]+$/i.test(s)) return `${s}/api`;
        return s;
    }

    function resolveApiBase() {
        if (typeof global.JCMS_API_BASE === 'string' && global.JCMS_API_BASE.trim()) {
            return ensureApiSuffix(global.JCMS_API_BASE.trim());
        }
        try {
            const stored = global.localStorage && global.localStorage.getItem('jcms_api_base');
            if (stored && String(stored).trim()) return ensureApiSuffix(String(stored).trim());
        } catch (_) {
            /* ignore */
        }
        return '/api';
    }

    global.jcmsResolveApiBase = resolveApiBase;
})(typeof globalThis !== 'undefined' ? globalThis : window);
