const express = require('express');
const appSettingsController = require('../controllers/appSettingsController');

const router = express.Router();

router.get('/app', appSettingsController.getSettings);
router.put('/app', appSettingsController.putSettings);
router.get('/db-backup', appSettingsController.getDbBackup);

module.exports = router;
