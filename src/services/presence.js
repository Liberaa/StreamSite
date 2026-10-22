// How many people have each channel page open, kept up to date by the chat sockets.
// This lives in memory, so it only works with a single server process.
const viewerCounts = new Map();

export function setViewerCount(username, count) {
  if (count > 0) viewerCounts.set(username, count);
  else viewerCounts.delete(username);
}

export function getViewerCount(username) {
  return viewerCounts.get(username) ?? 0;
}
