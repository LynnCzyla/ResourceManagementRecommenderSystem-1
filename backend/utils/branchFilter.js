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
  
  module.exports = {
    applyBranchFilter,
    hasBranchAccess,
    getBranchFilter
  };