/** GeoJSON 轉換共用：CSV 解析、文字正規化、Esri 地理編碼 */
const fs = require('fs');
const ESRI_GEOCODE_URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\u3000/g, '')
        .replace(/臺/g, '台')
        .replace(/\s+/g, '')
        .toLowerCase();
}

function normalizeAddress(text) {
    return normalizeText(text)
        .replace(/[一二三四五六七八九十]+段/g, (m) => {
            const map = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
            let out = '';
            for (const ch of m.slice(0, -1)) out += map[ch] || ch;
            return `${out}段`;
        })
        .replace(/地下\d+樓/g, '')
        .replace(/\d+樓/g, '')
        .replace(/之\d+/g, (m) => m.replace('之', ''));
}

function featureDedupKey(name, address) {
    return `${normalizeText(name)}|${normalizeAddress(address)}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeWithEsri(address) {
    const url = `${ESRI_GEOCODE_URL}?f=json&countryCode=TWN&address=${encodeURIComponent(address)}&outFields=Score,Addr_type`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Esri HTTP ${res.status}`);
    const data = await res.json();
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const best = candidates
        .filter((c) => Number(c.score) >= 80)
        .sort((a, b) => Number(b.score) - Number(a.score))[0];
    if (!best?.location) return null;
    return {
        lng: Number(best.location.x),
        lat: Number(best.location.y),
    };
}

/** 離島等地址 Esri 需郵遞區號前綴時再試一次 */
const COUNTY_ZIP_PREFIX = {
    澎湖縣: '880',
    金門縣: '893',
    連江縣: '209',
};

async function geocodeTaiwanAddress(address) {
    const raw = String(address || '').trim();
    if (!raw) return null;
    let coords = await geocodeWithEsri(raw);
    if (coords) return coords;
    if (/^\d{3,5}/.test(raw)) return null;
    for (const [county, zip] of Object.entries(COUNTY_ZIP_PREFIX)) {
        if (raw.includes(county)) {
            coords = await geocodeWithEsri(`${zip}${raw}`);
            if (coords) return coords;
        }
    }
    return null;
}

function readCsvRows(csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return { header: [], rows: [] };
    const header = parseCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        rows.push(parseCsvLine(lines[i]));
    }
    return { header, rows };
}

module.exports = {
    ESRI_GEOCODE_URL,
    parseCsvLine,
    normalizeText,
    normalizeAddress,
    featureDedupKey,
    sleep,
    geocodeWithEsri,
    geocodeTaiwanAddress,
    readCsvRows,
};
