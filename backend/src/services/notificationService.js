/**
 * Notification Service — Server-Sent Events
 * Each user gets a persistent SSE connection.
 * Events are published via Redis pub/sub from the tracking service.
 */
const { subscriber } = require('../utils/redis');
const logger = require('../utils/logger');

// userId -> Set<Response>
const clients = new Map();

function registerClient(userId, res) {
  res.set({
    'Content-Type':     'text/event-stream',
    'Cache-Control':    'no-cache',
    'Connection':       'keep-alive',
    'X-Accel-Buffering':'no',
  });
  res.flushHeaders();

  // Heartbeat every 30s to keep connection alive through proxies
  const hb = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { clearInterval(hb); }
  }, 30000);

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  logger.info('SSE client connected', { userId });

  res.on('close', () => {
    clearInterval(hb);
    clients.get(userId)?.delete(res);
    if (!clients.get(userId)?.size) clients.delete(userId);
    logger.info('SSE client disconnected', { userId });
  });
}

async function startSubscriber() {
  await subscriber.pSubscribe('user:*:events', (message, channel) => {
    const userId = channel.split(':')[1];
    if (!clients.has(userId)) return;
    const data = `data: ${message}\n\n`;
    for (const res of clients.get(userId)) {
      try { res.write(data); }
      catch { clients.get(userId).delete(res); }
    }
  });
  logger.info('SSE Redis subscriber started');
}

module.exports = { registerClient, startSubscriber };
