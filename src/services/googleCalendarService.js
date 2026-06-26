const crypto = require('crypto');
const { google } = require('googleapis');
const { getDb } = require('../config/database');
const { setActiveTokenEncSeed, encrypt, decrypt } = require('./googleCalendarTokenCrypto');
const oauthConfigService = require('./googleCalendarOAuthConfigService');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = 'primary';
const TAIPEI_TZ = 'Asia/Taipei';
const SYNC_STALE_MS = 5 * 60 * 1000;
const FULL_SYNC_PAST_DAYS = 365;
const FULL_SYNC_FUTURE_DAYS = 365 * 3;

/** @type {Map<string, number>} */
const pendingOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
let googleSyncPromise = null;

function pruneOAuthStates() {
  const now = Date.now();
  for (const [k, ts] of pendingOAuthStates.entries()) {
    if (now - ts > OAUTH_STATE_TTL_MS) pendingOAuthStates.delete(k);
  }
}

function issueOAuthState() {
  pruneOAuthStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingOAuthStates.set(state, Date.now());
  return state;
}

function consumeOAuthState(state) {
  pruneOAuthStates();
  const key = String(state || '').trim();
  if (!key || !pendingOAuthStates.has(key)) return false;
  pendingOAuthStates.delete(key);
  return true;
}

async function applyTokenEncSeedFromConfig(cfg) {
  const resolved = cfg || (await oauthConfigService.resolveOAuthConfig());
  setActiveTokenEncSeed(resolved.tokenEncKey || resolved.clientSecret || null);
  return resolved;
}

async function createOAuthClient() {
  const cfg = await applyTokenEncSeedFromConfig();
  if (!cfg.configured) {
    throw new Error('Google Calendar OAuth 尚未設定（請於週曆 ⚙ 面板儲存 Client ID／Client Secret）');
  }
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
}

async function getStoredTokenRow() {
  const db = getDb();
  return db.getAsync('SELECT * FROM google_calendar_tokens WHERE id = 1');
}

async function saveTokenRow({ refreshToken, accessToken, expiresAt, email }) {
  await applyTokenEncSeedFromConfig();
  const db = getDb();
  const refresh_token_enc = refreshToken ? encrypt(refreshToken) : null;
  await db.runAsync(
    `INSERT INTO google_calendar_tokens (id, refresh_token_enc, access_token, expires_at, email, connected_at, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, google_calendar_tokens.refresh_token_enc),
       access_token = excluded.access_token,
       expires_at = excluded.expires_at,
       email = COALESCE(excluded.email, google_calendar_tokens.email),
       updated_at = datetime('now')`,
    [refresh_token_enc, accessToken || null, expiresAt || null, email || null]
  );
}

async function clearTokenRow() {
  const db = getDb();
  await db.runAsync(
    `UPDATE google_calendar_tokens
     SET refresh_token_enc = NULL, access_token = NULL, expires_at = NULL, email = NULL, updated_at = datetime('now')
     WHERE id = 1`
  );
}

function isoToRocDate7(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!m) return '';
  const rocY = Number(m[1]) - 1911;
  if (!Number.isFinite(rocY) || rocY < 1) return '';
  return `${String(rocY).padStart(3, '0')}${m[2]}${m[3]}`;
}

function toTaipeiParts(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    hhmm: `${hour}${get('minute')}`,
  };
}

function normalizeRocTime4(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(0, 4);
  return '';
}

function isoDateMinusOneDay(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!m) return '';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function mapGoogleEventToJcms(ge) {
  const isAllDay = Boolean(ge.start?.date && !ge.start?.dateTime);
  let dateRoc = '';
  let startRoc7 = '';
  let endRoc7 = '';
  let time = '';

  if (isAllDay) {
    dateRoc = isoToRocDate7(ge.start.date);
    startRoc7 = dateRoc;
    const exclusiveEnd = String(ge.end?.date || '').trim();
    if (exclusiveEnd && exclusiveEnd > String(ge.start.date || '')) {
      const inclusiveEndIso = isoDateMinusOneDay(exclusiveEnd);
      endRoc7 = isoToRocDate7(inclusiveEndIso) || dateRoc;
    } else {
      endRoc7 = dateRoc;
    }
    time = '';
  } else if (ge.start?.dateTime) {
    const startParts = toTaipeiParts(ge.start.dateTime);
    const endParts = toTaipeiParts(ge.end?.dateTime || ge.start.dateTime);
    if (startParts) {
      dateRoc = isoToRocDate7(startParts.iso);
      startRoc7 = dateRoc;
      endRoc7 = endParts ? isoToRocDate7(endParts.iso) || dateRoc : dateRoc;
      const spansDays = startRoc7.length === 7 && endRoc7.length === 7 && startRoc7 !== endRoc7;
      time = spansDays ? '' : normalizeRocTime4(startParts.hhmm);
    }
  }

  if (dateRoc.length !== 7) return null;

  return {
    id: `GCAL_${String(ge.id || '').replace(/[^\w-]/g, '_')}`,
    dateRoc,
    startRoc7,
    endRoc7,
    time,
    title: String(ge.summary || '').trim() || '（無標題）',
    isCase: false,
    isLinked: true,
    isGoogle: true,
    linkTarget: ge.htmlLink ? { externalUrl: String(ge.htmlLink) } : null,
    googleStart: ge.start || null,
    googleEnd: ge.end || null,
  };
}

async function getAuthorizedClient() {
  const row = await getStoredTokenRow();
  if (!row?.refresh_token_enc) return null;

  await applyTokenEncSeedFromConfig();
  const refreshToken = decrypt(row.refresh_token_enc);
  if (!refreshToken) return null;

  const oauth2Client = await createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: row.access_token || undefined,
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  });

  const expiryMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const needsRefresh = !row.access_token || !expiryMs || expiryMs < Date.now() + 60_000;
  if (needsRefresh) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    const expiresAt =
      credentials.expiry_date != null
        ? new Date(credentials.expiry_date).toISOString()
        : null;
    await saveTokenRow({
      refreshToken: credentials.refresh_token || refreshToken,
      accessToken: credentials.access_token || null,
      expiresAt,
      email: row.email || null,
    });
  }

  return oauth2Client;
}

async function generateAuthUrl(state) {
  const oauth2Client = await createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

async function handleOAuthCallback(code) {
  const oauth2Client = await createOAuthClient();
  const { tokens } = await oauth2Client.getToken(String(code || ''));
  oauth2Client.setCredentials(tokens);

  let email = '';
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    email = String(data?.email || '').trim();
  } catch (_) {
    /* optional */
  }

  let refreshTokenToSave = tokens.refresh_token || null;
  if (!refreshTokenToSave) {
    refreshTokenToSave = await existingRefreshToken(await getStoredTokenRow());
  }
  if (!refreshTokenToSave) {
    throw new Error('未取得 refresh token，請重新授權並允許存取');
  }

  const expiresAt =
    tokens.expiry_date != null ? new Date(tokens.expiry_date).toISOString() : null;

  await saveTokenRow({
    refreshToken: refreshTokenToSave,
    accessToken: tokens.access_token || null,
    expiresAt,
    email: email || null,
  });
  await clearGoogleEventStore();

  return { email };
}

async function existingRefreshToken(row) {
  if (!row?.refresh_token_enc) return null;
  await applyTokenEncSeedFromConfig();
  return decrypt(row.refresh_token_enc);
}

async function getStatus() {
  const { configured, redirectUri, source } = await oauthConfigService.resolveOAuthConfig();
  const row = await getStoredTokenRow();
  const connected = Boolean(row?.refresh_token_enc);
  const db = getDb();
  const sync = await db
    .getAsync(
      'SELECT last_full_sync_at, last_delta_sync_at, last_error FROM google_calendar_sync_state WHERE id = 1'
    )
    .catch(() => null);
  return {
    configured,
    connected,
    email: connected ? String(row?.email || '').trim() : '',
    redirectUri: configured ? redirectUri : '',
    calendarId: CALENDAR_ID,
    configSource: source,
    lastFullSyncAt: sync?.last_full_sync_at || null,
    lastDeltaSyncAt: sync?.last_delta_sync_at || null,
    lastError: sync?.last_error || '',
  };
}

async function getSyncState() {
  const db = getDb();
  const row = await db.getAsync('SELECT * FROM google_calendar_sync_state WHERE id = 1');
  return row || {};
}

async function updateSyncState(next) {
  const db = getDb();
  await db.runAsync(
    `UPDATE google_calendar_sync_state
     SET
       sync_token = ?,
       last_full_sync_at = COALESCE(?, last_full_sync_at),
       last_delta_sync_at = COALESCE(?, last_delta_sync_at),
       last_error = ?,
       updated_at = datetime('now')
     WHERE id = 1`,
    [
      next.syncToken === undefined ? null : next.syncToken,
      next.lastFullSyncAt || null,
      next.lastDeltaSyncAt || null,
      next.lastError || null,
    ]
  );
}

function parseIsoDatePart(v) {
  return String(v || '').trim().slice(0, 10);
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildFullSyncWindowIsoRange() {
  const now = new Date();
  const min = new Date(now);
  const max = new Date(now);
  min.setDate(now.getDate() - FULL_SYNC_PAST_DAYS);
  max.setDate(now.getDate() + FULL_SYNC_FUTURE_DAYS);
  const p = (n) => String(n).padStart(2, '0');
  const minIso = `${min.getFullYear()}-${p(min.getMonth() + 1)}-${p(min.getDate())}`;
  const maxIso = `${max.getFullYear()}-${p(max.getMonth() + 1)}-${p(max.getDate())}`;
  return {
    timeMin: `${minIso}T00:00:00+08:00`,
    timeMax: `${maxIso}T23:59:59+08:00`,
  };
}

async function upsertGoogleEvents(events) {
  const db = getDb();
  for (const ev of events) {
    await db.runAsync(
      `INSERT INTO google_calendar_events (
        id, date_roc, start_roc7, end_roc7, time_roc4, title, is_google, html_link, google_start_json, google_end_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        date_roc = excluded.date_roc,
        start_roc7 = excluded.start_roc7,
        end_roc7 = excluded.end_roc7,
        time_roc4 = excluded.time_roc4,
        title = excluded.title,
        html_link = excluded.html_link,
        google_start_json = excluded.google_start_json,
        google_end_json = excluded.google_end_json,
        updated_at = datetime('now')`,
      [
        ev.id,
        ev.dateRoc,
        ev.startRoc7 || ev.dateRoc,
        ev.endRoc7 || ev.startRoc7 || ev.dateRoc,
        ev.time || '',
        ev.title || '（無標題）',
        ev.linkTarget?.externalUrl || null,
        ev.googleStart ? JSON.stringify(ev.googleStart) : null,
        ev.googleEnd ? JSON.stringify(ev.googleEnd) : null,
      ]
    );
  }
}

async function deleteGoogleEventsByIds(ids) {
  if (!ids.length) return;
  const db = getDb();
  for (const id of ids) {
    await db.runAsync('DELETE FROM google_calendar_events WHERE id = ?', [id]);
  }
}

async function runFullSync(calendar) {
  const db = getDb();
  const all = [];
  let pageToken;
  let nextSyncToken = null;
  const range = buildFullSyncWindowIsoRange();
  do {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
      showDeleted: true,
    });
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    for (const ge of items) {
      if (String(ge?.status || '').toLowerCase() === 'cancelled') continue;
      const mapped = mapGoogleEventToJcms(ge);
      if (mapped) all.push(mapped);
    }
    pageToken = res.data?.nextPageToken || undefined;
    nextSyncToken = res.data?.nextSyncToken || nextSyncToken;
  } while (pageToken);
  await db.runAsync('DELETE FROM google_calendar_events');
  await upsertGoogleEvents(all);
  const now = new Date().toISOString();
  await updateSyncState({
    syncToken: nextSyncToken || null,
    lastFullSyncAt: now,
    lastDeltaSyncAt: now,
    lastError: '',
  });
}

async function runDeltaSync(calendar, syncToken) {
  const upserts = [];
  const deletions = [];
  let pageToken;
  let nextSyncToken = syncToken;
  do {
    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      singleEvents: true,
      maxResults: 2500,
      syncToken,
      pageToken,
      showDeleted: true,
    });
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    for (const ge of items) {
      const id = `GCAL_${String(ge?.id || '').replace(/[^\w-]/g, '_')}`;
      if (String(ge?.status || '').toLowerCase() === 'cancelled') {
        deletions.push(id);
        continue;
      }
      const mapped = mapGoogleEventToJcms(ge);
      if (mapped) upserts.push(mapped);
    }
    pageToken = res.data?.nextPageToken || undefined;
    nextSyncToken = res.data?.nextSyncToken || nextSyncToken;
  } while (pageToken);
  await upsertGoogleEvents(upserts);
  await deleteGoogleEventsByIds(deletions);
  await updateSyncState({
    syncToken: nextSyncToken || null,
    lastDeltaSyncAt: new Date().toISOString(),
    lastError: '',
  });
}

function shouldSyncNow(syncState) {
  const last = syncState?.last_delta_sync_at || syncState?.last_full_sync_at;
  if (!last) return true;
  const ms = new Date(last).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= SYNC_STALE_MS;
}

async function ensureGoogleEventsSynced(force = false) {
  if (googleSyncPromise) {
    await googleSyncPromise;
    return;
  }
  googleSyncPromise = (async () => {
    const auth = await getAuthorizedClient();
    if (!auth) return;
    const syncState = await getSyncState();
    if (!force && !shouldSyncNow(syncState)) return;
    const calendar = google.calendar({ version: 'v3', auth });
    try {
      if (syncState?.sync_token) {
        await runDeltaSync(calendar, String(syncState.sync_token));
      } else {
        await runFullSync(calendar);
      }
    } catch (err) {
      const code = Number(err?.code || err?.response?.status || 0);
      if (code === 410) {
        await runFullSync(calendar);
      } else {
        await updateSyncState({
          syncToken: syncState?.sync_token || null,
          lastDeltaSyncAt: new Date().toISOString(),
          lastError: String(err?.message || err || 'Google Calendar sync failed'),
        });
        throw err;
      }
    }
  })();
  try {
    await googleSyncPromise;
  } finally {
    googleSyncPromise = null;
  }
}

async function queryStoredEvents(timeMin, timeMax) {
  const fromRoc = isoToRocDate7(parseIsoDatePart(timeMin));
  const toRoc = isoToRocDate7(parseIsoDatePart(timeMax));
  if (fromRoc.length !== 7 || toRoc.length !== 7) return [];
  const db = getDb();
  const rows = await db.allAsync(
    `SELECT *
     FROM google_calendar_events
     WHERE start_roc7 <= ? AND end_roc7 >= ?
     ORDER BY start_roc7 ASC, time_roc4 ASC, title COLLATE NOCASE ASC`,
    [toRoc, fromRoc]
  );
  return (rows || []).map((r) => ({
    id: r.id,
    dateRoc: r.date_roc,
    startRoc7: r.start_roc7,
    endRoc7: r.end_roc7,
    time: r.time_roc4 || '',
    title: r.title || '（無標題）',
    isCase: false,
    isLinked: true,
    isGoogle: true,
    linkTarget: r.html_link ? { externalUrl: String(r.html_link) } : null,
    googleStart: parseJsonSafe(r.google_start_json),
    googleEnd: parseJsonSafe(r.google_end_json),
  }));
}

async function syncNow() {
  await ensureGoogleEventsSynced(true);
  return getSyncState();
}

async function listEvents(timeMin, timeMax) {
  await ensureGoogleEventsSynced();
  return queryStoredEvents(timeMin, timeMax);
}

async function clearGoogleEventStore() {
  const db = getDb();
  await db.runAsync('DELETE FROM google_calendar_events');
  await db.runAsync(
    `UPDATE google_calendar_sync_state
     SET sync_token = NULL, last_full_sync_at = NULL, last_delta_sync_at = NULL, last_error = NULL, updated_at = datetime('now')
     WHERE id = 1`
  );
}

async function disconnect() {
  const auth = await getAuthorizedClient();
  if (auth) {
    try {
      await auth.revokeCredentials();
    } catch (_) {
      /* token may already be invalid */
    }
  }
  await clearTokenRow();
  await clearGoogleEventStore();
}

module.exports = {
  issueOAuthState,
  consumeOAuthState,
  generateAuthUrl,
  handleOAuthCallback,
  getStatus,
  syncNow,
  listEvents,
  disconnect,
};
