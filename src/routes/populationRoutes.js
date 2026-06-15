const express = require('express');
const populationController = require('../controllers/populationController');

const router = express.Router();

router.get('/towns/latest', populationController.getTownPopulationLatest);

module.exports = router;
