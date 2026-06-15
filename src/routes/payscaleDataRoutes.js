const express = require('express');
const payscaleDataController = require('../controllers/payscaleDataController');

const router = express.Router();

router.get('/latest', payscaleDataController.getLatest);
router.get('/versions', payscaleDataController.listVersions);
router.post('/versions', payscaleDataController.createVersion);
/** 與 DELETE 同效：部分代理／舊程序未載入 DELETE 路由時可改用此路徑 */
router.post('/versions/:id/delete', payscaleDataController.deleteVersion);
router.get('/versions/:id', payscaleDataController.getOne);
router.put('/versions/:id', payscaleDataController.updateVersion);
router.delete('/versions/:id', payscaleDataController.deleteVersion);

module.exports = router;
