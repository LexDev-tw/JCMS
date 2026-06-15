/** 內政部戶政司 ODRP013：村里人口加總為鄉鎮市區（供地圖標籤） */
const MOI_BASE = 'https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP013';

const CANDIDATE_MONTHS = [
    11505, 11504, 11503, 11502, 11501,
    11412, 11411, 11410,
];

let cache = null;

function normalizeAreaKey(text) {
    return String(text || '').replace(/\u3000/g, '').replace(/臺/g, '台').replace(/\s+/g, '').trim();
}

function parsePopulation(value) {
    const n = parseInt(String(value || '').replace(/,/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function fetchMoiPage(yyymm, page) {
    const url = `${MOI_BASE}/${yyymm}?PAGE=${page}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`MOI HTTP ${res.status}`);
    const body = await res.json();
    if (!body || body.responseCode !== 'OD-0101-S' || !Array.isArray(body.responseData)) {
        throw new Error(body?.responseMessage || 'MOI 回應格式異常');
    }
    return body;
}

async function fetchAllRowsForMonth(yyymm) {
    const first = await fetchMoiPage(yyymm, 1);
    const totalPage = Math.max(1, parseInt(first.totalPage, 10) || 1);
    const rows = [...first.responseData];
    for (let page = 2; page <= totalPage; page += 1) {
        const next = await fetchMoiPage(yyymm, page);
        rows.push(...next.responseData);
    }
    return rows;
}

function aggregateByTown(rows) {
    const byTown = new Map();
    for (const row of rows) {
        const key = normalizeAreaKey(row.site_id || row.區域別);
        if (!key) continue;
        const pop = parsePopulation(row.people_total ?? row.總計);
        byTown.set(key, (byTown.get(key) || 0) + pop);
    }
    return byTown;
}

async function loadLatestTownPopulation() {
    if (cache && Date.now() - cache.at < 6 * 60 * 60 * 1000) {
        return cache.payload;
    }

    let lastError = null;
    for (const yyymm of CANDIDATE_MONTHS) {
        try {
            const rows = await fetchAllRowsForMonth(yyymm);
            if (!rows.length) continue;
            const towns = {};
            aggregateByTown(rows).forEach((population, key) => {
                towns[key] = population;
            });
            const payload = {
                statisticYyymm: String(yyymm),
                sourceAgency: '內政部戶政司',
                sourceDataset: '現住人口數按性別及原住民身分分（ODRP013）',
                townCount: Object.keys(towns).length,
                towns,
            };
            cache = { at: Date.now(), payload };
            return payload;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('無法取得人口資料');
}

async function getTownPopulationLatest(req, res, next) {
    try {
        const data = await loadLatestTownPopulation();
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getTownPopulationLatest,
    normalizeAreaKey,
};
