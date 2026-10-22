import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { config } from './index.js';

const CERT_DIR = path.join(config.rootDir, 'storage', 'dev-https');
const FILES = {
  key: path.join(CERT_DIR, 'key.pem'),
  cert: path.join(CERT_DIR, 'cert.pem'),
  meta: path.join(CERT_DIR, 'meta.json'),
};
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A self-signed certificate for the development https server, so a phone on
 * the same Wi-Fi can use its camera. It is created once and reused, and made
 * again when this computer's network addresses change or it nearly expires.
 * Browsers show a warning for it, which is expected: accept it once.
 */
export async function loadDevCertificate(hosts) {
  const wantedHosts = [...new Set(hosts)].sort();
  try {
    const [key, cert, metaText] = await Promise.all([
      fs.readFile(FILES.key, 'utf8'),
      fs.readFile(FILES.cert, 'utf8'),
      fs.readFile(FILES.meta, 'utf8'),
    ]);
    const meta = JSON.parse(metaText);
    const stillValid = new Date(meta.notAfter).getTime() - Date.now() > RENEW_BEFORE_MS;
    if (stillValid && JSON.stringify(meta.hosts) === JSON.stringify(wantedHosts)) return { key, cert };
  } catch {
    // No usable certificate yet: create one below.
  }

  // Only installed as a dev dependency, so it is loaded on demand.
  const { default: selfsigned } = await import('selfsigned');
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 1);
  const pems = await selfsigned.generate([{ name: 'commonName', value: `${config.appName} development` }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: wantedHosts.map((host) => (net.isIP(host) ? { type: 7, ip: host } : { type: 2, value: host })),
      },
    ],
  });

  await fs.mkdir(CERT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(FILES.key, pems.private),
    fs.writeFile(FILES.cert, pems.cert),
    fs.writeFile(FILES.meta, JSON.stringify({ hosts: wantedHosts, notAfter: notAfter.toISOString() })),
  ]);
  console.log('[web] Created a development https certificate in storage/dev-https');
  return { key: pems.private, cert: pems.cert };
}
