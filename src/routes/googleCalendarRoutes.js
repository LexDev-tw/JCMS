const express = require('express');
const googleCalendarController = require('../controllers/googleCalendarController');

const router = express.Router();

router.get('/auth', googleCalendarController.startAuth);
router.get('/oauth/callback', googleCalendarController.oauthCallback);
router.get('/status', googleCalendarController.getStatus);
router.get('/oauth-config', googleCalendarController.getOAuthConfig);
router.put('/oauth-config', googleCalendarController.putOAuthConfig);
router.get('/events', googleCalendarController.getEvents);
router.post('/sync', googleCalendarController.syncEvents);
router.delete('/disconnect', googleCalendarController.disconnect);

module.exports = router;
