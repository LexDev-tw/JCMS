const express = require('express');
const airQualityController = require('../controllers/airQualityController');

const router = express.Router();

router.get('/map', airQualityController.getMapStations);

module.exports = router;
