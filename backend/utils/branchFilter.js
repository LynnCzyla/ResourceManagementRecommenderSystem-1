// backend/utils/branchFilter.js

/**
 * Apply branch filtering to a Supabase query based on user role
 * @param {Object} query - Supabase query object
 * @param {Object} user - User object from auth middleware
 * @param {string} branchColumn - Column name for branch_id (default: 'branch_id')
 * @returns {Object} - Filtered Supabase query
 */
const applyBranchFilter = (query, user, branchColumn = 'branch_id') => {
  // Super Admin sees all
  if (user.is_super_admin) {
      return query;
  }
  
  // Regular admin sees only their branch
  return query.eq(branchColumn, user.branch_id);
};

/**
* Check if user has access to a specific branch
* @param {Object} user - User object from auth middleware
* @param {string} branchId - Branch ID to check
* @returns {boolean} - True if user has access
*/
const hasBranchAccess = (user, branchId) => {
  if (user.is_super_admin) return true;
  return user.branch_id === branchId;
};

/**
* Get branch filter condition for queries
* @param {Object} user - User object from auth middleware
* @returns {Object} - Filter condition object
*/
const getBranchFilter = (user) => {
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
*/
const branchFilterMiddleware = (branchColumn = 'branch_id') => {
  return (req, res, next) => {
      // Store branch filter in request for use in routes
      req.branchFilter = (query) => {
          if (req.user?.is_super_admin) {
              return query;
          }
          return query.eq(branchColumn, req.user?.branch_id);
      };
      next();
  };
};

module.exports = {
  applyBranchFilter,
  hasBranchAccess,
  getBranchFilter,
  branchFilterMiddleware
};