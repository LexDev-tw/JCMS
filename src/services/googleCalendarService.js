const crypto = require('crypto');
const { google } = require('googleapis');
const { getDb } = require('../config/database');
const { setActiveTokenEncSeed, encrypt, decrypt } = require('./googleCalendarTokenCrypto');
const oauthConfigService = require('./googleCalendarOAuthConfigService');

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const CALENDAR_ID = 'primary';
const TAIPEI_TZ = 'Asia/Taipei';

/** @type {Map<string, number>} */
const pendingOAuthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

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
    throw new Error('Google Calendar OAuth 尚未設定（請於系統內或 .env 設定 Client ID／Client Secret）');
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
  return {
    configured,
    connected,
    email: connected ? String(row?.email || '').trim() : '',
    redirectUri: configured ? redirectUri : '',
    calendarId: CALENDAR_ID,
    configSource: source,
  };
}

async function listEvents(timeMin, timeMax) {
  const auth = await getAuthorizedClient();
  if (!auth) return [];

  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: String(timeMin),
    timeMax: String(timeMax),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  return items.map(mapGoogleEventToJcms).filter(Boolean);
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
}

module.exports = {
  issueOAuthState,
  consumeOAuthState,
  generateAuthUrl,
  handleOAuthCallback,
  getStatus,
  listEvents,
  disconnect,
};
