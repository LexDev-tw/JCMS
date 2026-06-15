const appSettingsService = require('./appSettingsService');
const { encrypt, decrypt } = require('./googleCalendarSettingsCrypto');

const SETTINGS_KEY = 'googleCalendarOAuth';

function defaultRedirectUri() {
  const port = Number(process.env.PORT || process.env.JCMS_PORT) || 3000;
  return `http://127.0.0.1:${port}/api/google-calendar/oauth/callback`;
}

function readStoredOAuth(obj) {
  const raw = obj && typeof obj === 'object' ? obj[SETTINGS_KEY] : null;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

function envOAuthConfig() {
  return {
    clientId: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    redirectUri: String(process.env.GOOGLE_OAUTH_REDIRECT_URI || '').trim() || defaultRedirectUri(),
    tokenEncKey: String(process.env.GOOGLE_TOKEN_ENC_KEY || '').trim(),
  };
}

async function getStoredOAuthRecord() {
  const settings = await appSettingsService.getAppSettings();
  const { _updatedAt, ...rest } = settings;
  return readStoredOAuth(rest);
}

async function getDecryptedDbConfig() {
  const rec = await getStoredOAuthRecord();
  if (!rec) {
    return {
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      tokenEncKey: '',
    };
  }
  return {
    clientId: String(rec.clientId || '').trim(),
    clientSecret: rec.clientSecretEnc ? decrypt(rec.clientSecretEnc) : '',
    redirectUri: String(rec.redirectUri || '').trim(),
    tokenEncKey: rec.tokenEncKeyEnc ? decrypt(rec.tokenEncKeyEnc) : '',
  };
}

async function resolveOAuthConfig() {
  const fromDb = await getDecryptedDbConfig();
  const fromEnv = envOAuthConfig();
  const hasDb = Boolean(fromDb.clientId && fromDb.clientSecret);
  const hasEnv = Boolean(fromEnv.clientId && fromEnv.clientSecret);
  const source = hasDb ? 'db' : hasEnv ? 'env' : 'none';
  const pick = hasDb ? fromDb : fromEnv;
  return {
    clientId: pick.clientId,
    clientSecret: pick.clientSecret,
    redirectUri: pick.redirectUri || defaultRedirectUri(),
    tokenEncKey: pick.tokenEncKey || fromEnv.tokenEncKey || fromDb.tokenEncKey,
    configured: Boolean(pick.clientId && pick.clientSecret),
    source,
  };
}

async function getOAuthConfigPublic() {
  const fromDb = await getDecryptedDbConfig();
  const fromEnv = envOAuthConfig();
  const resolved = await resolveOAuthConfig();
  const hasDb = Boolean(fromDb.clientId || fromDb.clientSecret || fromDb.redirectUri || fromDb.tokenEncKey);
  return {
    clientId: resolved.source === 'db' ? fromDb.clientId : fromEnv.clientId || fromDb.clientId,
    redirectUri: resolved.redirectUri,
    redirectUriDefault: defaultRedirectUri(),
    hasClientSecret: resolved.source === 'db' ? Boolean(fromDb.clientSecret) : Boolean(fromEnv.clientSecret),
    hasTokenEncKey:
      resolved.source === 'db' ? Boolean(fromDb.tokenEncKey) : Boolean(fromEnv.tokenEncKey || fromDb.tokenEncKey),
    configured: resolved.configured,
    source: resolved.source,
    hasDbRecord: hasDb,
  };
}

function isMaskedSecret(value) {
  const s = String(value || '').trim();
  return !s || /^[*•．.]+$/.test(s);
}

async function saveOAuthConfig(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid OAuth config payload');
  }
  const settings = await appSettingsService.getAppSettings();
  const { _updatedAt, ...rest } = settings;
  const prev = readStoredOAuth(rest) || {};
  const prevDecrypted = {
    clientSecret: prev.clientSecretEnc ? decrypt(prev.clientSecretEnc) : '',
    tokenEncKey: prev.tokenEncKeyEnc ? decrypt(prev.tokenEncKeyEnc) : '',
  };

  const clientId = String(body.clientId != null ? body.clientId : prev.clientId || '').trim();
  const redirectUri = String(
    body.redirectUri != null ? body.redirectUri : prev.redirectUri || defaultRedirectUri()
  ).trim();

  let clientSecret = prevDecrypted.clientSecret;
  if (body.clearClientSecret === true) {
    clientSecret = '';
  } else if (!isMaskedSecret(body.clientSecret)) {
    clientSecret = String(body.clientSecret).trim();
  }

  let tokenEncKey = prevDecrypted.tokenEncKey;
  if (body.clearTokenEncKey === true) {
    tokenEncKey = '';
  } else if (!isMaskedSecret(body.tokenEncKey)) {
    tokenEncKey = String(body.tokenEncKey).trim();
  }

  if (!clientId) {
    throw new Error('請填寫 Client ID');
  }
  if (!redirectUri) {
    throw new Error('請填寫 Redirect URI');
  }
  if (!clientSecret && !prev.clientSecretEnc) {
    throw new Error('請填寫 Client Secret');
  }

  const next = {
    clientId,
    redirectUri,
    clientSecretEnc: clientSecret ? encrypt(clientSecret) : '',
    tokenEncKeyEnc: tokenEncKey ? encrypt(tokenEncKey) : '',
  };

  await appSettingsService.saveAppSettings({
    ...rest,
    [SETTINGS_KEY]: next,
  });

  return getOAuthConfigPublic();
}

module.exports = {
  defaultRedirectUri,
  resolveOAuthConfig,
  getOAuthConfigPublic,
  saveOAuthConfig,
};
