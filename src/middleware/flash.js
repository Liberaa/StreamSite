// One-time messages that survive a redirect, e.g. "Profile saved."

export function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

export function flash(req, res, next) {
  if (req.session?.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  next();
}
