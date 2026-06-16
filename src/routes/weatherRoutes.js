const express = require('express');
const weatherController = require('../controllers/weatherController');

const router = express.Router();

router.get('/rain-advisory', weatherController.getRainAdvisory);
router.get('/rainfall-obs', weatherController.getRainfallObs);
router.get('/satellite/latest', weatherController.getSatelliteLatest);
router.get('/satellite/image', weatherController.getSatelliteImage);

module.exports = router;
