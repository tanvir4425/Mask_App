module.exports = function adminGuard(req, res, next) {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};
