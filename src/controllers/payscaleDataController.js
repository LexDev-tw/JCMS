const payscaleDataService = require('../services/payscaleDataService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const ok = wrapAsyncController;

const listVersions = ok(async (req, res) => {
  const data = await payscaleDataService.listVersions();
  res.json({ success: true, data });
});

const getLatest = ok(async (req, res) => {
  const data = await payscaleDataService.getLatest();
  res.json({ success: true, data });
});

const getOne = ok(async (req, res) => {
  const data = await payscaleDataService.getById(req.params.id);
  if (!data) {
    res.status(404).json({ success: false, error: '俸表不存在' });
    return;
  }
  res.json({ success: true, data });
});

const createVersion = ok(async (req, res) => {
  const data = await payscaleDataService.createVersion(req.body || {});
  res.status(201).json({ success: true, data });
});

const updateVersion = ok(async (req, res) => {
  const data = await payscaleDataService.updateVersion(req.params.id, req.body || {});
  res.json({ success: true, data });
});

const deleteVersion = ok(async (req, res) => {
  await payscaleDataService.deleteVersion(req.params.id);
  res.json({ success: true, data: null });
});

module.exports = {
  listVersions,
  getLatest,
  getOne,
  createVersion,
  updateVersion,
  deleteVersion,
};
