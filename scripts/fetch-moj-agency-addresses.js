/** 下載法務部及所屬機關地址及電話一覽表 → data/judicial/moj-agency-addresses.json */
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'judicial', 'moj-agency-addresses.json');
const JSON_MEDIA_URL = 'https://www.moj.gov.tw/media/17186/387180528174598ca5.json?mediaDL=true';
const PDF_MEDIA_URL = 'https://www.moj.gov.tw/media/17187/5041805281724cac05.pdf?mediaDL=true';

async function resolvePdfUrl() {
    try {
        const res = await fetch(JSON_MEDIA_URL, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`MOJ JSON HTTP ${res.status}`);
        const wrapper = await res.json();
        const entry = Array.isArray(wrapper) ? wrapper[0] : wrapper;
        const contentUrl = entry?.['統計表內容'] || entry?.url;
        if (contentUrl) {
            return contentUrl.startsWith('http') ? contentUrl : `https://www.moj.gov.tw${contentUrl}`;
        }
    } catch (err) {
        console.warn('[fetch-moj] JSON 包裝解析失敗，改用 PDF 直連', err.message);
    }
    return PDF_MEDIA_URL;
}

async function extractPdfRows(buffer) {
    const data = new Uint8Array(buffer);
    const doc = await pdfjs.getDocument({ data }).promise;
    const rows = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const lines = new Map();

        for (const item of content.items) {
            const y = Math.round(item.transform[5]);
            if (!lines.has(y)) lines.set(y, []);
            lines.get(y).push({ x: item.transform[4], str: item.str });
        }

        const sortedYs = [...lines.keys()].sort((a, b) => b - a);
        for (const y of sortedYs) {
            const parts = lines.get(y)
                .sort((a, b) => a.x - b.x)
                .map((entry) => entry.str.trim())
                .filter(Boolean);
            if (!parts.length || parts[0] === '機關名稱') continue;

            const name = parts[0] || '';
            const address = parts[1] || '';
            const phone = parts[2] || '';
            if (!name || !address) continue;

            rows.push({
                name: name.replace(/地方法察署/g, '地方檢察署'),
                address,
                phone,
            });
        }
    }

    return rows;
}

async function fetchAgencyRows() {
    const pdfUrl = await resolvePdfUrl();
    console.log(`[fetch-moj] 下載地址表 ${pdfUrl}`);
    const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(60000) });
    if (!pdfRes.ok) throw new Error(`MOJ PDF HTTP ${pdfRes.status}`);
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    const rows = await extractPdfRows(buffer);
    if (!rows.length) throw new Error('地址表解析結果為空');
    return { fetchedAt: new Date().toISOString(), sourceUrl: pdfUrl, rows };
}

async function main() {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    const data = await fetchAgencyRows();
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`[fetch-moj] 已寫入 ${OUT_PATH}（${data.rows.length} 筆）`);
}

main().catch((err) => {
    console.error('[fetch-moj] 失敗', err);
    process.exit(1);
});
