這是 push 到 GitHub 的標準作業流程，請依 JCMS 的 VPS Docker 部署流程完成推送與部署。

## 變更摘要
- {簡述這次改了什麼，例如：儀表板地圖圖層、CWA 氣象 proxy、工作地圖機關圖層}

## 請依序執行

### 1. 版號（推送前必做；本機開發階段勿提前 bump）
- 僅在此 commit & push 流程中更新版號，平日本機改程式碼不動版號
- `package.json` 為單一來源；格式 `大.小.YYYYMMDD[a-z]`
- 執行 `npm run version:bump`，再執行 `npm run sync:html-version`，同步：
  - `public/JCMS.html` 本地 script / stylesheet 的 `?v=`
  - **頂端標題列** `JCMS` 旁顯示的版號（勿遺漏，仍顯示舊版為常見疏漏）
- 更新 `README.md` 開發日誌（`### YYYY-MM-DD`）；**勿**在 README 新增安裝、部署或操作說明（見 `.cursor/rules/repo-documentation.mdc`）

### 2. 推送前檢查（對照 `.cursor/rules/vps-deployment.mdc`、`.cursor/rules/repo-documentation.mdc`）
- 確認未 staged：`.env`、`.vscode/`、本機 `.bat`、PM2、runtime 產物
- 確認無 localhost / 127.0.0.1 硬編碼作為正式環境 fallback
- 確認 README 僅含技術棧與開發日誌；`.env.example` 不含個人網域或帳號；實際網域僅在 VPS `.env`
- 若有改 docker-compose / `.env.example`，確認與 `npm_default` 部署流程一致
- 執行 `docker compose config` 確認 compose 有效
- （可選）本機 `npm start` 或相關 smoke test

### 3. Git
- 檢視 `git status`、`git diff`
- 用 conventional commit 風格撰寫 commit message（feat/fix/refactor/chore/docs）
- 只 commit 與部署相關的檔案
- push 到 GitHub（{你的 org/repo}，分支：{main 或你的分支名}）
- 不要 force push

## 約束
- 本專案 GitHub 公開僅供本人使用，README 不寫安裝／使用教學
- 2GB RAM：production 用 npm ci --omit=dev，勿引入不必要的大型 dev 依賴
- 本機只做 GitHub 同步，不做 VPS 部署與線上驗證
