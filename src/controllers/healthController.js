const { asyncHandler } = require('../middleware/asyncHandler');
const healthService = require('../services/healthService');

const getHealth = asyncHandler(async (req, res) => {
  const payload = await healthService.getHealth();
  res.json(payload);
});

module.exports = {
  getHealth,
};
