const googleCalendarService = require('../services/googleCalendarService');
const oauthConfigService = require('../services/googleCalendarOAuthConfigService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const startAuth = wrapAsyncController(async (req, res) => {
  const { configured } = await oauthConfigService.resolveOAuthConfig();
  if (!configured) {
    return res.status(503).json({
      success: false,
      error: 'Google Calendar OAuth 尚未設定（請於系統內或 .env 設定 Client ID／Client Secret）',
    });
  }
  const state = googleCalendarService.issueOAuthState();
  const url = await googleCalendarService.generateAuthUrl(state);
  return res.redirect(302, url);
});

const oauthCallback = wrapAsyncController(async (req, res) => {
  const { code, state, error } = req.query || {};
  if (error) {
    return res.redirect(302, '/JCMS.html?gcal=error');
  }
  if (!googleCalendarService.consumeOAuthState(state)) {
    return res.redirect(302, '/JCMS.html?gcal=error&reason=state');
  }
  try {
    await googleCalendarService.handleOAuthCallback(code);
    return res.redirect(302, '/JCMS.html?gcal=connected');
  } catch (err) {
    console.error('[google-calendar] oauth callback:', err);
    return res.redirect(302, '/JCMS.html?gcal=error');
  }
});

const getStatus = wrapAsyncController(async (req, res) => {
  const data = await googleCalendarService.getStatus();
  res.status(200).json({ success: true, data });
});

const getOAuthConfig = wrapAsyncController(async (req, res) => {
  const data = await oauthConfigService.getOAuthConfigPublic();
  res.status(200).json({ success: true, data });
});

const putOAuthConfig = wrapAsyncController(async (req, res) => {
  const data = await oauthConfigService.saveOAuthConfig(req.body || {});
  res.status(200).json({ success: true, data });
});

const getEvents = wrapAsyncController(async (req, res) => {
  const timeMin = String(req.query?.timeMin || '').trim();
  const timeMax = String(req.query?.timeMax || '').trim();
  if (!timeMin || !timeMax) {
    return res.status(400).json({ success: false, error: '請提供 timeMin 與 timeMax（ISO 8601）' });
  }
  const status = await googleCalendarService.getStatus();
  if (!status.connected) {
    return res.status(200).json({ success: true, data: [] });
  }
  const data = await googleCalendarService.listEvents(timeMin, timeMax);
  res.status(200).json({ success: true, data });
});

const disconnect = wrapAsyncController(async (req, res) => {
  await googleCalendarService.disconnect();
  res.status(200).json({ success: true, data: { connected: false } });
});

module.exports = {
  startAuth,
  oauthCallback,
  getStatus,
  getOAuthConfig,
  putOAuthConfig,
  getEvents,
  disconnect,
};
