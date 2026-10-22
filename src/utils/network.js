import os from 'node:os';

/**
 * This computer's IPv4 addresses on the local network (Wi-Fi or Ethernet),
 * home network ranges first. Phones on the same Wi-Fi connect to these.
 */
export function lanAddresses() {
  const addresses = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const usable = entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.');
      if (usable) addresses.add(entry.address);
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return [...addresses].sort((a, b) => rank(a) - rank(b));
}

/** True for names that only work on this computer, such as localhost. */
export function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}
