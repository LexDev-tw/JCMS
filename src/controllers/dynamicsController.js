const dynamicsService = require('../services/dynamicsService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const dyn = (h) => wrapAsyncController(h, { errorStatus: 400, defaultErrorMessage: 'Request failed' });

const listPersons = dyn(async (req, res) => {
  const data = await dynamicsService.listPersons();
  res.json({ success: true, data });
});

const getPerson = dyn(async (req, res) => {
  const data = await dynamicsService.getPersonWithEvents(req.params.id);
  if (!data) {
    res.status(404).json({ success: false, error: '人物不存在' });
    return;
  }
  res.json({ success: true, data });
});

const createPerson = dyn(async (req, res) => {
  const data = await dynamicsService.createPerson(req.body || {});
  res.status(201).json({ success: true, data });
});

const updatePerson = dyn(async (req, res) => {
  const data = await dynamicsService.updatePerson(req.params.id, req.body || {});
  if (!data) {
    res.status(404).json({ success: false, error: '人物不存在' });
    return;
  }
  res.json({ success: true, data });
});

const deletePerson = dyn(async (req, res) => {
  const deleted = await dynamicsService.deletePerson(req.params.id);
  if (!deleted) {
    res.status(404).json({ success: false, error: '人物不存在' });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
});

const createEvent = dyn(async (req, res) => {
  const data = await dynamicsService.createDirectEvent(req.params.id, req.body || {});
  res.status(201).json({ success: true, data });
});

const deleteEvent = dyn(async (req, res) => {
  const ok = await dynamicsService.deleteEvent(req.params.eventId);
  if (!ok) {
    res.status(404).json({ success: false, error: '事件不存在' });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
});

const createImportBatch = dyn(async (req, res) => {
  const data = await dynamicsService.createImportBatch(req.body || {});
  res.status(201).json({ success: true, data });
});

const commitStructuredImport = dyn(async (req, res) => {
  const data = await dynamicsService.commitStructuredImport(req.body || {});
  res.status(201).json({ success: true, data });
});

const commitPipeStructuredImport = dyn(async (req, res) => {
  const data = await dynamicsService.commitPipeStructuredImport(req.body || {});
  res.status(201).json({ success: true, data });
});

const getImportBatch = dyn(async (req, res) => {
  const data = await dynamicsService.getBatchWithProposals(req.params.id);
  if (!data) {
    res.status(404).json({ success: false, error: '批次不存在' });
    return;
  }
  res.json({ success: true, data });
});

const listImportBatches = dyn(async (req, res) => {
  const data = await dynamicsService.listImportBatches(req.query.limit);
  res.json({ success: true, data });
});

const patchProposal = dyn(async (req, res) => {
  const result = await dynamicsService.patchProposal(req.params.id, req.body || {});
  if (result.error) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result });
});

const deleteImportBatch = dyn(async (req, res) => {
  const ok = await dynamicsService.deleteImportBatch(req.params.id);
  if (!ok) {
    res.status(404).json({ success: false, error: '批次不存在' });
    return;
  }
  res.json({ success: true, data: { deleted: true } });
});

const searchDynamics = dyn(async (req, res) => {
  const data = await dynamicsService.searchDynamics(req.query.q, req.query.limit);
  res.json({ success: true, data });
});

const rebuildDynamicsFts = dyn(async (req, res) => {
  const data = await dynamicsService.rebuildDynamicsFtsIndex();
  res.json({ success: true, data });
});

const dedupeDynamicsEvents = dyn(async (req, res) => {
  const data = await dynamicsService.dedupeDuplicateDynamicsEvents();
  res.json({ success: true, data });
});

const listAllEvents = dyn(async (req, res) => {
  const data = await dynamicsService.listAllEventsWithPerson(req.query.limit, req.query.offset);
  res.json({ success: true, data });
});

const patchEvent = dyn(async (req, res) => {
  const data = await dynamicsService.updateEventById(req.params.eventId, req.body || {});
  if (!data) {
    res.status(404).json({ success: false, error: '紀錄不存在' });
    return;
  }
  res.json({ success: true, data });
});

const getJudgeCourtRoster = dyn(async (req, res) => {
  const data = dynamicsService.getJudgeCourtRosterMeta();
  res.json({ success: true, data });
});

const postJudgeCourtRoster = dyn(async (req, res) => {
  const data = dynamicsService.saveJudgeCourtRosterFromDpt(req.body || {});
  res.json({ success: true, data });
});

module.exports = {
  listPersons,
  getPerson,
  createPerson,
  updatePerson,
  deletePerson,
  createEvent,
  deleteEvent,
  createImportBatch,
  commitStructuredImport,
  commitPipeStructuredImport,
  getImportBatch,
  listImportBatches,
  patchProposal,
  deleteImportBatch,
  searchDynamics,
  rebuildDynamicsFts,
  dedupeDynamicsEvents,
  listAllEvents,
  patchEvent,
  getJudgeCourtRoster,
  postJudgeCourtRoster,
};
