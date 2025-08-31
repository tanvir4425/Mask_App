// middleware/requireAdmin.js
module.exports = function requireAdmin(req, res, next) {
  try {
    // support either req.user or res.locals (depending on your auth middleware)
    const role = (req.user && req.user.role) || res.locals.role || res.locals.userRole;
    if (role === "admin") return next();
  } catch (_) {}
  return res.status(403).json({ message: "Admins only" });
};
