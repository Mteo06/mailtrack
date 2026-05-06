/**
 * Tracking Service
 * - Open pixel: returns 1x1 GIF immediately, processes event async
 * - Click redirect: validates URL, redirects immediately, logs async
 * - IP anonymization (GDPR default)
 * - Bot filtering
 * - Geolocation (country only)
 * - Redis pub/sub for real-time SSE
 */
const pool     = require('../utils/db');
const { client: redis } = require('../utils/redis');
const geoip    = require('geoip-lite');
const useragent = require('useragent');
const { URL }  = require('url');
const logger   = require('../utils/logger');
const webhookService = require('./webhookService');

// 1×1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const BOT_RE = /bot|crawl|spider|slurp|preview|prefetch|mediapartners|facebookexternalhit|twitterbot|linkedinbot/i;

function isBot(ua = '') { return BOT_RE.test(ua); }

function anonymizeIP(ip = '') {
  if (!ip) return null;
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.0');  // IPv4
  return ip.split(':').slice(0, 3).join(':') + ':0:0:0:0:0'; // IPv6 /48
}

function getGeo(ip) {
  try { const g = geoip.lookup(ip); return g?.country || null; }
  catch { return null; }
}

function parseUA(ua = '') {
  const a = useragent.parse(ua);
  const device = /mobile/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop';
  return { browser: a.family, os: a.os.family, device_type: device };
}

async function publish(channel, data) {
  try { await redis.publish(channel, JSON.stringify(data)); }
  catch (e) { logger.warn('Redis publish failed', { e: e.message }); }
}

// ── OPEN PIXEL ────────────────────────────────────────────────────────────
async function handleOpenTracking(req, res) {
  res.set({
    'Content-Type':  'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(PIXEL);
  processOpen(req.params.trackingId, req).catch((e) =>
    logger.error('Open processing error', { e: e.message }));
}

async function processOpen(trackingId, req) {
  const ip = req.ip || '';
  const ua = req.headers['user-agent'] || '';
  if (isBot(ua)) return;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT te.id, te.user_id, te.tracking_enabled,
              us.ip_anonymization, us.notify_on_open,
              us.tracking_enabled AS global_on
       FROM tracked_emails te
       JOIN user_settings us ON us.user_id = te.user_id
       WHERE te.id = $1`, [trackingId]);
    if (!rows.length) return;
    const em = rows[0];
    if (!em.tracking_enabled || !em.global_on) return;

    const storedIP  = em.ip_anonymization ? anonymizeIP(ip) : ip;
    const country   = getGeo(ip);
    const { browser, os, device_type } = parseUA(ua);

    await client.query('BEGIN');
    const { rows: [ev] } = await client.query(
      `INSERT INTO open_events
         (email_id,user_id,ip_address,ip_anonymized,user_agent,device_type,os,browser,country,is_bot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) RETURNING id,occurred_at`,
      [em.id, em.user_id, storedIP, em.ip_anonymization, ua, device_type, os, browser, country]);
    await client.query(
      `UPDATE tracked_emails
       SET open_count=open_count+1,
           status=CASE WHEN status='sent' THEN 'opened' ELSE status END,
           first_opened_at=COALESCE(first_opened_at,NOW()),
           last_opened_at=NOW()
       WHERE id=$1`, [em.id]);
    await client.query('COMMIT');

    if (em.notify_on_open) {
      const payload = { type:'email.opened', emailId:em.id, userId:em.user_id,
        country, device_type, browser, occurred_at: ev.occurred_at };
      await publish(`user:${em.user_id}:events`, payload);
      await webhookService.trigger(em.user_id, 'email.opened', payload);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

// ── CLICK REDIRECT ────────────────────────────────────────────────────────
async function handleClickTracking(req, res) {
  const raw = req.query.redirect;
  let safe;
  try {
    const p = new URL(decodeURIComponent(raw));
    if (!['http:', 'https:'].includes(p.protocol)) throw new Error();
    safe = p.href;
  } catch { return res.status(400).send('Invalid redirect URL'); }

  res.redirect(302, safe);
  processClick(req.params.linkId, req).catch((e) =>
    logger.error('Click processing error', { e: e.message }));
}

async function processClick(linkId, req) {
  const ip = req.ip || '';
  const ua = req.headers['user-agent'] || '';
  if (isBot(ua)) return;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT tl.id, tl.email_id, tl.user_id,
              us.ip_anonymization, us.notify_on_click,
              us.tracking_enabled AS global_on
       FROM tracked_links tl
       JOIN user_settings us ON us.user_id = tl.user_id
       WHERE tl.id = $1`, [linkId]);
    if (!rows.length) return;
    const lk = rows[0];
    if (!lk.global_on) return;

    const storedIP = lk.ip_anonymization ? anonymizeIP(ip) : ip;
    const country  = getGeo(ip);
    const { device_type } = parseUA(ua);

    await client.query('BEGIN');
    const { rows: [ev] } = await client.query(
      `INSERT INTO click_events
         (link_id,email_id,user_id,ip_address,ip_anonymized,user_agent,device_type,country,is_bot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false) RETURNING id,occurred_at`,
      [lk.id, lk.email_id, lk.user_id, storedIP, lk.ip_anonymization, ua, device_type, country]);
    await client.query('UPDATE tracked_links SET click_count=click_count+1 WHERE id=$1', [lk.id]);
    await client.query(
      `UPDATE tracked_emails SET click_count=click_count+1, status='clicked' WHERE id=$1`,
      [lk.email_id]);
    await client.query('COMMIT');

    if (lk.notify_on_click) {
      const payload = { type:'link.clicked', linkId:lk.id, emailId:lk.email_id,
        userId:lk.user_id, country, device_type, occurred_at: ev.occurred_at };
      await publish(`user:${lk.user_id}:events`, payload);
      await webhookService.trigger(lk.user_id, 'link.clicked', payload);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

module.exports = { handleOpenTracking, handleClickTracking };
