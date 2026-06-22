# JCMS

**J**udicial **C**ase **M**anagement **S**ystem — 司法案件與事務管理系統。

**目前版本：** `0.1.0`  

## 開發日誌

### 2026-06-22

**版號**

- 版號升至 `0.1.20260622`。

**儀表板地圖：雙北都市計畫使用分區**

- 新增都市計畫圖層（`dashboard-map-urban-plan.js`）：疊加臺北市、新北市使用分區 GeoJSON，支援圖層開關與懸停 popup。
- 圖層堆疊與 `use-dashboard-map-view.js` 整合；工具列顯示載入狀態。
- 新增 `gen:urban-plan-geojson` 腳本（shapefile → GeoJSON，devDependencies）；產出 `public/data/taipei-urban-plan.geojson`、`ntpc-urban-plan.geojson`。

**網站圖示**

- favicon 改為 `public/ico/jcms-icon.png`（移除根目錄 `ico/law-book.*`）。

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

- 移除內建 Caddy TLS profile 與 `Caddyfile`；正式環境改由 **Nginx Proxy Manager** 反向代理 `jcms.example.com`。
- `docker-compose.yml`：容器僅 `expose: 3000`、接入外部網路 `npm_default`、記憶體上限 768M；移除 `case_archive` volume。
- `.env.example` / README 預設網域改為 `https://jcms.example.com`；補充 NPM 部署步驟與 `git pull` 更新流程。
- 新增 `.cursor/rules/vps-deployment.mdc` 作為推送與部署約束參考。

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
