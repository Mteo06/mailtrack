const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuid } = require('uuid');
const pool     = require('../utils/db');
const { signToken, authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { auditLog }    = require('../utils/audit');
const gmailSvc        = require('../services/gmailService');
const { google }      = require('googleapis');
const router = express.Router();

// POST /auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be ≥ 8 chars' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const id   = uuid();
    await pool.query('BEGIN');
    await pool.query(
      'INSERT INTO users (id,email,name,password_hash) VALUES ($1,$2,$3,$4)',
      [id, email.toLowerCase(), name||null, hash]);
    await pool.query('INSERT INTO user_settings (user_id) VALUES ($1)', [id]);
    await pool.query('COMMIT');
    await auditLog(id, 'register', { email }, req.ip);
    res.status(201).json({ token: signToken(id), user: { id, email, name } });
  } catch (err) {
    await pool.query('ROLLBACK').catch(()=>{});
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows: [u] } = await pool.query(
      'SELECT id,email,name,plan,password_hash FROM users WHERE email=$1',
      [email.toLowerCase()]);
    if (!u?.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    if (!await bcrypt.compare(password, u.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    await auditLog(u.id, 'login', {}, req.ip);
    res.json({ token: signToken(u.id), user: { id:u.id, email:u.email, name:u.name, plan:u.plan } });
  } catch (err) { next(err); }
});

// GET /auth/google
router.get('/google', (req, res) => {
  const state = Buffer.from(JSON.stringify({ nonce: uuid() })).toString('base64');
  res.redirect(gmailSvc.getAuthUrl(state));
});

// GET /auth/google/callback
router.get('/google/callback', async (req, res, next) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing auth code');
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const api = google.oauth2({ version:'v2', auth: oauth2Client });
    const { data: gu } = await api.userinfo.get();

    const { rows: [u] } = await pool.query(
      `INSERT INTO users (id,email,name,google_id,google_tokens)
       VALUES (gen_random_uuid(),$1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET
         google_id=EXCLUDED.google_id, google_tokens=EXCLUDED.google_tokens, updated_at=NOW()
       RETURNING id,email,name,plan`,
      [gu.email, gu.name, gu.id, JSON.stringify(tokens)]);
    await pool.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u.id]);
    await auditLog(u.id, 'google_login', {}, req.ip);
    res.redirect(`${process.env.FRONTEND_URL}?token=${signToken(u.id)}`);
  } catch (err) { next(err); }
});

// GET /auth/me
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
