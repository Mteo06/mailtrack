const express = require('express');
const { authenticate } = require('../middleware/auth');
const notifSvc = require('../services/notificationService');
const router = express.Router();
router.get('/stream', authenticate, (req, res) => notifSvc.registerClient(req.user.id, res));
module.exports = router;
