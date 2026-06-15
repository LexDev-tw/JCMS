require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const { initDatabase, closeDatabase } = require('./src/config/database');
const caseRoutes = require('./src/routes/caseRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const personalAdminBlobRoutes = require('./src/routes/personalAdminBlobRoutes');
const caseStatsRoutes = require('./src/routes/caseStatsRoutes');
const appSettingsRoutes = require('./src/routes/appSettingsRoutes');
const dynamicsRoutes = require('./src/routes/dynamicsRoutes');
const payscaleDataRoutes = require('./src/routes/payscaleDataRoutes');
const googleCalendarRoutes = require('./src/routes/googleCalendarRoutes');
const weatherRoutes = require('./src/routes/weatherRoutes');
const populationRoutes = require('./src/routes/populationRoutes');
const airQualityRoutes = require('./src/routes/airQualityRoutes');
const routes = require('./src/routes');
const dynamicsController = require('./src/controllers/dynamicsController');
const { notFoundHandler } = require('./src/middleware/notFoundHandler');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT || process.env.JCMS_PORT) || 3000;

app.set('trust proxy', 1);

/** API 須待 SQLite 初始化完成；先 listen 讓啟動腳本與 PM2 健康檢查不必等遷移／FTS。 */
let dbReady = false;

/** @type {import('http').Server | undefined} */
let httpServer;

// 允許 file://、Live Server、跨埠開發、localhost 頁面呼叫 127.0.0.1 API 等情境（含 Origin: null）
app.use(
    cors({
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);
app.options('*', cors({ origin: true }));
// 決議全文匯入可能較長，避免超過預設 ~100kb 導致非預期錯誤；OPTIONS 預檢勿經 JSON body 解析
const jsonBody = express.json({ limit: '8mb' });
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    return jsonBody(req, res, next);
});

const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(__dirname, 'uploads');
app.get('/', (req, res) => {
    res.redirect(302, '/JCMS.html');
});

app.use((req, res, next) => {
    if (dbReady || req.method === 'OPTIONS' || !req.path.startsWith('/api')) {
        return next();
    }
    res.set('Retry-After', '2');
    return res.status(503).json({ ok: false, error: 'Database initializing' });
});

// 先掛 API，避免專案根目錄若有同名路徑被 express.static 攔截
app.use('/api/cases', caseRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/settings', appSettingsRoutes);
app.use('/api/personal', personalAdminBlobRoutes);
app.use('/api/case-stats', caseStatsRoutes);
/** 法官名冊上傳：併掛於此，避免執行中舊式 router 快取未含 /judge-roster 時 404。 */
app.get('/api/dynamics/judge-roster', dynamicsController.getJudgeCourtRoster);
app.post('/api/dynamics/judge-roster', dynamicsController.postJudgeCourtRoster);
app.use('/api/dynamics', dynamicsRoutes);
app.use('/api/payscale-data', payscaleDataRoutes);
app.use('/api/google-calendar', googleCalendarRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/population', populationRoutes);
app.use('/api/air-quality', airQualityRoutes);
app.use('/api', routes);

app.use(
    '/uploads',
    express.static(uploadsDir, {
        setHeaders(res, filePath) {
            const lower = String(filePath || '').toLowerCase();
            if (lower.endsWith('.pdf')) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'inline');
            }
        },
    })
);

app.use(express.static(publicDir));

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await new Promise((resolve, reject) => {
    try {
      httpServer = app.listen(PORT, '0.0.0.0');
      httpServer.once('error', reject);
      httpServer.once('listening', () => {
        httpServer.off('error', reject);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });

  console.log(`JCMS listening on 0.0.0.0:${PORT}; database initializing...`);

  try {
    await initDatabase();
  } catch (err) {
    console.error('Database initialization failed:', err);
    await new Promise((resolve) => {
      if (httpServer) {
        httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
    process.exit(1);
  }

  dbReady = true;
  console.log('Database ready.');
}

function gracefulShutdown(reason) {
  console.log(`[jcms] shutdown: ${reason}`);
  const force = setTimeout(() => process.exit(1), 12000);
  const done = () => {
    clearTimeout(force);
    process.exit(0);
  };
  if (!httpServer) {
    closeDatabase().then(done).catch(done);
    return;
  }
  httpServer.close((err) => {
    if (err) console.error('[jcms] httpServer.close:', err.message);
    closeDatabase().then(done).catch(done);
  });
}

['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => gracefulShutdown(sig));
});

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
