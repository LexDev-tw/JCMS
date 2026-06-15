const caseStatsService = require('../services/caseStatsService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getStats = wrapAsyncController(async (req, res) => {
  const data = await caseStatsService.getCaseStatsBlob();
  res.status(200).json({ success: true, data });
});

const putStats = wrapAsyncController(async (req, res) => {
  const data = await caseStatsService.saveCaseStatsBlob(req.body || {});
  res.status(200).json({ success: true, data });
});

module.exports = {
  getStats,
  putStats,
};
