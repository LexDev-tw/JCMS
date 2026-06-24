# JCMS

**J**udicial **C**ase **M**anagement **S**ystem — 司法案件與事務管理系統。

**目前版本：** `0.1.20260624`

## 快速開始（本機）

```bash
npm ci
cp .env.example .env   # Windows: copy .env.example .env
npm start
```

瀏覽 `http://127.0.0.1:3000`。API 金鑰與 OAuth 設定見 `.env.example` 註解；亦可於 UI 內設定 Google Calendar OAuth。

## VPS 部署（Docker + Nginx Proxy Manager）

正式環境以 Docker Compose 運行，TLS 由 **Nginx Proxy Manager（NPM）** 處理。儲存庫內**不含**個人網域；實際網址僅寫在 VPS 本機 `.env`（已在 `.gitignore`，`git pull` 不會覆寫）。

### 首次部署

1. 在 VPS clone 本儲存庫，進入專案目錄。
2. 複製並編輯環境變數：
   ```bash
   cp .env.example .env
   # 編輯 .env：JCMS_PUBLIC_URL=https://你的子網域
   # 依需要填入 GOOGLE_*、CWA_API_KEY、MOENV_API_KEY
   ```
3. 確認 NPM 已建立外部 Docker 網路 `npm_default`（或與 `docker-compose.yml` 一致）。
4. 在 NPM 新增 Proxy Host：`https://你的子網域` → `http://jcms:3000`。
5. 建置並啟動：
   ```bash
   docker compose up -d --build
   ```

### 更新（git pull）

```bash
git pull
docker compose up -d --build
```

資料與上傳檔保存在 Docker volumes（`jcms-data`、`jcms-uploads`），更新映像不會清除。

### 注意事項

- 容器僅 `expose: 3000`，勿在 compose 綁定主機 port；對外由 NPM 代理。
- Google OAuth redirect URI 須為 `{JCMS_PUBLIC_URL}/api/google-calendar/oauth/callback`，並在 Google Cloud Console 登記相同 URI。
- 建議 RAM ≥ 2 GB；production image 使用 `npm ci --omit=dev`。

## 開發日誌

### 2026-06-24

**版號**

- 版號升至 `0.1.20260624`。

**儀表板地圖：即時新聞區塊**

- 總覽地圖左欄新增「即時新聞」模組（`use-dashboard-news.js`、`jcms-news-block.css`）：彙整中央社、自由、聯合、鏡新聞、法務部、司法院等來源，依政經、社會、司法關鍵字篩選；支援 BREAKING 標記、來源狀態與收合。
- 後端 `GET /api/news`（`newsService.js`）：RSS／官方 API proxy、5 分鐘快取；DB 未就緒時仍可回應（stateless API）。

**儀表板地圖：水庫水情圖層**

- 新增水利署水庫位置與即時水情圖層（`dashboard-map-water-reservoir.js`、`waterReservoirService.js`）：圓點依蓄水率著色、標籤顯示名稱與百分比；內建 `wra-reservoir-map-snapshot.json` 備援。
- 後端 `GET /api/water-reservoir/*`；TWD97 TM2 座標轉換（`src/lib/twd97tm2.js`）；建置腳本 `build-wra-reservoir-locations.js`。

**啟動與 API**

- `server.js`：氣象、人口、空品、水庫、新聞等 stateless API 於 SQLite 初始化完成前即可服務，避免總覽地圖圖層等待 DB。

### 2026-06-23

**版號**

- 版號升至 `0.1.20260623`；研習／職務年表附件選檔修正後為 `0.1.20260623a` → `0.1.20260623b`（工作地圖圖層強化）→ `0.1.20260623c`（現在位置常駐、儲存修正、底圖開關右下角）→ `0.1.20260623d`（現在位置 HTML Marker、工作地圖預設行政區界線）→ `0.1.20260623e`（工作地圖進入預設精簡、邊界與名稱分離）→ `0.1.20260623f`（推送）→ `0.1.20260623g`（ES module 快取破除）。

**快取修正（0.1.20260623g）**

- `sync-jcms-html-version` 同步 jcms 目錄內相對 `import` 的 `?v=`，避免版號更新後瀏覽器仍載入舊模組（如 `featureMapCenter` 匯出錯誤）。

**工作地圖編輯（0.1.20260623f）**

- 進入工作地圖不再自動開啟「現在位置」編輯面板；預設僅顯示底圖、現在位置標記與行政區邊界（不含鄉鎮名稱標籤）。
- 內建（司法／警察）與自訂圖層預設隱藏；勾選圖層可見性或點選圖層列後才顯示。
- 右下角開關改為「行政區邊界」（僅縣市／鄉鎮界線）。

**工作地圖編輯（0.1.20260623d）**

- 現在位置改為 MapLibre HTML Marker（不受圖層堆疊遮蓋）；返回總覽頁面時自動重試同步。
- 開啟工作地圖預設顯示行政區界線（縣市／鄉鎮界＋標籤）。

**工作地圖編輯（0.1.20260623c）**

- 開啟工作地圖預設僅顯示「現在位置」；總覽地圖現在位置標記置頂常駐顯示。
- 底圖開關「行政區／正射影像／交通」移至右下角（比照總覽頁面）。
- 修正圖層項目「儲存」：立即寫入 localStorage 並同步地圖。
- 點擊圖層項目清單時，視圖自動移至該地點中心。

**工作地圖編輯**

- 圖層面板新增「交通」「正射影像」底圖開關（與總覽地圖設定同步至 localStorage）。
- 司法／警察改為內建圖層列，與自訂圖層相同樣式；項目展開於圖層列下方，可拖曳調整點位、以點選工具新增。
- 自訂圖層線段於地圖顯示長度標籤；點圖層名稱可重新命名並展開項目，點地圖空白處儲存屬性並收合。
- 總覽地圖「現在位置」以橘色緩慢閃爍標記常駐顯示。

**研習／職務年表：附件選檔失效修正**

- 隱藏檔案 input 自表格 `v-for` 展開列移出，避免 Vue 3 將 `ref` 設為陣列導致「選檔」按鈕無法觸發檔案對話框。

**公開儲存庫隱私清理**

- `.env.example`、README、Cursor 部署規則改為占位網域（`jcms.example.com`）；個人網域與金鑰僅保留在 VPS 本機 `.env`。
- 補充通用 VPS 部署與 `git pull` 更新說明；`prompt-end-of-day.md` 移除個人 GitHub 路徑。

**儀表板地圖：使用分區圖層 VPS 載入修正**

- 合併臺北、新北 GeoJSON 為單一 `urban-plan.geojson`（Docker build 產生；約 20MB → gzip 約 3MB），避免 VPS 上並行下載兩個大檔逾時。
- Express 啟用 `compression` 中介層；新增 `/api/map/urban-plan.geojson` 作為靜態檔備援。
- 前端載入改為優先合併檔、再 API、最後分區檔；偵測 HTML 回應（代理登入頁）並改善錯誤訊息。

### 2026-06-22

**版號**

- 版號升至 `0.1.20260622`；圖層開關對齊修正後為 `0.1.20260622a` → `0.1.20260622b`。

**儀表板地圖：雙北都市計畫使用分區**

- 新增都市計畫圖層（`dashboard-map-urban-plan.js`）：疊加臺北市、新北市使用分區 GeoJSON，支援圖層開關與懸停 popup。
- 圖層堆疊與 `use-dashboard-map-view.js` 整合；工具列顯示載入狀態。
- 新增 `gen:urban-plan-geojson` 腳本（shapefile → GeoJSON，devDependencies）；產出 `public/data/taipei-urban-plan.geojson`、`ntpc-urban-plan.geojson`。

**網站圖示**

- favicon 改為 `public/ico/jcms-icon.png`（移除根目錄 `ico/law-book.*`）。

**圖層開關版面**

- 總覽地圖工具列圖層開關：標籤固定寬度、`white-space: nowrap`、四欄等寬 grid，避免長標籤換行與開關錯位。
- `sync-jcms-html-version` 同步頂端 JCMS 旁版號與 stylesheet `?v=`。

### 2026-06-18

**版號與 UI**

- 版號升至 `0.1.20260618b`；標題列版本改為僅顯示數字（不加 `v` 前綴）。

**手機版版面**

- 新增底部主選單（`jcms-mobile-tabbar`）：總覽、案件、統計、工具、行政、動態。
- 手機版精簡頂部列：隱藏桌面導覽與時鐘，僅保留工作區選擇與 DB 連線指示。
- 總覽詳情（`dashboardDetail`）手機版間距、KPI 網格、中欄區塊順序與統計列寬度調整。

**Google 行事曆**

- OAuth 連結改為直接 `<a href>` 導向授權 URL，避免僅按鈕觸發時在部分環境無法開啟。

### 2026-06-16

**VPS / Docker 部署**

- 移除內建 Caddy TLS profile 與 `Caddyfile`；正式環境改由 **Nginx Proxy Manager** 反向代理。
- `docker-compose.yml`：容器僅 `expose: 3000`、接入外部網路 `npm_default`、記憶體上限 768M；移除 `case_archive` volume。
- 新增 `.cursor/rules/vps-deployment.mdc` 作為推送與部署約束參考；環境變數範例見 `.env.example`。

**儀表板地圖**

- 新增圖層堆疊模組（`dashboard-map-layer-stack.js`）：正射影像作底圖、其餘圖層依序疊上，開啟正射時保留縣市／鄉鎮界線。
- 新增圖層健康狀態列（`dashboard-map-layer-health.js`）：於工具列顯示行政區、人口、交通、正射、地段等圖層載入結果。
- 新增「現在位置」標記（`dashboard-map-current-location.js`），總覽地圖常駐顯示。
- 重構 `use-dashboard-map-view.js`：本地 GeoJSON 行政區界線、圖層協調與錯誤處理強化。

**氣象圖層（CWA）**

- 後端新增 `cwaImageWarp.js`（`pngjs`）：將 CWA 等距圓柱投影 PNG 重投影為 MapLibre 可用的 Web Mercator 角點。
- 衛星雲圖預設產品改為 `vis-tw`（可見光）；新增 `/api/weather/rainfall-obs` 雨量觀測 proxy。
- 前端 `dashboard-map-weather.js` 對應調整衛星／雷達疊圖與雨量標註。

**工作地圖編輯**

- 新增司法／警察機關圖層編輯（`agency-layer-model.js`、`agency-layer-maplibre.js`）：可切換自訂圖層、司法、警察、現在位置等編輯目標。
- `create-app.js` / `JCMS.html`：機關點位表單、工具列 `editTarget` 切換、非自訂模式停用線／面繪製。
- `use-work-map-editor.js` 整合機關圖層同步與現在位置拖放。

