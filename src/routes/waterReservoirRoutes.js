const express = require('express');
const waterReservoirController = require('../controllers/waterReservoirController');

const router = express.Router();

router.get('/map', waterReservoirController.getMapReservoirs);

module.exports = router;
