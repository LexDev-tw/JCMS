const express = require('express');
const dynamicsController = require('../controllers/dynamicsController');

const router = express.Router();

router.get('/search', dynamicsController.searchDynamics);
// 瀏覽器網址列用 GET 開此路徑會 404；明確回 405 以免與「路由不存在」混淆
router.get('/fts/rebuild', (req, res) => {
  res.status(405).set('Allow', 'POST, OPTIONS').json({
    error: 'Method Not Allowed',
    hint: '全文索引重建請用 POST；請由 JCMS 介面「重建索引」操作，勿在網址列直接開啟。',
  });
});
router.options('/fts/rebuild', (req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res.sendStatus(204);
});
router.post('/fts/rebuild', dynamicsController.rebuildDynamicsFts);

router.get('/dedupe-events', (req, res) => {
  res.status(405).set('Allow', 'POST, OPTIONS').json({
    error: 'Method Not Allowed',
    hint: '清除重複紀錄請用 POST；請由 JCMS 司法動態介面操作，勿在網址列直接開啟。',
  });
});
router.options('/dedupe-events', (req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res.sendStatus(204);
});
router.post('/dedupe-events', dynamicsController.dedupeDynamicsEvents);

router.get('/events', dynamicsController.listAllEvents);
router.patch('/events/:eventId', dynamicsController.patchEvent);

router.get('/judge-roster', dynamicsController.getJudgeCourtRoster);
router.post('/judge-roster', dynamicsController.postJudgeCourtRoster);

router.get('/persons', dynamicsController.listPersons);
router.post('/persons', dynamicsController.createPerson);
router.get('/persons/:id', dynamicsController.getPerson);
router.patch('/persons/:id', dynamicsController.updatePerson);
router.delete('/persons/:id', dynamicsController.deletePerson);
router.post('/persons/:id/events', dynamicsController.createEvent);
router.delete('/persons/:id/events/:eventId', dynamicsController.deleteEvent);

router.post('/import-structured/commit', dynamicsController.commitStructuredImport);
router.post('/import-pipe/commit', dynamicsController.commitPipeStructuredImport);

router.get('/import-batches', dynamicsController.listImportBatches);
router.post('/import-batches', dynamicsController.createImportBatch);
router.get('/import-batches/:id', dynamicsController.getImportBatch);
router.delete('/import-batches/:id', dynamicsController.deleteImportBatch);

router.patch('/proposals/:id', dynamicsController.patchProposal);

module.exports = router;
