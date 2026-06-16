const weatherService = require('../services/weatherService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getRainAdvisory = wrapAsyncController(async (req, res) => {
    const data = await weatherService.getRainAdvisory();
    res.status(200).json(data);
});

const getRainfallObs = wrapAsyncController(async (req, res) => {
    const data = await weatherService.getRainfallObservations();
    res.status(200).json(data);
});

const getSatelliteLatest = wrapAsyncController(async (req, res) => {
    const product = String(req.query.product || 'vis-tw').trim() || 'vis-tw';
    const data = await weatherService.getSatelliteLatest(product);
    res.status(200).json(data);
});

const getSatelliteImage = wrapAsyncController(async (req, res) => {
    const product = String(req.query.product || 'vis-tw').trim() || 'vis-tw';
    const { buffer, contentType, observedAt } = await weatherService.fetchSatelliteImageBuffer(product);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=300');
    if (observedAt) res.set('X-CWA-Observed-At', observedAt);
    res.status(200).send(buffer);
});

module.exports = {
    getRainAdvisory,
    getRainfallObs,
    getSatelliteLatest,
    getSatelliteImage,
};
