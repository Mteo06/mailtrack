/**
 * Webhook Service — HMAC-SHA256 signed payloads
 */
const crypto = require('crypto');
const fetch  = require('node-fetch');
const pool   = require('../utils/db');
const logger = require('../utils/logger');

function sign(payload, secret) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret || process.env.WEBHOOK_SECRET || '')
    .update(JSON.stringify(payload)).digest('hex');
}

async function trigger(userId, eventType, payload) {
  try {
    const { rows: [s] } = await pool.query(
      'SELECT webhook_url, webhook_secret FROM user_settings WHERE user_id=$1', [userId]);
    if (!s?.webhook_url) return;

    const sig  = sign(payload, s.webhook_secret);
    const body = JSON.stringify({ event: eventType, data: payload, ts: new Date() });
    let statusCode, success;
    try {
      const r = await fetch(s.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type':'application/json',
          'X-MailTrack-Event': eventType, 'X-MailTrack-Sig': sig },
        body, timeout: 5000,
      });
      statusCode = r.status; success = r.ok;
    } catch { success = false; }

    await pool.query(
      'INSERT INTO webhook_deliveries (user_id,event_type,payload,status_code,success) VALUES ($1,$2,$3,$4,$5)',
      [userId, eventType, payload, statusCode||null, success]);
  } catch (e) { logger.error('Webhook error', { e: e.message }); }
}

module.exports = { trigger };
