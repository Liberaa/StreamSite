/**
 * Attaches a Socket.IO server to every web server: plain http, plus the
 * development https server for phones when it is enabled.
 */
export function attachToServers(io, servers) {
  const [first, ...others] = servers;
  io.attach(first);
  for (const server of others) io.engine.attach(server, { path: io.path() });
  return io;
}
