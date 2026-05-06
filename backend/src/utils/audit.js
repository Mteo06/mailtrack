const pool = require('./db');
async function auditLog(userId, action, details = {}, ip = null) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, action, details, ip_address) VALUES ($1,$2,$3,$4)',
      [userId, action, JSON.stringify(details), ip]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
module.exports = { auditLog };
