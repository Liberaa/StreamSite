import path from 'node:path';
import express from 'express';
import { categoryName } from './config/categories.js';
import { config } from './config/index.js';
import { loadCurrentUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { flash } from './middleware/flash.js';
import { crossOriginProtection, securityHeaders } from './middleware/security.js';
import routes from './routes/index.js';
import { mediaOrigin } from './services/mediaUrls.js';
import { compactNumber, initials, onAccent, plural, timeAgo } from './utils/format.js';

/** Builds the Express app. The HTTP server itself is started in server.js. */
export function createApp({ sessionMiddleware }) {
  const app = express();

  app.set('views', path.join(config.rootDir, 'views'));
  app.set('view engine', 'ejs');
  if (config.trustProxy) app.set('trust proxy', 1);

  // Available in every view.
  Object.assign(app.locals, {
    appName: config.appName,
    isProduction: config.isProduction,
    currentUser: null,
    flash: null,
    categoryName,
    compactNumber,
    initials,
    onAccent,
    plural,
    timeAgo,
  });

  // Where the browser loads video from (also allowed in the security policy).
  app.use((req, res, next) => {
    res.locals.mediaOrigin = mediaOrigin(req);
    next();
  });
  app.use(securityHeaders());

  // Static files are served before sessions, so they never touch the database.
  const staticOptions = { maxAge: config.isProduction ? '7d' : 0 };
  app.use(express.static(path.join(config.rootDir, 'public'), staticOptions));
  app.use('/vendor/mpegts', express.static(path.join(config.rootDir, 'node_modules', 'mpegts.js', 'dist'), staticOptions));

  app.use(crossOriginProtection);
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(sessionMiddleware);
  app.use(loadCurrentUser);
  app.use(flash);

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
