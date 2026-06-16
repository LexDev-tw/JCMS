/**
 * JCMS 版號：大版號.小版號.日期流水版號
 * 例：0.1.20260616 → 同日再版 0.1.20260616a → 0.1.20260616b …
 * 跨日重置為 0.1.YYYYMMDD（保留大／小版號）。
 */
const VERSION_RE = /^(\d+)\.(\d+)\.(\d{8})([a-z])?$/;

function formatTodayYmd(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

/**
 * @param {string} current
 * @param {string} [todayYmd]
 * @returns {string}
 */
function bumpVersion(current, todayYmd = formatTodayYmd()) {
    const match = String(current).match(VERSION_RE);
    if (!match) {
        return `0.1.${todayYmd}`;
    }
    const [, major, minor, datePart, suffix] = match;
    if (datePart !== todayYmd) {
        return `${major}.${minor}.${todayYmd}`;
    }
    if (!suffix) {
        return `${major}.${minor}.${todayYmd}a`;
    }
    if (suffix === 'z') {
        throw new Error(
            `Same-day release limit reached (${major}.${minor}.${todayYmd}z); bump major/minor or wait until tomorrow.`
        );
    }
    const next = String.fromCharCode(suffix.charCodeAt(0) + 1);
    return `${major}.${minor}.${todayYmd}${next}`;
}

module.exports = { VERSION_RE, formatTodayYmd, bumpVersion };
