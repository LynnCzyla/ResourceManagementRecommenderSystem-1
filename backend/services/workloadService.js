// backend/services/workloadService.js
const supabase = require('../supabase');

/**
 * Priority Weights per Eq. (2) in Paper:
 * Low = 1, Medium = 2, High = 3
 * PM sets priority when creating/assigning tasks.
 */
const PRIORITY_WEIGHTS = {
  low: 1,
  medium: 2,
  high: 3,
};

const CLOSED_STATUSES = ['Completed', 'Completed-Hidden', 'Archived', 'Cancelled'];

// In-memory cache for fast lookups of computed metrics per employee
const employeeMetricsCache = new Map();

/**
 * Normalizes priority text to weight (Low=1, Medium=2, High=3)
 */
function getPriorityWeight(priority) {
  if (!priority) return 1;
  const key = String(priority).trim().toLowerCase();
  return PRIORITY_WEIGHTS[key] || 1;
}

/**
 * Eq. (2) Workload Score:
 * W = Σ (priority weight of each active task currently assigned to the employee)
 *
 * @param {Array} tasks - Array of active task objects { priority, status }
 * @returns {number} W
 */
function computeWorkloadScore(tasks = []) {
  return tasks.reduce((sum, t) => sum + getPriorityWeight(t.priority), 0);
}

/**
 * Eq. (3) Availability Factor (Sigmoid):
 * A = 1 / (1 + e^(0.4 × (W − 7)))
 *
 * @param {number} W - Workload score
 * @returns {number} Availability factor between 0.0 and 1.0
 */
function computeAvailabilityFactor(W) {
  return 1 / (1 + Math.exp(0.4 * (W - 7)));
}

/**
 * Status Label Mapping based on Availability Factor A:
 * A >= 0.80 -> 'Available' (W <= 3)
 * 0.50 <= A < 0.80 -> 'Limited Availability' (4 <= W <= 7)
 * A < 0.50 -> 'Fully Utilized' (W >= 8)
 *
 * @param {number} A - Availability factor
 * @returns {'Available' | 'Limited Availability' | 'Fully Utilized'}
 */
function toStatusLabel(A) {
  if (A >= 0.80) return 'Available';
  if (A >= 0.50) return 'Limited Availability';
  return 'Fully Utilized';
}

/**
 * Computes Utilization Rate percentage (0-100%) from Workload Score W and Availability Factor A:
 * - W = 0: 0% utilization (fully unallocated)
 * - W > 0: benchmarked against capacity threshold W0 = 7 (sigmoid inflection point in Eq. 3)
 */
function toUtilizationRate(A, status, W = null) {
  if (typeof W === 'number' && !isNaN(W)) {
    if (W <= 0) return 0;
    // W=7 is 100% capacity midpoint; above 7 is fully utilized
    const rate = Math.min(100, Math.max(1, Math.round((W / 7) * 100)));
    return rate;
  }
  if (status === 'Available' && (!A || A >= 0.94)) return 0;
  if (typeof A === 'number' && !isNaN(A)) {
    const availPct = Math.min(100, Math.max(1, Math.round((A / 0.94263) * 100)));
    return Math.max(0, Math.min(100, 100 - availPct));
  }
  return status === 'Available' ? 0 : status === 'Limited Availability' ? 50 : 100;
}

/**
 * Helper to invalidate application-level caches
 */
function invalidateRelatedCaches() {
  try {
    const { clearDashboardCache } = require('../routes/ResourceManager/Dashboard');
    if (typeof clearDashboardCache === 'function') clearDashboardCache();
  } catch (e) {}

  try {
    const { clearEmployeeCache } = require('../routes/ResourceManager/Employees');
    if (typeof clearEmployeeCache === 'function') clearEmployeeCache();
  } catch (e) {}

  try {
    const pmTasks = require('../routes/ProjectManager/tasks');
    if (typeof pmTasks.invalidateTasksCache === 'function') pmTasks.invalidateTasksCache();
  } catch (e) {}
}

/**
 * Returns currently cached workload metrics or safe default based on status
 */
function getWorkloadDetails(profileId, status = 'Available', W = null) {
  if (profileId && employeeMetricsCache.has(profileId)) {
    const cached = employeeMetricsCache.get(profileId);
    return {
      workloadScore: cached.W,
      availabilityFactor: cached.A,
      utilizationRate: cached.utilizationRate,
      workloadStatus: cached.status,
    };
  }

  const score = (typeof W === 'number' && !isNaN(W)) ? W : 0;
  const A = computeAvailabilityFactor(score);
  const computedStatus = toStatusLabel(A);
  const util = toUtilizationRate(A, computedStatus, score);

  return {
    workloadScore: score,
    availabilityFactor: A,
    utilizationRate: util,
    workloadStatus: status || computedStatus,
  };
}

function getUtilizationRate(profileId, status = 'Available', W = null) {
  return getWorkloadDetails(profileId, status, W).utilizationRate;
}

/**
 * Recalculate Workload Score (Eq. 2), Availability Factor (Eq. 3), and Status for an employee.
 * Persists status directly to profiles.availability_status in Supabase.
 *
 * @param {string} profileId - UUID of the employee profile
 * @returns {Promise<Object>}
 */
async function recalculateForEmployee(profileId) {
  if (!profileId) return null;

  try {
    // 1. Fetch active tasks for this employee with their project's status
    const { data: tasks, error: fetchErr } = await supabase
      .from('project_tasks')
      .select('id, priority, status, project_id, projects:project_id(status)')
      .eq('profile_id', profileId)
      .not('status', 'in', `(${CLOSED_STATUSES.map(s => `"${s}"`).join(',')})`);

    if (fetchErr) {
      console.error(`❌ [WorkloadService] Error fetching tasks for ${profileId}:`, fetchErr.message);
      throw fetchErr;
    }

    // Filter to tasks belonging to Active projects (or standalone tasks if no project assigned)
    const activeTasks = (tasks || []).filter(t => !t.projects || t.projects.status === 'Active');

    const W = computeWorkloadScore(activeTasks);
    const A = computeAvailabilityFactor(W);
    const status = toStatusLabel(A);
    const utilizationRate = toUtilizationRate(A, status, W);
    const roundedA = parseFloat(A.toFixed(4));

    // Cache metrics in memory
    employeeMetricsCache.set(profileId, {
      W,
      A: roundedA,
      utilizationRate,
      status,
      timestamp: Date.now()
    });

    // 2. Persist to profiles table
    // Try updating all columns (workload_score, availability_factor, availability_status)
    const fullPayload = {
      availability_status: status,
      workload_score: W,
      availability_factor: roundedA,
      updated_at: new Date().toISOString(),
    };

    let { error: updateErr } = await supabase
      .from('profiles')
      .update(fullPayload)
      .eq('id', profileId);

    // If workload_score or availability_factor columns don't exist yet, fallback to updating availability_status
    if (updateErr && updateErr.code === 'PGRST204') {
      const fallbackResult = await supabase
        .from('profiles')
        .update({
          availability_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);
      updateErr = fallbackResult.error;
    }

    if (updateErr) {
      console.error(`❌ [WorkloadService] Error updating profile ${profileId}:`, updateErr.message);
      throw updateErr;
    }

    console.log(`✅ [WorkloadService] Profile ${profileId} updated: W=${W}, A=${roundedA}, Status=${status}, Util=${utilizationRate}%`);

    invalidateRelatedCaches();

    return {
      profileId,
      W,
      A: roundedA,
      status,
      utilizationRate,
      activeTasksCount: activeTasks.length,
    };
  } catch (err) {
    console.error(`❌ [WorkloadService] recalculateForEmployee failed for ${profileId}:`, err.message);
    throw err;
  }
}

/**
 * Bulk recalculates availability for multiple or all active employees
 *
 * @param {Array<string>|null} profileIds - Optional list of IDs, or null for all active employees
 * @returns {Promise<Array>}
 */
async function recalculateBatch(profileIds = null) {
  let query = supabase
    .from('profiles')
    .select('id, employee_id')
    .eq('status', 'Active')
    .eq('role', 'Employee');

  if (profileIds && profileIds.length > 0) {
    query = query.in('id', profileIds);
  }

  const { data: employees, error } = await query;
  if (error) {
    console.error('❌ [WorkloadService] Failed to load employees for batch:', error);
    throw error;
  }

  console.log(`🔄 [WorkloadService] Recalculating availability for ${employees.length} employees...`);
  const results = [];

  for (const emp of (employees || [])) {
    try {
      const res = await recalculateForEmployee(emp.id);
      if (res) results.push({ employeeId: emp.employee_id, ...res });
    } catch (e) {
      console.error(`⚠️ Skipping failed recalculation for employee ${emp.employee_id}:`, e.message);
    }
  }

  console.log(`✅ [WorkloadService] Batch recalculation complete. Processed ${results.length}/${employees.length} employees.`);
  invalidateRelatedCaches();
  return results;
}

module.exports = {
  PRIORITY_WEIGHTS,
  CLOSED_STATUSES,
  computeWorkloadScore,
  computeAvailabilityFactor,
  toStatusLabel,
  toUtilizationRate,
  getWorkloadDetails,
  getUtilizationRate,
  recalculateForEmployee,
  recalculateBatch,
  invalidateRelatedCaches,
};
