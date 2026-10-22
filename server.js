// Entry point: connects to MongoDB, then starts the website, the real-time
// chat and the media server that receives streams from OBS.
import http from 'node:http';
import { createApp } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { config } from './src/config/index.js';
import { createSessionMiddleware } from './src/config/session.js';
import { startMediaServer } from './src/services/mediaServer.js';
import { createSocketServer } from './src/sockets/index.js';

async function main() {
  await connectDatabase();

  const sessionMiddleware = createSessionMiddleware();
  const app = createApp({ sessionMiddleware });
  const server = http.createServer(app);
  const io = createSocketServer(server, sessionMiddleware);
  const mediaServer = await startMediaServer();

  server.listen(config.port, () => {
    console.log(`[web] ${config.appName} is running at http://localhost:${config.port}`);
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`\n[server] ${signal} received, shutting down...`);
    setTimeout(() => process.exit(1), 5000).unref(); // Give up after 5 seconds.
    io.close(); // Also closes the HTTP server.
    await mediaServer.stop();
    await disconnectDatabase();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`[server] Failed to start: ${error.message}`);
  process.exit(1);
});
