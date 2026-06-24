const waterReservoirService = require('../services/waterReservoirService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getMapReservoirs = wrapAsyncController(async (req, res) => {
    const data = await waterReservoirService.getWaterReservoirMapData();
    res.status(200).json(data);
});

module.exports = {
    getMapReservoirs,
};
