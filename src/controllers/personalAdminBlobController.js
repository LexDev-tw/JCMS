const personalAdminBlobService = require('../services/personalAdminBlobService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getAdmin = wrapAsyncController(async (req, res) => {
  const data = await personalAdminBlobService.getPersonalAdminBlob();
  res.status(200).json({ success: true, data });
});

const putAdmin = wrapAsyncController(async (req, res) => {
  const data = await personalAdminBlobService.savePersonalAdminBlob(req.body || {});
  res.status(200).json({ success: true, data });
});

module.exports = {
  getAdmin,
  putAdmin,
};
