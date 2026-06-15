# 前端上傳附件根目錄

各功能頁面請使用**專屬子資料夾**，與 API 路徑 `POST /api/uploads/{category}` 的 `category` 一致。

| 子資料夾   | 用途     |
|-----------|----------|
| `training/` | 研習紀錄 |
| `career/`   | 個人職務年表附件 |
| `payscale/` | 俸表掃描圖檔 |
| `leave/`    | 休假（預留） |
| `attendance/` | 差勤（預留） |
| `cases/`  | 案件（預留） |
| …         | 新增時請在 `src/routes/uploadRoutes.js` 的 `ALLOWED_CATEGORIES` 註冊 |

實際檔案可由後端寫入此目錄；建議勿將大型二進位檔納入版本庫（見專案 `.gitignore`）。
