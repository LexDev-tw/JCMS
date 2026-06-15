const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'app.db');

let db;

function ensureDataDirectory() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function attachAsyncApi(instance) {
  instance.runAsync = function runAsync(sql, ...params) {
    return new Promise((resolve, reject) => {
      instance.run(sql, ...params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  };
  instance.getAsync = promisify(instance.get.bind(instance));
  instance.allAsync = promisify(instance.all.bind(instance));
  return instance;
}

function shouldRunStartupQuickCheck() {
  const flag = String(process.env.JCMS_STARTUP_QUICK_CHECK || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

const CREATE_CASES_TABLE = `
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  "isPinned" INTEGER NOT NULL DEFAULT 0 CHECK("isPinned" IN (0, 1)),
  "seqTotal" INTEGER,
  "year" TEXT,
  "word" TEXT,
  "number" TEXT,
  "reason" TEXT,
  "activeParty" TEXT,
  "passiveParty" TEXT,
  "dates" TEXT,
  "closeDate" TEXT,
  "closeReason" TEXT,
  "targetAmount" TEXT,
  "judgmentAmount" TEXT,
  "note" TEXT,
  "workspaceId" TEXT,
  "filingDateRoc7" TEXT,
  "courtFee" TEXT,
  "courtFeeDetailJson" TEXT NOT NULL DEFAULT '{}',
  "proceedingsJson" TEXT NOT NULL DEFAULT '[]'
);
`;

/** 與 caseService INSERTABLE_KEYS 一致；重建表時僅複製此集合（排除下列 obsolete）。 */
const CASE_CANONICAL_COLUMNS = [
  'id',
  'isPinned',
  'seqTotal',
  'year',
  'word',
  'number',
  'reason',
  'activeParty',
  'passiveParty',
  'dates',
  'closeDate',
  'closeReason',
  'targetAmount',
  'judgmentAmount',
  'note',
  'workspaceId',
  'filingDateRoc7',
  'courtFee',
  'courtFeeDetailJson',
  'proceedingsJson',
  'partiesJson',
];

/** 應用程式已不再讀寫的 cases 欄位，啟動／離線腳本會自 SQLite 卸除。 */
const OBSOLETE_CASE_COLUMNS = ['parentCaseId'];

function buildCasesCanonicalCreateSql(tableName) {
  return `
CREATE TABLE ${tableName} (
  id TEXT PRIMARY KEY,
  "isPinned" INTEGER NOT NULL DEFAULT 0 CHECK("isPinned" IN (0, 1)),
  "seqTotal" INTEGER,
  "year" TEXT,
  "word" TEXT,
  "number" TEXT,
  "reason" TEXT,
  "activeParty" TEXT,
  "passiveParty" TEXT,
  "dates" TEXT,
  "closeDate" TEXT,
  "closeReason" TEXT,
  "targetAmount" TEXT,
  "judgmentAmount" TEXT,
  "note" TEXT,
  "workspaceId" TEXT,
  "filingDateRoc7" TEXT,
  "courtFee" TEXT,
  "courtFeeDetailJson" TEXT NOT NULL DEFAULT '{}',
  "proceedingsJson" TEXT NOT NULL DEFAULT '[]',
  "partiesJson" TEXT NOT NULL DEFAULT '{}'
)`.trim();
}

async function rebuildCasesTableStrippingObsolete(database) {
  const pragma = await database.allAsync('PRAGMA table_info(cases)');
  const oldNames = new Set(pragma.map((c) => c.name));
  const copyCols = CASE_CANONICAL_COLUMNS.filter((n) => oldNames.has(n));
  if (!copyCols.includes('id')) {
    throw new Error('[jcms] cases migration: source table missing id');
  }
  const list = copyCols.map((c) => `"${c}"`).join(', ');
  await database.runAsync('PRAGMA foreign_keys = OFF');
  await database.runAsync('BEGIN');
  try {
    await database.runAsync('DROP TABLE IF EXISTS cases__jcms_canonical');
    await database.runAsync(buildCasesCanonicalCreateSql('cases__jcms_canonical'));
    await database.runAsync(
      `INSERT INTO cases__jcms_canonical (${list}) SELECT ${list} FROM cases`
    );
    await database.runAsync('DROP TABLE cases');
    await database.runAsync('ALTER TABLE cases__jcms_canonical RENAME TO cases');
    await database.runAsync('COMMIT');
  } catch (e) {
    await database.runAsync('ROLLBACK').catch(() => {});
    await database.runAsync('DROP TABLE IF EXISTS cases__jcms_canonical').catch(() => {});
    throw e;
  } finally {
    await database.runAsync('PRAGMA foreign_keys = ON');
  }
}

async function ensureCasesDropObsoleteColumns(database) {
  const pragma = await database.allAsync('PRAGMA table_info(cases)');
  const names = new Set(pragma.map((c) => c.name));
  const toRemove = OBSOLETE_CASE_COLUMNS.filter((c) => names.has(c));
  if (toRemove.length === 0) return;

  try {
    for (const col of toRemove) {
      await database.runAsync(`ALTER TABLE cases DROP COLUMN "${col}"`);
    }
  } catch {
    await rebuildCasesTableStrippingObsolete(database);
  }
}

function sqliteQuoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * 舊版可能在 cases 上建立綁定 parentCaseId 的 TRIGGER；欄位卸除後仍會在 DELETE 時執行而報錯。
 */
async function ensureCasesObsoleteTriggersAndViewsDropped(database) {
  const re = /parentCaseId/i;
  const triggers = await database.allAsync(
    "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'"
  );
  for (const t of triggers) {
    if (!t.sql || !re.test(String(t.sql))) continue;
    try {
      await database.runAsync(`DROP TRIGGER IF EXISTS ${sqliteQuoteIdent(t.name)}`);
      console.warn('[jcms] Removed obsolete SQLite trigger (parentCaseId):', t.name);
    } catch (e) {
      console.warn('[jcms] Failed to drop trigger', t.name, e.message);
    }
  }
  const views = await database.allAsync(
    "SELECT name, sql FROM sqlite_master WHERE type = 'view'"
  );
  for (const v of views) {
    if (!v.sql || !re.test(String(v.sql))) continue;
    try {
      await database.runAsync(`DROP VIEW IF EXISTS ${sqliteQuoteIdent(v.name)}`);
      console.warn('[jcms] Removed obsolete SQLite view (parentCaseId):', v.name);
    } catch (e) {
      console.warn('[jcms] Failed to drop view', v.name, e.message);
    }
  }
}

async function ensureCasesWorkspaceColumn(database) {
  const cols = await database.allAsync('PRAGMA table_info(cases)');
  const has = cols.some((c) => c.name === 'workspaceId');
  if (!has) {
    await database.runAsync('ALTER TABLE cases ADD COLUMN "workspaceId" TEXT');
    await database.runAsync(
      'UPDATE cases SET "workspaceId" = ? WHERE "workspaceId" IS NULL',
      ['WS_001']
    );
  }
}

async function ensureCasesCaseDetailColumns(database) {
  const cols = await database.allAsync('PRAGMA table_info(cases)');
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('filingDateRoc7')) {
    await database.runAsync('ALTER TABLE cases ADD COLUMN "filingDateRoc7" TEXT');
  }
  if (!names.has('courtFee')) {
    await database.runAsync('ALTER TABLE cases ADD COLUMN "courtFee" TEXT');
  }
  if (!names.has('proceedingsJson')) {
    await database.runAsync(
      'ALTER TABLE cases ADD COLUMN "proceedingsJson" TEXT NOT NULL DEFAULT \'[]\''
    );
  }
}

async function ensureCasesPartiesJsonColumn(database) {
  const cols = await database.allAsync('PRAGMA table_info(cases)');
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('partiesJson')) {
    await database.runAsync(
      'ALTER TABLE cases ADD COLUMN "partiesJson" TEXT NOT NULL DEFAULT \'{}\''
    );
  }
}

async function ensureCasesCourtFeeDetailJsonColumn(database) {
  const cols = await database.allAsync('PRAGMA table_info(cases)');
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('courtFeeDetailJson')) {
    await database.runAsync(
      'ALTER TABLE cases ADD COLUMN "courtFeeDetailJson" TEXT NOT NULL DEFAULT \'{}\''
    );
  }
}

const CREATE_PERSONAL_PAYSCALE_TABLE = `
CREATE TABLE IF NOT EXISTS personal_payscale (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  row_overrides TEXT NOT NULL DEFAULT '{}',
  my_grade INTEGER NOT NULL DEFAULT 0,
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT
);
`;

async function ensurePersonalPayscaleRow(database) {
  await database.runAsync(CREATE_PERSONAL_PAYSCALE_TABLE);
  await database.runAsync(
    `INSERT OR IGNORE INTO personal_payscale (id, row_overrides, my_grade, artifacts_json) VALUES (1, '{}', 0, '[]')`
  );
}

const CREATE_APP_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);
`;

const CREATE_PERSONAL_ADMIN_TABLE = `
CREATE TABLE IF NOT EXISTS personal_admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);
`;

const CREATE_CASE_STATS_TABLE = `
CREATE TABLE IF NOT EXISTS case_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT
);
`;

const CREATE_GOOGLE_CALENDAR_TOKENS_TABLE = `
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token_enc TEXT,
  access_token TEXT,
  expires_at TEXT,
  email TEXT,
  connected_at TEXT,
  updated_at TEXT
);
`;

async function ensureGoogleCalendarTokensRow(database) {
  await database.runAsync(CREATE_GOOGLE_CALENDAR_TOKENS_TABLE);
  await database.runAsync(`INSERT OR IGNORE INTO google_calendar_tokens (id) VALUES (1)`);
}

async function ensureAppSettingsAndPersonalAdminRows(database) {
  await database.runAsync(CREATE_APP_SETTINGS_TABLE);
  await database.runAsync(CREATE_PERSONAL_ADMIN_TABLE);
  await database.runAsync(CREATE_CASE_STATS_TABLE);
  await database.runAsync(`INSERT OR IGNORE INTO app_settings (id, json) VALUES (1, '{}')`);
  await database.runAsync(`INSERT OR IGNORE INTO personal_admin (id, json) VALUES (1, '{}')`);
  await database.runAsync(`INSERT OR IGNORE INTO case_stats (id, json) VALUES (1, '{"byWorkspace":{}}')`);
  await ensureGoogleCalendarTokensRow(database);
}

const CREATE_DYNAMICS_PERSON_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_person (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'judge' CHECK(role IN ('judge','prosecutor','lawyer','scholar')),
  display_name TEXT NOT NULL,
  class_year TEXT,
  notes TEXT,
  notes_attachments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/** 舊版若含 gender 或 role check 不含 scholar，重建 dynamics_person（保留 id 與關聯）。 */
async function ensureDynamicsPersonSchema(database) {
  const row = await database.getAsync(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='dynamics_person'"
  );
  if (!row || typeof row.sql !== 'string') return;
  const hasScholarRole = row.sql.includes("'scholar'");
  const hasGenderColumn = /\bgender\b/i.test(row.sql);
  if (hasScholarRole && !hasGenderColumn) return;

  await database.runAsync('PRAGMA foreign_keys = OFF');
  await database.runAsync('BEGIN');
  try {
    await database.runAsync(`CREATE TABLE dynamics_person__jcms_mig (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'judge' CHECK(role IN ('judge','prosecutor','lawyer','scholar')),
      display_name TEXT NOT NULL,
      class_year TEXT,
      notes TEXT,
      notes_attachments TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await database.runAsync(`INSERT INTO dynamics_person__jcms_mig (
      id, role, display_name, class_year, notes, notes_attachments, created_at, updated_at
    )
    SELECT
      id,
      role,
      display_name,
      class_year,
      notes,
      '[]',
      created_at,
      updated_at
    FROM dynamics_person`);
    await database.runAsync('DROP TABLE dynamics_person');
    await database.runAsync('ALTER TABLE dynamics_person__jcms_mig RENAME TO dynamics_person');
    await database.runAsync(
      'CREATE INDEX IF NOT EXISTS idx_dynamics_person_name ON dynamics_person(display_name)'
    );
    await database.runAsync('COMMIT');
  } catch (e) {
    await database.runAsync('ROLLBACK').catch(() => {});
    await database.runAsync('DROP TABLE IF EXISTS dynamics_person__jcms_mig').catch(() => {});
    throw e;
  } finally {
    await database.runAsync('PRAGMA foreign_keys = ON');
  }
}

const CREATE_DYNAMICS_EVENT_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_event (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  occurred_on TEXT,
  kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('resolution','news','note','other')),
  summary TEXT,
  raw_text TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  source_channel TEXT NOT NULL DEFAULT 'person_direct' CHECK(source_channel IN ('bulk_parse','person_direct')),
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES dynamics_person(id) ON DELETE CASCADE
);
`;

async function ensureDynamicsAttachmentColumns(database) {
  const personCols = await database.allAsync('PRAGMA table_info(dynamics_person)');
  const hasPersonNotesAttachments = personCols.some((c) => c.name === 'notes_attachments');
  if (!hasPersonNotesAttachments) {
    await database.runAsync("ALTER TABLE dynamics_person ADD COLUMN notes_attachments TEXT NOT NULL DEFAULT '[]'");
  }

  const eventCols = await database.allAsync('PRAGMA table_info(dynamics_event)');
  const hasEventAttachments = eventCols.some((c) => c.name === 'attachments');
  if (!hasEventAttachments) {
    await database.runAsync("ALTER TABLE dynamics_event ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
  }
}

const CREATE_DYNAMICS_IMPORT_BATCH_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_import_batch (
  id TEXT PRIMARY KEY,
  title TEXT,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'parsed' CHECK(status IN ('parsed','committed','discarded')),
  created_at TEXT NOT NULL
);
`;

const CREATE_DYNAMICS_PROPOSAL_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_proposal (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  suggested_person_name TEXT NOT NULL,
  person_id TEXT,
  occurred_on TEXT,
  kind TEXT NOT NULL DEFAULT 'resolution' CHECK(kind IN ('resolution','news','note','other')),
  summary TEXT,
  excerpt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES dynamics_import_batch(id) ON DELETE CASCADE
);
`;

const CREATE_DYNAMICS_NGRAM_POSTING_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_ngram_posting (
  token TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('person','event')),
  person_id TEXT NOT NULL,
  tf INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (token, ref_id, kind)
);
`;

const CREATE_DYNAMICS_SEARCH_META_TABLE = `
CREATE TABLE IF NOT EXISTS dynamics_search_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

async function ensureDynamicsTables(database) {
  await database.runAsync(CREATE_DYNAMICS_PERSON_TABLE);
  await database.runAsync(CREATE_DYNAMICS_IMPORT_BATCH_TABLE);
  await database.runAsync(CREATE_DYNAMICS_EVENT_TABLE);
  await database.runAsync(CREATE_DYNAMICS_PROPOSAL_TABLE);
  await database.runAsync(CREATE_DYNAMICS_NGRAM_POSTING_TABLE);
  await database.runAsync(CREATE_DYNAMICS_SEARCH_META_TABLE);
  await database.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_dynamics_event_person ON dynamics_event(person_id, occurred_on)'
  );
  await database.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_dynamics_proposal_batch ON dynamics_proposal(batch_id, status)'
  );
  await database.runAsync('CREATE INDEX IF NOT EXISTS idx_dynamics_person_name ON dynamics_person(display_name)');
  await database.runAsync('CREATE INDEX IF NOT EXISTS idx_dynamics_ngram_token ON dynamics_ngram_posting(token)');
  await database.runAsync('CREATE INDEX IF NOT EXISTS idx_dynamics_ngram_ref ON dynamics_ngram_posting(ref_id, kind)');
  await database.runAsync('CREATE INDEX IF NOT EXISTS idx_dynamics_ngram_person ON dynamics_ngram_posting(person_id)');
  await ensureDynamicsAttachmentColumns(database);
}

const DYNAMICS_FTS_CREATE = `
CREATE VIRTUAL TABLE IF NOT EXISTS dynamics_fts USING fts5(
  ref_id UNINDEXED,
  kind UNINDEXED,
  person_id UNINDEXED,
  body,
  tokenize = 'unicode61',
  prefix = '1 2 3'
);
`;

const DYNAMICS_FTS_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS dynamics_person_fts_ai AFTER INSERT ON dynamics_person BEGIN
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    VALUES (
      NEW.id,
      'person',
      NEW.id,
      trim(coalesce(NEW.display_name, '') || ' ' || coalesce(NEW.class_year, '') || ' ' || coalesce(NEW.notes, ''))
    );
  END`,
  `CREATE TRIGGER IF NOT EXISTS dynamics_person_fts_au AFTER UPDATE ON dynamics_person BEGIN
    DELETE FROM dynamics_fts WHERE ref_id = OLD.id AND kind = 'person';
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    VALUES (
      NEW.id,
      'person',
      NEW.id,
      trim(coalesce(NEW.display_name, '') || ' ' || coalesce(NEW.class_year, '') || ' ' || coalesce(NEW.notes, ''))
    );
  END`,
  `CREATE TRIGGER IF NOT EXISTS dynamics_person_fts_ad AFTER DELETE ON dynamics_person BEGIN
    DELETE FROM dynamics_fts WHERE ref_id = OLD.id AND kind = 'person';
  END`,
  `CREATE TRIGGER IF NOT EXISTS dynamics_event_fts_ai AFTER INSERT ON dynamics_event BEGIN
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    VALUES (
      NEW.id,
      'event',
      NEW.person_id,
      trim(coalesce(NEW.summary, '') || ' ' || coalesce(NEW.raw_text, ''))
    );
  END`,
  `CREATE TRIGGER IF NOT EXISTS dynamics_event_fts_au AFTER UPDATE ON dynamics_event BEGIN
    DELETE FROM dynamics_fts WHERE ref_id = OLD.id AND kind = 'event';
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    VALUES (
      NEW.id,
      'event',
      NEW.person_id,
      trim(coalesce(NEW.summary, '') || ' ' || coalesce(NEW.raw_text, ''))
    );
  END`,
  `CREATE TRIGGER IF NOT EXISTS dynamics_event_fts_ad AFTER DELETE ON dynamics_event BEGIN
    DELETE FROM dynamics_fts WHERE ref_id = OLD.id AND kind = 'event';
  END`,
];

/** 卸除 FTS 觸發器與虛擬表後重建（倒排索引毀損時 DELETE 可能失敗，需整表重建）。 */
const DYNAMICS_FTS_DROP_TRIGGERS = [
  'DROP TRIGGER IF EXISTS dynamics_person_fts_ai',
  'DROP TRIGGER IF EXISTS dynamics_person_fts_au',
  'DROP TRIGGER IF EXISTS dynamics_person_fts_ad',
  'DROP TRIGGER IF EXISTS dynamics_event_fts_ai',
  'DROP TRIGGER IF EXISTS dynamics_event_fts_au',
  'DROP TRIGGER IF EXISTS dynamics_event_fts_ad',
];

async function recreateDynamicsFtsSchema(database) {
  for (const sql of DYNAMICS_FTS_DROP_TRIGGERS) {
    await database.runAsync(sql);
  }
  await database.runAsync('DROP TABLE IF EXISTS dynamics_fts');
  await database.runAsync(DYNAMICS_FTS_CREATE);
  for (const sql of DYNAMICS_FTS_TRIGGERS) {
    await database.runAsync(sql);
  }
  await rebuildDynamicsFts(database);
}

/**
 * 清空並自 dynamics_person / dynamics_event 重建 FTS 索引（觸發器異常或升級後可呼叫）。
 */
async function rebuildDynamicsFts(database) {
  const row = await database.getAsync(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='dynamics_fts'"
  );
  if (!row) {
    return;
  }
  await database.runAsync('DELETE FROM dynamics_fts');
  await database.runAsync(`
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    SELECT
      id,
      'person',
      id,
      trim(coalesce(display_name, '') || ' ' || coalesce(class_year, '') || ' ' || coalesce(notes, ''))
    FROM dynamics_person
  `);
  await database.runAsync(`
    INSERT INTO dynamics_fts (ref_id, kind, person_id, body)
    SELECT
      id,
      'event',
      person_id,
      trim(coalesce(summary, '') || ' ' || coalesce(raw_text, ''))
    FROM dynamics_event
  `);
}

async function ensureDynamicsFts(database) {
  try {
    await database.runAsync(DYNAMICS_FTS_CREATE);
  } catch (e) {
    console.warn('[jcms] dynamics_fts: FTS5 不可用，略過全文索引：', e.message);
    return;
  }
  try {
    const ftsDef = await database.getAsync(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='dynamics_fts'"
    );
    if (ftsDef && typeof ftsDef.sql === 'string' && !/prefix\s*=/.test(ftsDef.sql)) {
      await recreateDynamicsFtsSchema(database);
      return;
    }
  } catch (_) {
    // ignore
  }
  for (const sql of DYNAMICS_FTS_TRIGGERS) {
    try {
      await database.runAsync(sql);
    } catch (err) {
      console.warn('[jcms] dynamics_fts trigger:', err.message);
    }
  }
  let cFts = { n: 0 };
  let cP = { n: 0 };
  let cE = { n: 0 };
  try {
    cFts = await database.getAsync('SELECT COUNT(*) AS n FROM dynamics_fts');
    cP = await database.getAsync('SELECT COUNT(*) AS n FROM dynamics_person');
    cE = await database.getAsync('SELECT COUNT(*) AS n FROM dynamics_event');
  } catch (_) {
    return;
  }
  const expected = (cP.n || 0) + (cE.n || 0);
  if ((cFts.n || 0) !== expected) {
    await rebuildDynamicsFts(database);
  }
}

async function initDatabase() {
  if (db) {
    return db;
  }

  ensureDataDirectory();

  const instance = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(database);
    });
  });

  db = attachAsyncApi(instance);

  await db.runAsync('PRAGMA foreign_keys = ON');
  try {
    await db.runAsync('PRAGMA journal_mode = WAL');
  } catch (e) {
    console.warn('[jcms] PRAGMA journal_mode=WAL:', e.message);
  }
  try {
    await db.runAsync('PRAGMA busy_timeout = 5000');
  } catch (_) {
    /* ignore */
  }

  await db.runAsync(CREATE_CASES_TABLE);
  await ensureCasesWorkspaceColumn(db);
  await ensureCasesCaseDetailColumns(db);
  await ensureCasesPartiesJsonColumn(db);
  await ensureCasesCourtFeeDetailJsonColumn(db);
  await ensureCasesDropObsoleteColumns(db);
  await ensureCasesObsoleteTriggersAndViewsDropped(db);
  await ensurePersonalPayscaleRow(db);
  await ensureAppSettingsAndPersonalAdminRows(db);
  await ensureDynamicsTables(db);
  await ensureDynamicsPersonSchema(db);
  await ensureDynamicsFts(db);

  const payscaleDataService = require('../services/payscaleDataService');
  await payscaleDataService.ensureTableAndSeed(db);

  // quick_check 可能在大型資料庫耗時過長，避免阻塞啟動健康檢查。
  if (shouldRunStartupQuickCheck()) {
    try {
      const qc = await db.allAsync('PRAGMA quick_check');
      const first = qc && qc[0];
      const cell = first && (first.quick_check ?? Object.values(first)[0]);
      const ok = qc && qc.length === 1 && String(cell).toLowerCase() === 'ok';
      if (!ok) {
        const detail = qc ? qc.map((r) => r.quick_check ?? Object.values(r)[0]).join('; ') : 'no result';
        console.error('[jcms] CRITICAL: SQLite PRAGMA quick_check 未通過:', detail);
      }
    } catch (e) {
      console.error('[jcms] SQLite quick_check 執行失敗:', e.message);
    }
  }

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized; call initDatabase() first');
  }
  return db;
}

/** PM2 / SIGTERM 優雅關閉時釋放 SQLite 控制權，避免舊程序占用埠過久。 */
function closeDatabase() {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }
    const conn = db;
    conn.close((err) => {
      if (err) console.warn('[jcms] SQLite close:', err.message);
      db = null;
      resolve();
    });
  });
}

/** 對任意路徑的 SQLite 檔卸除 cases 表 obsolete 欄位（供離線腳本使用）。 */
async function pruneCasesObsoleteColumnsAtPath(absolutePath) {
  const resolved = path.resolve(absolutePath);
  if (!fs.existsSync(resolved)) {
    console.warn('[jcms] pruneCasesObsoleteColumnsAtPath: file not found', resolved);
    return false;
  }
  const instance = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(resolved, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(database);
    });
  });
  const database = attachAsyncApi(instance);
  try {
    const row = await database.getAsync(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='cases'"
    );
    if (!row) {
      console.warn('[jcms] pruneCasesObsoleteColumnsAtPath: no cases table', resolved);
      return false;
    }
    await ensureCasesWorkspaceColumn(database);
    await ensureCasesCaseDetailColumns(database);
    await ensureCasesPartiesJsonColumn(database);
    await ensureCasesCourtFeeDetailJsonColumn(database);
    await ensureCasesDropObsoleteColumns(database);
    await ensureCasesObsoleteTriggersAndViewsDropped(database);
    return true;
  } finally {
    await new Promise((resolve, reject) => {
      instance.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

module.exports = {
  initDatabase,
  getDb,
  closeDatabase,
  dbPath,
  rebuildDynamicsFts,
  recreateDynamicsFtsSchema,
  pruneCasesObsoleteColumnsAtPath,
  CASE_CANONICAL_COLUMNS,
  OBSOLETE_CASE_COLUMNS,
};
