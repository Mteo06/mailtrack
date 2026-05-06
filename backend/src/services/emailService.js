const { v4: uuid } = require('uuid');
const { URL }      = require('url');
const validator    = require('validator');
const pool         = require('../utils/db');
const logger       = require('../utils/logger');

const BASE = process.env.TRACKING_BASE_URL || 'http://localhost:3001';

async function createTrackedEmail(userId, { id: providedId, subject, recipientEmail, gmailMessageId, gmailThreadId }) {
  const id = providedId || uuid();
  await pool.query(
    `INSERT INTO tracked_emails (id,user_id,gmail_message_id,gmail_thread_id,subject,recipient_email)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, userId, gmailMessageId||null, gmailThreadId||null, subject||null, recipientEmail||null]);
  logger.info('Tracked email created', { id, userId });
  return {
    id,
    trackingPixelUrl:  `${BASE}/track/open/${id}`,
    trackingPixelHtml: `<img src="${BASE}/track/open/${id}" width="1" height="1" style="display:none" alt=""/>`,
  };
}

async function createTrackedLink(userId, emailId, originalUrl) {
  if (!validator.isURL(originalUrl, { protocols:['http','https'], require_protocol:true }))
    throw Object.assign(new Error('Invalid URL'), { status: 400 });
  const id = uuid();
  await pool.query(
    'INSERT INTO tracked_links (id,email_id,user_id,original_url) VALUES ($1,$2,$3,$4)',
    [id, emailId, userId, originalUrl]);
  const u = new URL(`${BASE}/track/click/${id}`);
  u.searchParams.set('redirect', originalUrl);
  return { id, trackedUrl: u.href };
}

async function rewriteLinks(userId, emailId, htmlBody) {
  const urls = new Set();
  const re = /href="(https?:\/\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(htmlBody)) !== null) urls.add(m[1]);

  const urlMap = new Map();
  for (const url of urls) {
    try {
      const t = await createTrackedLink(userId, emailId, url);
      urlMap.set(url, t.trackedUrl);
    } catch { /* skip invalid */ }
  }

  const modifiedHtml = htmlBody.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_, url) => urlMap.has(url) ? `href="${urlMap.get(url)}"` : `href="${url}"`);
  return { modifiedHtml };
}

async function getEmailStats(emailId, userId) {
  const { rows: [email] } = await pool.query(
    `SELECT id,subject,recipient_email,status,open_count,click_count,
            first_opened_at,last_opened_at,sent_at
     FROM tracked_emails WHERE id=$1 AND user_id=$2`, [emailId, userId]);
  if (!email) return null;

  const { rows: opens } = await pool.query(
    `SELECT occurred_at,device_type,browser,os,country
     FROM open_events WHERE email_id=$1 AND is_bot=false
     ORDER BY occurred_at DESC LIMIT 50`, [emailId]);

  const { rows: clicks } = await pool.query(
    `SELECT ce.occurred_at,ce.device_type,ce.country,tl.original_url
     FROM click_events ce JOIN tracked_links tl ON tl.id=ce.link_id
     WHERE ce.email_id=$1 AND ce.is_bot=false
     ORDER BY ce.occurred_at DESC LIMIT 50`, [emailId]);

  return { email, opens, clicks };
}

module.exports = { createTrackedEmail, createTrackedLink, rewriteLinks, getEmailStats };
