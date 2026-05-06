const express = require('express');
const { handleOpenTracking, handleClickTracking } = require('../services/trackingService');
const { trackingLimiter } = require('../middleware/rateLimiter');
const router = express.Router();
router.use(trackingLimiter);
router.get('/open/:trackingId', handleOpenTracking);
router.get('/click/:linkId',    handleClickTracking);
module.exports = router;
