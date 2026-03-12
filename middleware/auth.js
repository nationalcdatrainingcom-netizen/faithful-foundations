function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

function isDirectorOrAbove(user) {
  return ['super_admin','multi_site_director','center_director'].includes(user.role);
}

function canAccessCenter(user, centerId) {
  if (['super_admin','multi_site_director'].includes(user.role)) return true;
  if (user.role === 'center_director') return user.center_id === centerId;
  return false;
}

module.exports = { requireAuth, requireRole, isDirectorOrAbove, canAccessCenter };
