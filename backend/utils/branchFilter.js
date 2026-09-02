// backend/utils/branchFilter.js

/**
 * Apply branch filtering to a Supabase query based on user role
 * @param {Object} query - Supabase query object
 * @param {Object} user - User object from auth middleware
 * @param {string} branchColumn - Column name for branch_id (default: 'branch_id')
 * @param {string} table - Table name for nested filtering (e.g., 'job_applications')
 * @returns {Object} - Filtered Supabase query
 */
const applyBranchFilter = (query, user, branchColumn = 'branch_id', table = null) => {
  // Super Admin sees all
  if (user?.is_super_admin) {
    return query;
  }
  
  // If no user or no branch, return empty filter
  if (!user?.branch_id) {
    return query;
  }

  // If table is specified, use nested filter
  if (table) {
    return query.eq(`${table}.${branchColumn}`, user.branch_id);
  }

  // Simple branch filter
  return query.eq(branchColumn, user.branch_id);
};

/**
 * Check if user has access to a specific branch
 * @param {Object} user - User object from auth middleware
 * @param {string} branchId - Branch ID to check
 * @returns {boolean} - True if user has access
 */
const hasBranchAccess = (user, branchId) => {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.branch_id === branchId;
};

/**
 * Get branch filter condition for queries
 * @param {Object} user - User object from auth middleware
 * @returns {Object} - Filter condition object
 */
const getBranchFilter = (user) => {
  if (!user) return {};
  if (user.is_super_admin) {
    return {}; // No filter
  }
  return { branch_id: user.branch_id };
};

/**
 * Middleware to filter routes by branch
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @param {string} branchColumn - Column name for branch_id
 * @param {string} table - Table name for nested filtering
 */
const branchFilterMiddleware = (branchColumn = 'branch_id', table = null) => {
  return (req, res, next) => {
    // Store branch filter in request for use in routes
    req.branchFilter = (query) => {
      if (req.user?.is_super_admin) {
        return query;
      }
      if (!req.user?.branch_id) {
        return query;
      }
      if (table) {
        return query.eq(`${table}.${branchColumn}`, req.user.branch_id);
      }
      return query.eq(branchColumn, req.user.branch_id);
    };
    next();
  };
};

/**
 * Get branch ID from request
 * @param {Object} req - Express request object
 * @returns {string|null} - Branch ID or null
 */
const getUserBranchId = (req) => {
  if (req.user?.is_super_admin) return null;
  return req.user?.branch_id || null;
};

/**
 * Check if user has HR, Admin, or Super Admin role
 * @param {Object} user - User object from auth middleware
 * @returns {boolean} - True if user has permission
 */
const hasHrOrAdminRole = (user) => {
  if (!user) return false;
  if (user.is_super_admin) return true;
  const role = user.role?.toLowerCase();
  return role === 'human resources' || role === 'admin';
};

module.exports = {
  applyBranchFilter,
  hasBranchAccess,
  getBranchFilter,
  branchFilterMiddleware,
  getUserBranchId,
  hasHrOrAdminRole
};