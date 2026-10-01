const ROLE_ALIASES = {
  'Super Admin': 'Super Admin',
  'superadmin': 'Super Admin',
  'super_admin': 'Super Admin',
  Admin: 'Admin',
  admin: 'Admin',
  'Human Resources': 'Human Resources',
  'Human Resource': 'Human Resources',
  HR: 'Human Resources',
  hr: 'Human Resources',
  'Resource Manager': 'Resource Manager',
  RM: 'Resource Manager',
  rm: 'Resource Manager',
  'Project Manager': 'Project Manager',
  PM: 'Project Manager',
  pm: 'Project Manager',
  Employee: 'Employee',
  EMP: 'Employee',
  emp: 'Employee',
  employee: 'Employee',
};

function requireRole(allowedRoles) {
  const targetRoles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map(role => ROLE_ALIASES[role] || role);

  return (req, res, next) => {
    const rawRole = req.user?.role;
    const userRole = ROLE_ALIASES[rawRole] || rawRole;

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this role'
      });
    }

    // Super Admin has top-level authority across the entire system
    if (userRole === 'Super Admin' || req.user?.is_super_admin) {
      return next();
    }

    // If endpoint allows Admin, and user is an Admin
    if (targetRoles.includes('Admin') && (userRole === 'Admin' || req.user?.is_admin)) {
      return next();
    }

    // Direct role match
    if (targetRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied for this role'
    });
  };
}

module.exports = { requireRole, ROLE_ALIASES };