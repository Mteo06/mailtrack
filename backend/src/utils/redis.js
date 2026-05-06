const { createClient } = require('redis');
const logger = require('./logger');
const client     = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });
client.on('error',     (e) => logger.error('Redis client error',     { e: e.message }));
subscriber.on('error', (e) => logger.error('Redis subscriber error', { e: e.message }));
let connected = false;
async function connect() {
  if (connected) return;
  await client.connect();
  await subscriber.connect();
  connected = true;
  logger.info('Redis connected');
}
module.exports = { client, subscriber, connect };
