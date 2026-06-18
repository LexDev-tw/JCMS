/** 同步執行：在 Vue 模組載入前偵測手機並修正 ?view=（iOS 常回報 pointer:fine，不可依賴 pointer:coarse） */
(function bootJcmsMobileLayout(global) {
    function detectMobileLayout() {
        var w = global.innerWidth || document.documentElement.clientWidth || 0;
        var ua = global.navigator.userAgent || '';
        var touch = (global.navigator.maxTouchPoints || 0) > 0;
        var mobileUa = /Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        var ipad =
            /iPad/i.test(ua) ||
            (global.navigator.platform === 'MacIntel' && global.navigator.maxTouchPoints > 1);

        if (w <= 768) return true;
        if ((mobileUa || ipad) && touch && w <= 1024) return true;
        if (mobileUa && touch) return true;
        return false;
    }

    function redirectMobileDashboardView() {
        try {
            var u = new URL(global.location.href);
            var v = u.searchParams.get('view');
            if (!v || v === 'dashboard' || v === 'workMapEdit') {
                u.searchParams.set('view', 'dashboardDetail');
                var next = u.pathname + u.search + u.hash;
                var cur = global.location.pathname + global.location.search + global.location.hash;
                if (next !== cur) {
                    global.history.replaceState(null, '', next);
                }
            }
        } catch (e) {
            /* ignore */
        }
    }

    global.__jcmsDetectMobileLayout = detectMobileLayout;

    var mobile = detectMobileLayout();
    global.__JCMS_MOBILE_LAYOUT = mobile;

    if (mobile) {
        redirectMobileDashboardView();
        document.documentElement.classList.add('jcms-mobile-layout');
    }
})(window);
