# JCMS

**J**udicial **C**ase **M**anagement **S**ystem — 司法案件與事務管理系統。

本專案為本機優先（local-first）的整合工作台：Express + SQLite 後端，搭配 Neo-Swiss 風格前端（Vue 主應用與 React 子模組），涵蓋案件、差勤、俸表、動態人事、儀表板地圖等模組。

**目前版本：** `0.0.1`

## 環境需求

- **Node.js** ≥ 18（建議 LTS）
- **Windows** 建議使用內附 `Start-JCMS.bat` 一鍵啟動（會嘗試自動安裝 Node.js）
- 資料庫：SQLite（路徑由 `.env` 的 `DB_PATH` 指定，預設 `./data/app.db`）

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 環境變數

複製範例檔並依需要調整：

```bash
copy .env.example .env
```

主要變數：

| 變數 | 說明 | 預設 |
|------|------|------|
| `PORT` | API 與靜態檔服務埠 | `3000` |
| `DB_PATH` | SQLite 檔案路徑 | `./data/app.db` |

選用整合（Google Calendar、中央氣象署、環境部空氣品質等）請參考 `.env.example` 內註解。**勿將含密鑰的 `.env` 提交至版本庫。**

### 3. 啟動

**Windows（建議）：**

```bat
Start-JCMS.bat
```

成功後瀏覽器會開啟：<http://127.0.0.1:3000/JCMS.html>

**手動啟動：**

```bash
npm run start:jcms
# 或
npm start
```

停止服務：`Shutdown-JCMS.bat` 或 `node scripts/shutdown-jcms.js`

> 建議以 `http://127.0.0.1:3000/JCMS.html` 開啟（勿與 `localhost` 混用，以免 API 跨源問題）。後端程序名稱為 PM2 的 `jcms-api`。

## 專案結構（摘要）

```
├── server.js              # Express 進入點
├── src/                   # 後端（routes / controllers / services）
├── public/
│   ├── JCMS.html          # Vue 主應用
│   ├── apps/              # React 子應用（案件統計、民事工具等）
│   ├── js/jcms/           # 前端模組與 composables
│   └── css/jcms.css       # Neo-Swiss 全域樣式
├── scripts/               # 啟動、資料轉換、維護腳本
├── uploads/               # 使用者上傳（不納入版本庫）
├── case_archive/          # Obsidian 案件筆記庫（不納入版本庫）
└── data/                  # SQLite 與本機資料（不納入版本庫）
```

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發模式（nodemon） |
| `npm run start:jcms` | 透過啟動腳本 supervision 啟動 |
| `npm run gen:police-geojson` | 產生警政機關 GeoJSON |
| `npm run gen:judicial-geojson` | 產生司法機關 GeoJSON |

## 版本與授權

- 版本遵循 [Semantic Versioning](https://semver.org/)；首發為 **0.0.1**。
- 授權：ISC（見 `package.json`）。

## 連結

- 儲存庫：<https://github.com/example-org/JCMS>
