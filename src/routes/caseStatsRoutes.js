const express = require('express');
const caseStatsController = require('../controllers/caseStatsController');

const router = express.Router();

router.get('/', caseStatsController.getStats);
router.put('/', caseStatsController.putStats);

module.exports = router;
