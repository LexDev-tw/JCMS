# JCMS

**J**udicial **C**ase **M**anagement **S**ystem — 司法案件與事務管理系統。

本儲存庫為 **VPS Docker 部署版**：單一 Express 容器同時提供 API 與靜態前端（`JCMS.html`），資料持久化於 Docker volumes（SQLite、上傳檔）。

**目前版本：** `0.1.0`

## 環境需求

- Docker Engine 24+ 與 Docker Compose v2
- VPS 需能連外網（前端 CDN、氣象／空品 API 等）
- 建議至少 1 GB RAM、10 GB 磁碟

## 快速部署

### 1. 取得程式碼

```bash
git clone https://github.com/example-org/JCMS.git
cd JCMS
```

### 2. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，至少確認：

| 變數 | 說明 |
|------|------|
| `PORT` | 容器內埠（預設 `3000`，通常不需改） |
| `DB_PATH` | SQLite 路徑（預設 `/app/data/app.db`） |
| `JCMS_PUBLIC_URL` | 對外 HTTPS 網址，如 `https://jcms.example.com`（OAuth 建議設定） |
| `CWA_API_KEY` / `MOENV_API_KEY` | 儀表板氣象／空品（選用） |
| `GOOGLE_*` | Google Calendar OAuth（選用） |

**勿將 `.env` 提交至版本庫。**

### 3. 啟動（HTTP，對外埠 3000）

```bash
docker compose up -d --build
```

開啟：`http://<VPS_IP>:3000/JCMS.html`（或 `http://<VPS_IP>:3000/`，會自動導向）

### 4. 啟動（HTTPS，Caddy 反向代理）

在 `.env` 設定：

```env
JCMS_DOMAIN=jcms.example.com
JCMS_PUBLIC_URL=https://jcms.example.com
GOOGLE_OAUTH_REDIRECT_URI=https://jcms.example.com/api/google-calendar/oauth/callback
```

並將 DNS A 記錄指向 VPS，然後：

```bash
docker compose --profile tls up -d --build
```

瀏覽器開啟：`https://jcms.example.com/JCMS.html`

> 使用 `tls` profile 時，建議將 `JCMS_PUBLISH_PORT` 留空或註解，僅由 Caddy 對外 80/443。

## 常用指令

```bash
# 查看狀態
docker compose ps

# 查看日誌
docker compose logs -f jcms

# 停止
docker compose down

# 資料庫維護（範例）
docker compose exec jcms node scripts/repair-dynamics-fts.js
```

## 資料持久化

| Volume | 掛載路徑 | 用途 |
|--------|----------|------|
| `jcms-data` | `/app/data` | SQLite 資料庫 |
| `jcms-uploads` | `/app/uploads` | 使用者上傳附件 |
| `jcms-case-archive` | `/app/case_archive` | Obsidian 案件筆記庫（選用） |

## 架構摘要

```
瀏覽器 ──► Caddy :443（選用 tls profile）
              └──► jcms:3000
                     ├── /api/*   Express API
                     ├── /uploads 靜態附件
                     └── /JCMS.html  Vue 主應用 + React 子模組
```

前端 API 預設使用同源相對路徑 `/api`，適用於反向代理部署。

## 專案結構

```
├── Dockerfile / docker-compose.yml / Caddyfile
├── server.js              # Express 進入點
├── src/                   # 後端 API
├── public/                # 前端靜態資源
├── scripts/               # 維護與 GeoJSON 產生腳本
├── uploads/               # 上傳目錄結構（實際檔案在 volume）
└── data/                  # 本機開發用；正式環境使用 volume
```

## 連結

- 儲存庫：<https://github.com/example-org/JCMS>
