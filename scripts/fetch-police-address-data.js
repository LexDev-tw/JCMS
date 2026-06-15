/** 下載警政署全國警察機關地址 CSV（dataset 5958 / TGOS 1150528） */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_CSV = path.join(ROOT, 'data', 'police', 'PoliceAddress1_1150528.csv');
const ZIP_PATH = path.join(ROOT, 'temp', 'police-5958.zip');
const EXTRACT_DIR = path.join(ROOT, 'temp', 'police-5958');
const EXTRACTED_CSV = path.join(EXTRACT_DIR, 'PoliceAddress1_1150528.csv');
const ZIP_URL = 'https://www.tgos.tw/tgos/VirtualDir/Product/9927eb8a-efed-40c0-8bc4-83121ad6834a/1150528.zip';

function ensureExtracted() {
    if (fs.existsSync(EXTRACTED_CSV)) return EXTRACTED_CSV;

    fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true });
    if (!fs.existsSync(ZIP_PATH)) {
        console.log('[fetch-police] 下載 TGOS 1150528.zip…');
        execSync(`curl -s -L -m 90 -o "${ZIP_PATH}" "${ZIP_URL}"`, { stdio: 'inherit' });
    }

    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    console.log('[fetch-police] 解壓縮…');
    execSync(
        `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_DIR}' -Force"`,
        { stdio: 'inherit' }
    );

    if (!fs.existsSync(EXTRACTED_CSV)) {
        throw new Error(`解壓後找不到 ${EXTRACTED_CSV}`);
    }
    return EXTRACTED_CSV;
}

function main() {
    const src = ensureExtracted();
    fs.mkdirSync(path.dirname(LOCAL_CSV), { recursive: true });
    fs.copyFileSync(src, LOCAL_CSV);
    console.log(`已固化 → ${LOCAL_CSV}`);
}

main();
