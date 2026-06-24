/**

 * 地圖總覽即時新聞區塊 — 示範資料與渲染（預覽頁用）

 */

(function (global) {

    'use strict';



    const MOCK_NEWS = Object.freeze([

        { source: '中央社', title: '【快訊】立法院三讀通過重要法案 朝野激辯後表決', time: '09:36', breaking: true, url: '#' },

        { source: '中央社', title: '【突發】北部路段發生重大車禍 警消趕赴現場', time: '09:41', breaking: true, url: '#' },

        { source: '司法院', title: '台北地方法院宣判重大詐欺案 主嫌判刑確定', time: '09:33', breaking: true, url: '#' },

        { source: '聯合', title: '行政院宣布新一波經濟措施 盼穩定物價', time: '09:22', breaking: false, url: '#' },

        { source: '自由', title: '朝野協商國防預算 各黨團提出不同版本', time: '09:08', breaking: false, url: '#' },

        { source: '鏡新聞', title: '立委質詢聚焦兩岸政策 外長赴立院備詢', time: '08:51', breaking: false, url: '#' },

        { source: '法務部', title: '法務部發布最新法治宣導消息', time: '08:27', breaking: false, url: '#' },

        { source: '自由', title: '台北地檢署就貪污案提起公訴 起訴多名被告', time: '08:44', breaking: false, url: '#' },

        { source: '鏡新聞', title: '法官就聲押案裁定羈押 被告不服提抗告', time: '08:29', breaking: false, url: '#' },

        { source: '聯合', title: '【快訊】最高法院就矚目判決發布新聞稿說明', time: '08:12', breaking: true, url: '#' },

    ]);



    function pad2(n) {

        return String(n).padStart(2, '0');

    }



    function formatTimeHHMM(date) {

        const d = date instanceof Date ? date : new Date(date);

        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    }



    function hasAnyBreaking(items) {

        return (items || []).some((item) => item.breaking);

    }



    function getApiBase() {

        if (typeof optsApiBase === 'string' && optsApiBase) return optsApiBase;

        const { protocol, hostname, port } = window.location;

        if (port === '3000' || port === '') {

            return `${protocol}//${hostname}${port ? `:${port}` : ''}/api`;

        }

        return 'http://127.0.0.1:3000/api';

    }



    let optsApiBase = '';



    async function fetchNews(apiBase) {

        const base = apiBase || getApiBase();

        const res = await fetch(`${base}/news`, {

            headers: { Accept: 'application/json' },

        });

        if (!res.ok) {

            const err = new Error(`新聞 API HTTP ${res.status}`);

            err.statusCode = res.status;

            throw err;

        }

        const json = await res.json();

        if (!json?.ok || !Array.isArray(json.items)) {

            throw new Error('新聞 API 回應格式錯誤');

        }

        return json;

    }



    function escapeHtml(str) {

        return String(str || '')

            .replace(/&/g, '&amp;')

            .replace(/</g, '&lt;')

            .replace(/>/g, '&gt;')

            .replace(/"/g, '&quot;');

    }



    function renderNewsItem(item) {

        const breakingClass = item.breaking ? ' dash-map-news-item--breaking' : '';

        const lightning = item.breaking

            ? '<i class="ph ph-lightning" aria-hidden="true"></i>'

            : '';

        return (

            `<a href="${escapeHtml(item.url || '#')}" class="dash-map-news-item${breakingClass}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(item.title)}">`

            + `<span class="dash-map-news-item__source">${lightning}[${escapeHtml(item.source)}]</span>`

            + `<span class="dash-map-news-item__title">${escapeHtml(item.title)}</span>`

            + `<span class="dash-map-news-item__time">${escapeHtml(item.time)}</span>`

            + '</a>'

        );

    }



    function renderNewsList(items) {

        if (!items || items.length === 0) {

            return '<div class="dash-map-news-status">目前無相關新聞</div>';

        }

        return `<div class="dash-map-news-list" role="list">${items.map(renderNewsItem).join('')}</div>`;

    }



    function renderStatus(type, message) {

        if (type === 'loading') {

            return (

                '<div class="dash-map-news-status dash-map-news-status--loading" role="status" aria-live="polite">'

                + '<span class="dash-map-news-status__spinner" aria-hidden="true"></span>'

                + escapeHtml(message || '載入中…')

                + '</div>'

            );

        }

        if (type === 'error') {

            return (

                '<div class="dash-map-news-status dash-map-news-status--error" role="alert">'

                + escapeHtml(message || '新聞載入失敗')

                + '</div>'

            );

        }

        return `<div class="dash-map-news-status">${escapeHtml(message || '')}</div>`;

    }



    function renderSourceStatus(sourceStatus) {

        if (!sourceStatus || !sourceStatus.length) return '';

        const chips = sourceStatus.map((entry) => {

            const label = escapeHtml(entry.source);

            if (entry.ok) {

                return (

                    `<span class="dash-map-news-source dash-map-news-source--ok" title="${label}：正常">`

                    + `<span class="dash-map-news-source__label">${label}</span>`

                    + '</span>'

                );

            }

            const errTip = escapeHtml(entry.error || '載入失敗');

            return (

                `<span class="dash-map-news-source dash-map-news-source--err" title="${label}：${errTip}" role="img" aria-label="${label}來源失效">`

                + `<span class="dash-map-news-source__label">${label}</span>`

                + '<i class="ph ph-warning-circle" aria-hidden="true"></i>'

                + '</span>'

            );

        }).join('');

        return `<div class="dash-map-news-sources" aria-label="新聞來源狀態">${chips}</div>`;

    }



    function renderNewsBlockHtml(options) {

        const opts = options || {};

        const updatedAt = opts.updatedAt || formatTimeHHMM(new Date());

        const items = opts.items || MOCK_NEWS;

        const showBreakingBadge = opts.hasBreaking === true

            || (opts.state === 'demo' && opts.hasBreaking !== false && hasAnyBreaking(items));



        let bodyHtml = '';

        if (opts.state === 'loading') {

            bodyHtml = renderStatus('loading', '載入新聞中…');

        } else if (opts.state === 'error') {

            bodyHtml = renderStatus('error', opts.errorMessage || '無法取得新聞，請稍後再試');

        } else if (opts.state === 'empty') {

            bodyHtml = renderStatus('empty', '目前無相關新聞');

        } else {

            bodyHtml = renderNewsList(items);

        }



        const breakingBadge = showBreakingBadge

            ? '<span class="dash-map-news-block__breaking-badge" aria-label="有重大新聞"><i class="ph ph-lightning" aria-hidden="true"></i>BREAKING</span>'

            : '';



        const collapsed = !!opts.collapsed;

        const hideBtnLabel = collapsed ? '顯示' : '隱藏';

        const sectionClass = collapsed

            ? 'dash-map-news-block dash-map-module dash-map-news-block--collapsed'

            : 'dash-map-news-block dash-map-module';



        const sourceStatusHtml = opts.sourceStatus?.length

            ? renderSourceStatus(opts.sourceStatus)

            : '';



        return (

            `<section class="${sectionClass}" aria-label="即時新聞" data-news-block-root>`

            + '<header class="dash-section-head dash-map-module__head dash-map-news-block__head">'

            + '<div class="swiss-section-heading min-w-0">'

            + '<h2 class="swiss-section-heading__title">即時新聞</h2>'

            + '<p class="swiss-section-subtitle">LIVE NEWS</p>'

            + '</div>'

            + '<div class="flex items-center gap-1.5 shrink-0">'

            + breakingBadge

            + `<button type="button" class="dash-map-news-hide-btn" data-news-toggle-collapse aria-expanded="${collapsed ? 'false' : 'true'}">${hideBtnLabel}</button>`

            + `<span class="dash-section-head__extra font-mono" data-news-updated-at>UPDATED ${escapeHtml(updatedAt)}</span>`

            + '</div>'

            + '</header>'

            + '<div class="dash-map-news-block__expandable">'

            + sourceStatusHtml

            + `<div data-news-body>${bodyHtml}</div>`

            + '</div>'

            + '</section>'

        );

    }



    function bindNewsBlock(root, callbacks) {

        if (!root) return;



        const cbs = callbacks || {};

        let collapsed = !!cbs.initialCollapsed;



        function applyCollapsedState() {

            root.classList.toggle('dash-map-news-block--collapsed', collapsed);

            const btn = root.querySelector('[data-news-toggle-collapse]');

            if (btn) {

                btn.textContent = collapsed ? '顯示' : '隱藏';

                btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

            }

        }



        const collapseBtn = root.querySelector('[data-news-toggle-collapse]');

        if (collapseBtn) {

            collapseBtn.addEventListener('click', () => {

                collapsed = !collapsed;

                applyCollapsedState();

                if (typeof cbs.onCollapseChange === 'function') {

                    cbs.onCollapseChange(collapsed);

                }

            });

        }

        applyCollapsedState();



        return {

            getCollapsed: () => collapsed,

            updateBody: (html) => {

                const body = root.querySelector('[data-news-body]');

                if (body) body.innerHTML = html;

            },

            updateUpdatedAt: (timeStr) => {

                const el = root.querySelector('[data-news-updated-at]');

                if (el) el.textContent = `UPDATED ${timeStr}`;

            },

        };

    }



    function initNewsBlockPreview(options) {

        const opts = options || {};

        optsApiBase = opts.apiBase || '';

        const mountEl = typeof opts.mount === 'string'

            ? document.querySelector(opts.mount)

            : opts.mount;

        if (!mountEl) return null;



        let previewMode = opts.defaultMode || 'live';

        let updatedAt = formatTimeHHMM(new Date());

        let liveData = null;

        let hasBreaking = false;

        let collapsed = false;

        let controller = null;



        async function loadLiveNews(bodyEl) {

            const body = bodyEl || mountEl.querySelector('[data-news-body]');

            if (body) body.innerHTML = renderStatus('loading', '載入新聞中…');

            try {

                const data = await fetchNews(opts.apiBase);

                liveData = data;

                updatedAt = data.updatedAt || formatTimeHHMM(new Date());

                hasBreaking = !!data.hasBreaking;

                render();

                return data;

            } catch (err) {

                previewMode = 'error';

                render();

                throw err;

            }

        }



        function render() {

            const state = previewMode === 'loading'

                ? 'loading'

                : previewMode === 'error'

                    ? 'error'

                    : previewMode === 'empty'

                        ? 'empty'

                        : previewMode;



            const items = previewMode === 'live'

                ? (liveData?.items || [])

                : previewMode === 'demo'

                    ? MOCK_NEWS

                    : [];



            mountEl.innerHTML = renderNewsBlockHtml({

                updatedAt: previewMode === 'live' && liveData?.updatedAt ? liveData.updatedAt : updatedAt,

                state: previewMode === 'live' && !liveData ? 'loading' : state,

                items,

                hasBreaking: previewMode === 'live' ? hasBreaking : undefined,

                sourceStatus: previewMode === 'live' ? (liveData?.sourceStatus || []) : undefined,

                collapsed,

                errorMessage: '無法取得新聞，請稍後再試',

            });



            controller = bindNewsBlock(mountEl.querySelector('[data-news-block-root]'), {

                initialCollapsed: collapsed,

                onCollapseChange: (next) => { collapsed = next; },

            });

        }



        render();

        if (previewMode === 'live') {

            loadLiveNews().catch(() => {});

        }



        return {

            setMode: (mode) => {

                previewMode = mode;

                if (mode === 'live' && !liveData) {

                    render();

                    loadLiveNews().catch(() => {});

                    return;

                }

                render();

            },

            refresh: async () => {

                if (previewMode === 'live') {

                    liveData = null;

                    previewMode = 'loading';

                    render();

                    await loadLiveNews();

                    previewMode = 'live';

                    render();

                    return updatedAt;

                }

                const prevMode = previewMode;

                previewMode = 'loading';

                render();

                await new Promise((resolve) => {

                    setTimeout(resolve, opts.refreshDelayMs || 800);

                });

                previewMode = prevMode === 'loading' ? 'demo' : prevMode;

                updatedAt = formatTimeHHMM(new Date());

                render();

                return updatedAt;

            },

            getController: () => controller,

        };

    }



    const api = {

        MOCK_NEWS,

        formatTimeHHMM,

        fetchNews,

        getApiBase,

        renderNewsBlockHtml,

        renderNewsList,

        renderStatus,

        bindNewsBlock,

        initNewsBlockPreview,

    };



    if (typeof module !== 'undefined' && module.exports) {

        module.exports = api;

    } else {

        global.NewsBlockMock = api;

    }

}(typeof window !== 'undefined' ? window : globalThis));

