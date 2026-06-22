我要結束今天的開發，請依 JCMS 的 VPS Docker 部署流程完成推送與部署。

## 今日變更摘要
- {簡述改了什麼，例如：儀表板地圖圖層、CWA 氣象 proxy、工作地圖機關圖層}

## 請依序執行

### 1. 版號（若有變更）
- `package.json` 為單一來源；格式 `大.小.YYYYMMDD[a-z]`
- 執行 `npm run sync:html-version`，同步：
  - `public/JCMS.html` 本地 script / stylesheet 的 `?v=`
  - **頂端標題列** `JCMS` 旁顯示的版號（勿遺漏，仍顯示舊版為常見疏漏）
- 更新 `README.md` 開發日誌（`### YYYY-MM-DD`）

### 2. 推送前檢查（對照 .cursor/rules/vps-deployment.mdc）
- 確認未 staged：`.env`、`.vscode/`、本機 `.bat`、PM2、runtime 產物
- 確認無 localhost / 127.0.0.1 硬編碼作為正式環境 fallback
- 若有改 docker-compose / .env.example / README，確認與 jcms.example.com、npm_default 一致
- 執行 `docker compose config` 確認 compose 有效
- （可選）本機 `npm start` 或相關 smoke test

### 3. Git
- 檢視 `git status`、`git diff`
- 用 conventional commit 風格撰寫 commit message（feat/fix/refactor/chore/docs）
- 只 commit 與部署相關的檔案
- push 到 GitHub（example-org/JCMS，分支：{main 或你的分支名}）
- 不要 force push

## 約束
- 2GB RAM：production 用 npm ci --omit=dev，勿引入不必要的大型 dev 依賴
- 本機只做 GitHub 同步，不做 VPS 部署與線上驗證
