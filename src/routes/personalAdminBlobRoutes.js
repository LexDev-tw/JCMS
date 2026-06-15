const express = require('express');
const personalAdminBlobController = require('../controllers/personalAdminBlobController');

const router = express.Router();

router.get('/admin', personalAdminBlobController.getAdmin);
router.put('/admin', personalAdminBlobController.putAdmin);

module.exports = router;
