const caseService = require('../services/caseService');
const caseImportService = require('../services/caseImportService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getCases = wrapAsyncController(async (req, res) => {
  const data = await caseService.getAllCases();
  res.status(200).json({ success: true, data });
});

const createCase = wrapAsyncController(async (req, res) => {
  const data = await caseService.createCase(req.body);
  res.status(201).json({ success: true, data });
});

const updateCase = wrapAsyncController(async (req, res) => {
  const data = await caseService.updateCase(req.params.id, req.body);
  if (!data) {
    res.status(500).json({ success: false, error: 'Case not found' });
    return;
  }
  res.status(200).json({ success: true, data });
});

const deleteCase = wrapAsyncController(async (req, res) => {
  const deleted = await caseService.deleteCase(req.params.id);
  res.status(200).json({ success: true, data: { deleted } });
});

const importCasesExcel = wrapAsyncController(async (req, res) => {
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    res.status(400).json({ success: false, error: 'No excel file uploaded' });
    return;
  }
  const dryRunRaw = String(req.body?.dryRun ?? req.query?.dryRun ?? 'true').toLowerCase();
  const dryRun = !(dryRunRaw === 'false' || dryRunRaw === '0' || dryRunRaw === 'no');
  const workspaceId =
    req.body?.workspaceId != null && String(req.body.workspaceId).trim() !== ''
      ? String(req.body.workspaceId).trim()
      : 'WS_001';
  const data = await caseImportService.importCasesFromExcelBuffer(req.file.buffer, {
    dryRun,
    workspaceId,
  });
  res.status(200).json({ success: true, data });
});

module.exports = {
  getCases,
  createCase,
  updateCase,
  deleteCase,
  importCasesExcel,
};
