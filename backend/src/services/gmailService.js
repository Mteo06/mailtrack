/**
 * Gmail Integration Service
 * Scope: gmail.compose only (minimum required).
 * Does NOT store email body content.
 */
const { google } = require('googleapis');
const pool       = require('../utils/db');
const emailSvc   = require('./emailService');
const logger     = require('../utils/logger');

const oauthConfig = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI);

function getAuthUrl(state) {
  return oauthConfig().generateAuthUrl({
    access_type: 'offline', prompt: 'consent', state,
    scope: [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
}

async function handleCallback(code, userId) {
  const oauth2 = oauthConfig();
  const { tokens } = await oauth2.getToken(code);
  // In production: encrypt tokens before storing
  await pool.query('UPDATE users SET google_tokens=$1 WHERE id=$2',
    [JSON.stringify(tokens), userId]);
  return tokens;
}

async function getGmailClient(userId) {
  const { rows: [u] } = await pool.query(
    'SELECT google_tokens FROM users WHERE id=$1', [userId]);
  if (!u?.google_tokens) throw Object.assign(new Error('Gmail not connected'), { status: 400 });

  const oauth2 = oauthConfig();
  const tokens = typeof u.google_tokens === 'string' ? JSON.parse(u.google_tokens) : u.google_tokens;
  oauth2.setCredentials(tokens);
  oauth2.on('tokens', async (t) => {
    await pool.query('UPDATE users SET google_tokens=$1 WHERE id=$2',
      [JSON.stringify({ ...tokens, ...t }), userId]);
  });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

async function sendTrackedEmail(userId, { subject, to, body, enableTracking, trackLinks }) {
  let htmlBody = body;
  let trackingId = null;

  if (enableTracking) {
    const { id, trackingPixelHtml } = await emailSvc.createTrackedEmail(userId,
      { subject, recipientEmail: to });
    trackingId = id;
    if (trackLinks) {
      const { modifiedHtml } = await emailSvc.rewriteLinks(userId, id, htmlBody);
      htmlBody = modifiedHtml;
    }
    htmlBody += `\n${trackingPixelHtml}`;
  }

  const mime = [
    `To: ${to}`, `Subject: ${subject}`,
    'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', htmlBody,
  ].join('\r\n');

  const raw = Buffer.from(mime).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

  const gmail = await getGmailClient(userId);
  const { data } = await gmail.users.messages.send(
    { userId: 'me', requestBody: { raw } });

  if (trackingId) await pool.query(
    'UPDATE tracked_emails SET gmail_message_id=$1, gmail_thread_id=$2 WHERE id=$3',
    [data.id, data.threadId, trackingId]);

  logger.info('Email sent', { userId, trackingId, gmailId: data.id });
  return { gmailMessageId: data.id, trackingId };
}

module.exports = { getAuthUrl, handleCallback, getGmailClient, sendTrackedEmail };
