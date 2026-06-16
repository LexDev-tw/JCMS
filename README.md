# JCMS

**J**udicial **C**ase **M**anagement **S**ystem — 司法案件與事務管理系統。

本儲存庫為 **VPS Docker 部署版**：單一 Express 容器同時提供 API 與靜態前端（`JCMS.html`），資料持久化於 Docker volumes（SQLite、上傳檔）。

**目前版本：** `0.1.0`  
**正式網址：** https://jcms.example.com

## 環境需求

- **VPS**：VPS、Ubuntu、**2 GB RAM**
- Docker Engine 24+ 與 Docker Compose v2
- **Nginx Proxy Manager（NPM）** 已運行，且存在 Docker 外部網路 **`npm_default`**
- VPS 需能連外網（前端 CDN、氣象／空品 API 等）

## 快速部署（VPS）

### 1. 取得程式碼

```bash
git clone https://github.com/example-org/JCMS.git
cd JCMS
```

更新既有部署：

```bash
git pull
docker compose up -d --build
```

### 2. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入 API 金鑰等。預設已含：

| 變數 | 說明 |
|------|------|
| `JCMS_PUBLIC_URL` | `https://jcms.example.com` |
| `DB_PATH` | `/app/data/app.db` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://jcms.example.com/api/google-calendar/oauth/callback`（若用 Google Calendar） |

**勿將 `.env` 提交至版本庫。**

### 3. 確認 NPM 網路

```bash
docker network ls | grep npm_default
```

若不存在，請先依 NPM 安裝方式建立該網路，或將 NPM 容器接入同名網路。

### 4. 啟動 JCMS

```bash
docker compose up -d --build
```

容器 `jcms` 僅在 **`npm_default`** 內暴露埠 `3000`，不直接綁定主機埠。

### 5. NPM 反向代理

在 Nginx Proxy Manager 新增 **Proxy Host**：

| 欄位 | 值 |
|------|-----|
| Domain | `jcms.example.com` |
| Forward Hostname / IP | `jcms` |
| Forward Port | `3000` |
| SSL | 申請 Let's Encrypt 憑證 |

儲存後以 https://jcms.example.com/JCMS.html 存取。

## 本機開發（不推送）

```bash
npm install
# .env 設 DB_PATH=./data/app.db
npm start
```

開啟 http://127.0.0.1:3000/JCMS.html 。本機 IDE 設定放於 `.vscode/`（已 gitignore）。

## 常用指令

```bash
docker compose ps
docker compose logs -f jcms
docker compose exec jcms node scripts/repair-dynamics-fts.js
```

## 資料持久化

| Volume | 掛載路徑 | 用途 |
|--------|----------|------|
| `jcms-data` | `/app/data` | SQLite |
| `jcms-uploads` | `/app/uploads` | 上傳附件 |

## 連結

- 儲存庫：<https://github.com/example-org/JCMS>

## 開發日誌

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
