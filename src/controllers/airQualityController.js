const airQualityService = require('../services/airQualityService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getMapStations = wrapAsyncController(async (req, res) => {
    const data = await airQualityService.getAirQualityMapData();
    res.status(200).json(data);
});

module.exports = {
    getMapStations,
};
