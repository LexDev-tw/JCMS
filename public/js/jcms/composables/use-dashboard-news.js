/** 地圖總覽：即時新聞區塊（政治／社會／司法合併） */

import { ref, watch, onUnmounted } from '../vue-api.js?v=0.1.20260624';

import { resolveJcmsApiBaseUrl } from '../lib/api-base.js?v=0.1.20260624';



const POLL_MS = 5 * 60 * 1000;



export function useDashboardNews({ isActiveRef, onLoaded } = {}) {

    const collapsed = ref(false);

    const loading = ref(false);

    const error = ref('');

    const items = ref([]);

    const sourceStatus = ref([]);

    const updatedAt = ref('');

    const hasBreaking = ref(false);



    let cachedPayload = null;

    let pollTimer = null;

    let loadSeq = 0;



    async function fetchNews({ force = false } = {}) {

        if (!force && cachedPayload) {

            return cachedPayload;

        }

        const res = await fetch(`${resolveJcmsApiBaseUrl()}/news`, {

            headers: { Accept: 'application/json' },

        });

        if (!res.ok) {

            const err = new Error(`新聞載入失敗（HTTP ${res.status}）`);

            err.statusCode = res.status;

            throw err;

        }

        const json = await res.json();

        if (!json?.ok || !Array.isArray(json.items)) {

            throw new Error('新聞 API 回應格式錯誤');

        }

        cachedPayload = json;

        return json;

    }



    function applyPayload(data) {

        items.value = data.items || [];

        sourceStatus.value = data.sourceStatus || [];

        updatedAt.value = data.updatedAt || '';

        hasBreaking.value = !!data.hasBreaking;

        error.value = '';

    }



    async function loadNews({ force = false } = {}) {

        const seq = ++loadSeq;

        loading.value = true;

        error.value = '';

        try {

            const data = await fetchNews({ force });

            if (seq !== loadSeq) return;

            applyPayload(data);

            if (typeof onLoaded === 'function') onLoaded();

        } catch (err) {

            if (seq !== loadSeq) return;

            error.value = err?.message || '無法取得新聞，請稍後再試';

            items.value = [];

            sourceStatus.value = [];

            hasBreaking.value = false;

        } finally {

            if (seq === loadSeq) loading.value = false;

        }

    }



    function toggleCollapsed() {

        collapsed.value = !collapsed.value;

    }



    function refreshNews() {

        cachedPayload = null;

        return loadNews({ force: true });

    }



    function startPoll() {

        stopPoll();

        pollTimer = window.setInterval(() => {

            if (!isActiveRef?.value) return;

            cachedPayload = null;

            loadNews({ force: true });

        }, POLL_MS);

    }



    function stopPoll() {

        if (pollTimer != null) {

            window.clearInterval(pollTimer);

            pollTimer = null;

        }

    }



    watch(

        isActiveRef,

        (active) => {

            if (!active) {

                stopPoll();

                return;

            }

            if (cachedPayload) {

                applyPayload(cachedPayload);

            } else {

                loadNews();

            }

            startPoll();

        },

        { immediate: true }

    );



    onUnmounted(() => {

        stopPoll();

    });



    return {

        collapsed,

        loading,

        error,

        items,

        sourceStatus,

        updatedAt,

        hasBreaking,

        toggleCollapsed,

        refreshNews,

    };

}


