import { wantsJson } from '../utils/http.js';

const TITLES = { 400: 'Bad request', 401: 'Log in first', 403: 'Not allowed', 404: 'Not found', 429: 'Slow down' };

/** Renders the error page, or JSON for fetch() calls. */
export function renderError(req, res, status, message) {
  res.status(status);
  if (wantsJson(req)) return res.json({ error: message });
  res.render('pages/error', { title: TITLES[status] ?? 'Error', status, message }, (failure, html) => {
    if (failure) {
      console.error('[error page]', failure);
      return res.type('text').send(message);
    }
    res.send(html);
  });
}

export function notFound(req, res) {
  renderError(req, res, 404, "We couldn't find that page.");
}

// Express 5 sends errors from async route handlers here automatically.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error.status ?? error.statusCode) || 500;
  if (status >= 500) console.error(error);
  const message = status >= 500
    ? 'Something went wrong on our side. Please try again.'
    : (error.expose && error.message) || 'That request did not work.';
  renderError(req, res, status, message);
}
