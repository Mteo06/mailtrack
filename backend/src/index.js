require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const logger    = require('./utils/logger');
const { connect: connectRedis } = require('./utils/redis');
const errorHandler   = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const notifSvc       = require('./services/notificationService');

const app  = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Security headers
// Security headers — configured to allow inline scripts for the vanilla dashboard
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "http://localhost:3001"],
    },
  },
}));

// CORS
const allowed = [process.env.FRONTEND_URL, process.env.EXTENSION_ORIGIN].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || allowed.includes(origin)) ? cb(null, true) : cb(new Error('CORS blocked')),
  credentials: true,
}));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));
app.set('trust proxy', 1);
app.use('/api', apiLimiter);

// Routes
app.use('/auth',          require('./routes/auth'));
app.use('/email',         require('./routes/email'));
app.use('/track',         require('./routes/tracking'));
app.use('/user/settings', require('./routes/settings'));
app.use('/notifications', require('./routes/notifications'));

// Serve static frontend
const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend')));

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.get('/privacy', (_, res) => res.json({
  name: 'MailTrack SaaS Privacy Policy',
  dataCollected: ['Open timestamps', 'Country (from IP)', 'Device type', 'Browser'],
  dataNotCollected: ['Email body content', 'Full IP (anonymized by default)'],
  retention: 'Configurable per user, default 365 days',
  gdprRights: {
    export: 'GET /user/settings/gdpr/export',
    delete: 'DELETE /user/settings/gdpr/delete',
  },
}));

app.use((_, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

async function start() {
  try {
    await connectRedis();
    await notifSvc.startSubscriber();
    app.listen(PORT, () => logger.info(`MailTrack running on port ${PORT}`, { env: process.env.NODE_ENV }));
  } catch (err) {
    logger.error('Failed to start', { err: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => { logger.info('Shutting down'); process.exit(0); });

start();
