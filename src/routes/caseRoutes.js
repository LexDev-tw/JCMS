const express = require('express');
const multer = require('multer');
const caseController = require('../controllers/caseController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get('/', caseController.getCases);
router.post('/import-excel', upload.single('file'), caseController.importCasesExcel);
router.post('/', caseController.createCase);
router.put('/:id', caseController.updateCase);
router.delete('/:id', caseController.deleteCase);

module.exports = router;
