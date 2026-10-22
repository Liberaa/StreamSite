// Entry point: connects to MongoDB, then starts the website, the real-time
// chat, browser streaming and the media server that receives streams from OBS.
import http from 'node:http';
import https from 'node:https';
import { createApp } from './src/app.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { loadDevCertificate } from './src/config/devHttps.js';
import { config } from './src/config/index.js';
import { createSessionMiddleware } from './src/config/session.js';
import { startMediaServer } from './src/services/mediaServer.js';
import { phoneSiteUrl } from './src/services/mediaUrls.js';
import { createSocketServer } from './src/sockets/index.js';
import { createIngestServer, stopAllBroadcasts } from './src/sockets/ingest.js';
import { lanAddresses } from './src/utils/network.js';

async function main() {
  await connectDatabase();

  const sessionMiddleware = createSessionMiddleware();
  const app = createApp({ sessionMiddleware });
  const servers = [http.createServer(app)];
  const httpsServer = await createDevHttpsServer(app);
  if (httpsServer) servers.push(httpsServer);

  const io = createSocketServer(servers, sessionMiddleware);
  const ingest = createIngestServer(servers, sessionMiddleware);
  const mediaServer = await startMediaServer();

  servers[0].listen(config.port, () => {
    console.log(`[web] ${config.appName} is running at http://localhost:${config.port}`);
  });
  httpsServer?.listen(config.devHttpsPort, () => {
    const phoneUrl = phoneSiteUrl();
    if (phoneUrl) console.log(`[web] Phones on the same Wi-Fi: ${phoneUrl} (accept the certificate warning once)`);
  });

  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`\n[server] ${signal} received, shutting down...`);
    setTimeout(() => process.exit(1), 5000).unref(); // Give up after 5 seconds.
    stopAllBroadcasts();
    ingest.close();
    io.close(); // Also closes the http server.
    httpsServer?.close();
    await mediaServer.stop();
    await disconnectDatabase();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Development only: https, so a phone on the same Wi-Fi may use its camera.
async function createDevHttpsServer(app) {
  if (!config.devHttpsPort) return null;
  try {
    const certificate = await loadDevCertificate(['localhost', '127.0.0.1', ...lanAddresses()]);
    return https.createServer(certificate, app);
  } catch (error) {
    console.warn(`[web] Development https is off: ${error.message}`);
    return null;
  }
}

main().catch((error) => {
  console.error(`[server] Failed to start: ${error.message}`);
  process.exit(1);
});
