const appSettingsService = require('./appSettingsService');
const { encrypt, decrypt } = require('./googleCalendarSettingsCrypto');

const SETTINGS_KEY = 'googleCalendarOAuth';

function defaultRedirectUri() {
  const publicUrl = String(process.env.JCMS_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicUrl) {
    return `${publicUrl}/api/google-calendar/oauth/callback`;
  }
  const port = Number(process.env.PORT || process.env.JCMS_PORT) || 3000;
  return `http://127.0.0.1:${port}/api/google-calendar/oauth/callback`;
}

function readStoredOAuth(obj) {
  const raw = obj && typeof obj === 'object' ? obj[SETTINGS_KEY] : null;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
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
  const configured = Boolean(fromDb.clientId && fromDb.clientSecret);
  return {
    clientId: fromDb.clientId,
    clientSecret: fromDb.clientSecret,
    redirectUri: fromDb.redirectUri || defaultRedirectUri(),
    tokenEncKey: fromDb.tokenEncKey,
    configured,
    source: configured ? 'db' : 'none',
  };
}

async function getOAuthConfigPublic() {
  const fromDb = await getDecryptedDbConfig();
  const resolved = await resolveOAuthConfig();
  const hasDbRecord = Boolean(
    fromDb.clientId || fromDb.clientSecret || fromDb.redirectUri || fromDb.tokenEncKey
  );
  return {
    clientId: fromDb.clientId,
    redirectUri: resolved.redirectUri,
    redirectUriDefault: defaultRedirectUri(),
    hasClientSecret: Boolean(fromDb.clientSecret),
    hasTokenEncKey: Boolean(fromDb.tokenEncKey),
    configured: resolved.configured,
    source: resolved.source,
    hasDbRecord,
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
