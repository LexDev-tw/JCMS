/** 偵測窄螢幕 + 觸控裝置，供手機瀏覽精簡 UI */
import { ref, onMounted, onUnmounted } from '../vue-api.js';

export const MOBILE_LAYOUT_MQ = '(max-width: 768px) and (pointer: coarse)';

export function useMobileLayout() {
    const isMobileLayout = ref(
        typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_MQ).matches
    );

    let mq = null;
    let onChange = null;

    onMounted(() => {
        mq = window.matchMedia(MOBILE_LAYOUT_MQ);
        onChange = (e) => {
            isMobileLayout.value = e.matches;
        };
        isMobileLayout.value = mq.matches;
        mq.addEventListener('change', onChange);
    });

    onUnmounted(() => {
        if (mq && onChange) mq.removeEventListener('change', onChange);
    });

    return { isMobileLayout };
}

/** 手機版不載入地圖／工作地圖編輯，改走詳細總覽 */
export const MOBILE_REDIRECT_VIEWS = new Set(['dashboard', 'workMapEdit']);

export function resolveViewForMobileLayout(view, isMobile) {
    if (isMobile && MOBILE_REDIRECT_VIEWS.has(view)) return 'dashboardDetail';
    return view;
}
