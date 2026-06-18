/** 偵測手機瀏覽，供手機版精簡 UI（不依賴 pointer:coarse，iOS Safari 相容） */
import { ref, onMounted, onUnmounted } from '../vue-api.js';

export function detectMobileLayout() {
    if (typeof window === 'undefined') return false;
    if (typeof window.__jcmsDetectMobileLayout === 'function') {
        return window.__jcmsDetectMobileLayout();
    }
    if (typeof window.__JCMS_MOBILE_LAYOUT === 'boolean') {
        return window.__JCMS_MOBILE_LAYOUT;
    }

    const w = window.innerWidth || document.documentElement.clientWidth || 0;
    const ua = navigator.userAgent || '';
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const mobileUa = /Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const ipad =
        /iPad/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (w <= 768) return true;
    if ((mobileUa || ipad) && touch && w <= 1024) return true;
    if (mobileUa && touch) return true;
    return false;
}

export function useMobileLayout() {
    const isMobileLayout = ref(detectMobileLayout());

    const syncDomClass = (mobile) => {
        document.documentElement.classList.toggle('jcms-mobile-layout', mobile);
    };

    const onLayoutChange = () => {
        const mobile = detectMobileLayout();
        if (isMobileLayout.value !== mobile) {
            isMobileLayout.value = mobile;
        }
        window.__JCMS_MOBILE_LAYOUT = mobile;
        syncDomClass(mobile);
    };

    onMounted(() => {
        onLayoutChange();
        window.addEventListener('resize', onLayoutChange, { passive: true });
        window.addEventListener('orientationchange', onLayoutChange, { passive: true });
    });

    onUnmounted(() => {
        window.removeEventListener('resize', onLayoutChange);
        window.removeEventListener('orientationchange', onLayoutChange);
    });

    return { isMobileLayout };
}

/** 手機版不載入地圖／工作地圖編輯，改走詳細總覽 */
export const MOBILE_REDIRECT_VIEWS = new Set(['dashboard', 'workMapEdit']);

export function resolveViewForMobileLayout(view, isMobile) {
    if (isMobile && MOBILE_REDIRECT_VIEWS.has(view)) return 'dashboardDetail';
    return view;
}
