const jwt  = require('jsonwebtoken');
const pool = require('../utils/db');

async function authenticate(req, res, next) {
  let token = req.query.token; // Support token in query (for SSE/EventSource)
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7);
  }
  if (!token) return res.status(401).json({ error: 'Missing token' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Token invalid or expired' }); }
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, plan FROM users WHERE id = $1', [payload.sub]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch (err) { next(err); }
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

module.exports = { authenticate, signToken };
