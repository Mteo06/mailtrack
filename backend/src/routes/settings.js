const express    = require('express');
const { authenticate } = require('../middleware/auth');
const pool       = require('../utils/db');
const { auditLog } = require('../utils/audit');
const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows:[s] } = await pool.query(
      `SELECT tracking_enabled,ip_anonymization,data_retention_days,
              notify_on_open,notify_on_click,webhook_url,slack_webhook_url,telegram_chat_id
       FROM user_settings WHERE user_id=$1`, [req.user.id]);
    const { rows:[u] } = await pool.query(
      'SELECT google_tokens FROM users WHERE id=$1', [req.user.id]);
    res.json({
      ...(s || {}),
      gmail_connected: !!u?.google_tokens
    });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const { tracking_enabled,ip_anonymization,data_retention_days,
          notify_on_open,notify_on_click,webhook_url,slack_webhook_url,telegram_chat_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_settings
         (user_id,tracking_enabled,ip_anonymization,data_retention_days,
          notify_on_open,notify_on_click,webhook_url,slack_webhook_url,telegram_chat_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET
         tracking_enabled=COALESCE($2,user_settings.tracking_enabled),
         ip_anonymization=COALESCE($3,user_settings.ip_anonymization),
         data_retention_days=COALESCE($4,user_settings.data_retention_days),
         notify_on_open=COALESCE($5,user_settings.notify_on_open),
         notify_on_click=COALESCE($6,user_settings.notify_on_click),
         webhook_url=COALESCE($7,user_settings.webhook_url),
         slack_webhook_url=COALESCE($8,user_settings.slack_webhook_url),
         telegram_chat_id=COALESCE($9,user_settings.telegram_chat_id),
         updated_at=NOW()`,
      [req.user.id,tracking_enabled,ip_anonymization,data_retention_days,
       notify_on_open,notify_on_click,webhook_url,slack_webhook_url,telegram_chat_id]);
    await auditLog(req.user.id, 'settings_change', { fields: Object.keys(req.body) }, req.ip);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GDPR: export all user data
router.get('/gdpr/export', async (req, res, next) => {
  try {
    const [[{rows:[user]}],[{rows:emails}],[{rows:opens}],[{rows:clicks}]] = await Promise.all([
      pool.query('SELECT id,email,name,plan,created_at FROM users WHERE id=$1',[req.user.id]),
      pool.query('SELECT id,subject,status,open_count,click_count,sent_at FROM tracked_emails WHERE user_id=$1',[req.user.id]),
      pool.query('SELECT occurred_at,device_type,browser,country FROM open_events WHERE user_id=$1',[req.user.id]),
      pool.query('SELECT occurred_at,device_type,country FROM click_events WHERE user_id=$1',[req.user.id]),
    ].map(q => q.then(r=>[r])));
    await auditLog(req.user.id, 'data_export', {}, req.ip);
    res.json({ exportedAt: new Date(), user, emails, opens, clicks });
  } catch (e) { next(e); }
});

// GDPR: delete account
router.delete('/gdpr/delete', async (req, res, next) => {
  try {
    await auditLog(req.user.id, 'data_deletion', {}, req.ip);
    await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
    res.json({ success: true, message: 'Account and all data deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
