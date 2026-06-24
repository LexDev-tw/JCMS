/** 台灣主流媒體即時新聞 proxy（RSS / 官方 API） */

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_PER_SOURCE = 12;
const MAX_RETURN = 20;

const USER_AGENT = 'JCMS/1.0 (+https://jcms.example.com)';

const JUDICIAL_KEYWORDS = /法院|地檢|法官|檢察官|判決|起訴|上訴|聲押|羈押|司法院|法務部|最高法院|高等法院|地方法院|憲法法庭|懲戒|國民法官|檢察署|律師|羈押|聲請/;
const BREAKING_KEYWORDS = /快訊|突發|重大|緊急|死亡|罹難|【快訊】|【突發】|【重大】/;
const POLITICS_KEYWORDS = /立法院|行政院|總統|內閣|國會|立委|政黨|選舉|罷免|兩岸|國防|外交|部長|國民黨|民進黨|民眾黨|時代力量|監院|監察|人事|內閣|閣員|立院|政見|政策/;
const SOCIAL_KEYWORDS = /社會|車禍|火災|地震|天災|工安|施工|民眾|警方|警消|失蹤|往生|身亡|校園|學生|醫院|疫情|意外|失火|溺水|家暴|槍擊|詐騙|毒駕|酒駕|海嘯|颱風|豪雨|淹水|毒駕|車手|擄人|勒贖|性侵|霸凌/;
const FINANCE_KEYWORDS = /台股|股市|ETF|營收|法人|目標價|財經|債市|投信|基金|匯率|加密貨幣|比特幣|黃金|原油|期貨|殖利率|降息|升息|央行|金控|股價|大盤|指數|財報/;

const EXCLUDED_TITLE = /中時|東森|ETtoday|ettoday|China Times|chinatimes/i;

const RSS_FEEDS = Object.freeze([
    { source: '自由', url: 'https://news.ltn.com.tw/rss/politics.xml', categories: ['politics'] },
    { source: '自由', url: 'https://news.ltn.com.tw/rss/society.xml', categories: ['social'] },
    { source: '聯合', url: 'https://udn.com/news/rssfeed', categories: ['politics', 'social'] },
    { source: '鏡新聞', url: 'https://www.mirrormedia.mg/rss/rss.xml', categories: ['politics', 'social', 'judicial'] },
    { source: '法務部', url: 'https://www.moj.gov.tw/2204/2795/2796/rss', categories: ['judicial'] },
]);

const CNA_CATEGORIES = Object.freeze({
    politics: 'aipl',
    social: 'asoc',
});

const EXPECTED_SOURCES = Object.freeze({
    politics: ['中央社', '自由', '聯合', '鏡新聞'],
    social: ['中央社', '自由', '聯合', '鏡新聞'],
    judicial: ['法務部', '司法院', '鏡新聞'],
});

const EXPECTED_SOURCES_ALL = Object.freeze([
    '中央社', '自由', '聯合', '鏡新聞', '法務部', '司法院',
]);

const NEWS_ITEM_CATEGORIES = new Set(['politics', 'social', 'judicial']);

const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value;
}

function cacheSet(key, value, ttlMs = CACHE_TTL_MS) {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeXmlEntities(text) {
    return stripHtml(text);
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatTimeHHMM(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseRssPubDate(raw) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseCnaDate(raw) {
    const text = String(raw || '').trim();
    const m = text.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

function parseRocDashDate(raw) {
    const text = String(raw || '').trim();
    const m = text.match(/^(\d{3})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]) + 1911;
    return new Date(year, Number(m[2]) - 1, Number(m[3]), 12, 0);
}

function isBreakingTitle(title) {
    return BREAKING_KEYWORDS.test(String(title || ''));
}

function isExcludedTitle(title) {
    return EXCLUDED_TITLE.test(String(title || ''));
}

function matchesJudicial(title) {
    return JUDICIAL_KEYWORDS.test(String(title || ''));
}

function classifyByTitle(title, feedCategories) {
    const text = String(title || '');
    if (FINANCE_KEYWORDS.test(text)) return 'finance';
    if (matchesJudicial(text)) return 'judicial';
    if (POLITICS_KEYWORDS.test(text)) return 'politics';
    if (SOCIAL_KEYWORDS.test(text)) return 'social';
    if (feedCategories?.length === 1) return feedCategories[0];
    return 'social';
}

function passesCategoryFilter(item, targetCategory) {
    if (!item || item.category !== targetCategory) return false;
    if (targetCategory === 'politics' && FINANCE_KEYWORDS.test(item.title)) return false;
    if (item.source === '聯合' || item.source === '鏡新聞') {
        if (targetCategory === 'politics') return POLITICS_KEYWORDS.test(item.title);
        if (targetCategory === 'social') return SOCIAL_KEYWORDS.test(item.title);
        if (targetCategory === 'judicial') return matchesJudicial(item.title);
    }
    return true;
}

function normalizeItem({ source, title, url, pubDate, categoryHint, feedCategories }) {
    const cleanTitle = stripHtml(title);
    if (!cleanTitle || isExcludedTitle(cleanTitle)) return null;
    const date = pubDate instanceof Date && !Number.isNaN(pubDate.getTime()) ? pubDate : new Date();
    const category = categoryHint || classifyByTitle(cleanTitle, feedCategories);
    return {
        source,
        title: cleanTitle,
        url: String(url || '#'),
        pubDate: date.toISOString(),
        time: formatTimeHHMM(date),
        breaking: isBreakingTitle(cleanTitle),
        category,
    };
}

function itemDedupeKey(item) {
    return `${item.source}|${item.url || item.title.slice(0, 48)}`;
}

function mergeItems(lists, category) {
    const map = new Map();
    for (const list of lists) {
        for (const item of list || []) {
            if (!passesCategoryFilter(item, category)) continue;
            const key = itemDedupeKey(item);
            const prev = map.get(key);
            if (!prev || new Date(item.pubDate) > new Date(prev.pubDate)) {
                map.set(key, item);
            }
        }
    }
    return sortAndTrimItems(map);
}

function passesAllFilter(item) {
    if (!item || !NEWS_ITEM_CATEGORIES.has(item.category)) return false;
    return true;
}

function mergeAllItems(lists) {
    const map = new Map();
    for (const list of lists) {
        for (const item of list || []) {
            if (!passesAllFilter(item)) continue;
            const key = itemDedupeKey(item);
            const prev = map.get(key);
            if (!prev || new Date(item.pubDate) > new Date(prev.pubDate)) {
                map.set(key, item);
            }
        }
    }
    return sortAndTrimItems(map);
}

function sortAndTrimItems(map) {
    return [...map.values()]
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .slice(0, MAX_RETURN)
        .map(({ source, title, url, time, breaking }) => ({ source, title, url, time, breaking }));
}

async function fetchText(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/rss+xml, application/xml, text/xml, application/json, text/html, */*',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.statusCode = 502;
        throw err;
    }
    return res.text();
}

function extractRssTag(block, tag) {
    const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
    if (cdata) return decodeXmlEntities(cdata[1]);
    const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
    return plain ? decodeXmlEntities(plain[1]) : '';
}

function parseRssItems(xml, limit = MAX_PER_SOURCE) {
    const items = [];
    const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = re.exec(xml)) && items.length < limit) {
        const block = match[1];
        items.push({
            title: extractRssTag(block, 'title'),
            link: extractRssTag(block, 'link'),
            pubDate: extractRssTag(block, 'pubDate'),
        });
    }
    return items;
}

async function fetchRssFeed(feedDef, { forAll = false } = {}) {
    try {
        const xml = await fetchText(feedDef.url);
        const rawItems = parseRssItems(xml, MAX_PER_SOURCE);
        const out = [];
        for (const raw of rawItems) {
            const item = normalizeItem({
                source: feedDef.source,
                title: raw.title,
                url: raw.link,
                pubDate: parseRssPubDate(raw.pubDate) || new Date(),
                categoryHint: feedDef.categories.length === 1 ? feedDef.categories[0] : undefined,
                feedCategories: feedDef.categories,
            });
            if (!item) continue;
            if (forAll) {
                if (NEWS_ITEM_CATEGORIES.has(item.category)) out.push(item);
            } else if (feedDef.categories.includes(item.category)) {
                out.push(item);
            }
        }
        return { source: feedDef.source, ok: true, items: out, error: null };
    } catch (err) {
        console.warn('[news] RSS 失敗', feedDef.source, feedDef.url, err.message);
        return { source: feedDef.source, ok: false, items: [], error: err.message };
    }
}

async function fetchCnaCategory(categoryKey) {
    const cnaCat = CNA_CATEGORIES[categoryKey];
    if (!cnaCat) return null;
    try {
        const res = await fetch('https://www.cna.com.tw/cna2018api/api/WNewsList', {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: '0',
                category: cnaCat,
                pagesize: MAX_PER_SOURCE,
                pageidx: 1,
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`CNA HTTP ${res.status}`);
        const json = await res.json();
        const rows = json?.ResultData?.Items || [];
        const items = rows.map((row) => normalizeItem({
            source: '中央社',
            title: row.HeadLine,
            url: row.PageUrl,
            pubDate: parseCnaDate(row.CreateTime) || new Date(),
            categoryHint: categoryKey,
            feedCategories: [categoryKey],
        })).filter(Boolean);
        return { source: '中央社', ok: true, items, error: null };
    } catch (err) {
        console.warn('[news] CNA 失敗', categoryKey, err.message);
        return { source: '中央社', ok: false, items: [], error: err.message };
    }
}

async function fetchJudicialYuanNews() {
    try {
        const html = await fetchText('https://www.judicial.gov.tw/NEWS/NewsList.aspx');
        const items = [];
        const cardRe = /<a href="(\/tw\/[^"]+)"[^>]*title="([^"]+)"[^>]*>[\s\S]*?<em>([^<]+)<\/em>[\s\S]*?<span class="news_date">([^<]+)<\/span>/gi;
        let m;
        while ((m = cardRe.exec(html)) && items.length < MAX_PER_SOURCE) {
            const item = normalizeItem({
                source: '司法院',
                title: stripHtml(m[3] || m[2]),
                url: `https://www.judicial.gov.tw${m[1]}`,
                pubDate: parseRocDashDate(m[4]) || new Date(),
                categoryHint: 'judicial',
                feedCategories: ['judicial'],
            });
            if (item) items.push(item);
        }
        const listRe = /<span class="news_date">([^<]+)<\/span><span class="news_title"><a href="(\/tw\/[^"]+)">([^<]+)<\/a>/gi;
        while ((m = listRe.exec(html)) && items.length < MAX_PER_SOURCE) {
            const item = normalizeItem({
                source: '司法院',
                title: stripHtml(m[3]),
                url: `https://www.judicial.gov.tw${m[2]}`,
                pubDate: parseRocDashDate(m[1]) || new Date(),
                categoryHint: 'judicial',
                feedCategories: ['judicial'],
            });
            if (item) items.push(item);
        }
        return { source: '司法院', ok: true, items, error: null };
    } catch (err) {
        console.warn('[news] 司法院 失敗', err.message);
        return { source: '司法院', ok: false, items: [], error: err.message };
    }
}

function buildSourceStatus(results, category) {
    const map = new Map();
    for (const r of results) {
        if (!r?.source) continue;
        const prev = map.get(r.source);
        if (!prev || r.ok) {
            map.set(r.source, {
                source: r.source,
                ok: !!r.ok,
                error: r.ok ? null : (r.error || '載入失敗'),
            });
        }
    }
    const expected = category === 'all'
        ? EXPECTED_SOURCES_ALL
        : (EXPECTED_SOURCES[category] || []);
    return expected.map((source) => map.get(source) || {
        source,
        ok: false,
        error: '來源未回應',
    });
}

function feedsForCategory(category) {
    return RSS_FEEDS.filter((f) => f.categories.includes(category));
}

async function collectCategoryItems(category) {
    const fetchers = [];
    if (CNA_CATEGORIES[category]) {
        fetchers.push(() => fetchCnaCategory(category));
    }
    for (const feed of feedsForCategory(category)) {
        fetchers.push(() => fetchRssFeed(feed));
    }
    if (category === 'judicial') {
        fetchers.push(() => fetchJudicialYuanNews());
    }
    const results = (await Promise.all(fetchers.map((fn) => fn()))).filter(Boolean);
    const sourceStatus = buildSourceStatus(results, category);
    const items = mergeItems(results.map((r) => r.items), category);
    return { items, sourceStatus };
}

async function collectAllItems() {
    const fetchers = [
        () => fetchCnaCategory('politics'),
        () => fetchCnaCategory('social'),
        ...RSS_FEEDS.map((feed) => () => fetchRssFeed(feed, { forAll: true })),
        () => fetchJudicialYuanNews(),
    ];
    const results = (await Promise.all(fetchers.map((fn) => fn()))).filter(Boolean);
    const sourceStatus = buildSourceStatus(results, 'all');
    const items = mergeAllItems(results.map((r) => r.items));
    return { items, sourceStatus };
}

async function getNewsAll() {
    const key = 'news:all';
    const cached = cacheGet(key);
    if (cached) return cached;

    const { items, sourceStatus } = await collectAllItems();
    const payload = {
        ok: true,
        updatedAt: formatTimeHHMM(new Date()),
        hasBreaking: items.some((item) => item.breaking),
        hasSourceErrors: sourceStatus.some((s) => !s.ok),
        items,
        sources: [...new Set(items.map((item) => item.source))],
        sourceStatus,
    };
    if (items.length === 0) {
        const err = new Error('目前無法取得新聞');
        err.statusCode = 503;
        throw err;
    }
    cacheSet(key, payload);
    return payload;
}

async function getNewsCategory(category) {
    const key = `news:${category}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const { items, sourceStatus } = await collectCategoryItems(category);
    const payload = {
        ok: true,
        category,
        updatedAt: formatTimeHHMM(new Date()),
        hasBreaking: items.some((item) => item.breaking),
        hasSourceErrors: sourceStatus.some((s) => !s.ok),
        items,
        sources: [...new Set(items.map((item) => item.source))],
        sourceStatus,
    };
    if (items.length === 0) {
        const err = new Error('目前無法取得新聞');
        err.statusCode = 503;
        throw err;
    }
    cacheSet(key, payload);
    return payload;
}

function normalizeCategory(raw) {
    const text = String(raw || 'politics').trim().toLowerCase();
    if (text === 'social' || text === '社會') return 'social';
    if (text === 'judicial' || text === '司法') return 'judicial';
    return 'politics';
}

module.exports = {
    getNewsAll,
    getNewsCategory,
    normalizeCategory,
    formatTimeHHMM,
};
