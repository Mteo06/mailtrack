const express    = require('express');
const { authenticate } = require('../middleware/auth');
const emailSvc   = require('../services/emailService');
const gmailSvc   = require('../services/gmailService');
const pool       = require('../utils/db');
const router = express.Router();
router.use(authenticate);

router.post('/create', async (req, res, next) => {
  try {
    const r = await emailSvc.createTrackedEmail(req.user.id, req.body);
    res.status(201).json(r);
  } catch (e) { next(e); }
});

router.post('/send', async (req, res, next) => {
  try {
    const { rows:[s] } = await pool.query(
      'SELECT tracking_enabled FROM user_settings WHERE user_id=$1', [req.user.id]);
    const { subject, to, body, enableTracking, trackLinks } = req.body;
    const useTracking = enableTracking && (s?.tracking_enabled ?? false);
    const r = await gmailSvc.sendTrackedEmail(req.user.id,
      { subject, to, body, enableTracking: useTracking, trackLinks: useTracking && trackLinks });
    res.json(r);
  } catch (e) { next(e); }
});

router.get('/list', async (req, res, next) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit  = Math.min(50,parseInt(req.query.limit || '20', 10));
  const offset = (page-1)*limit;
  try {
    const { rows } = await pool.query(
      `SELECT id,subject,recipient_email,status,open_count,click_count,
              first_opened_at,last_opened_at,sent_at
       FROM tracked_emails WHERE user_id=$1 ORDER BY sent_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]);
    const { rows:[{count}] } = await pool.query(
      'SELECT COUNT(*) FROM tracked_emails WHERE user_id=$1', [req.user.id]);
    res.json({ emails: rows, total: parseInt(count,10), page, limit });
  } catch (e) { next(e); }
});

router.get('/:id/stats', async (req, res, next) => {
  try {
    const s = await emailSvc.getEmailStats(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ error: 'Email not found' });
    res.json(s);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM tracked_emails WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
