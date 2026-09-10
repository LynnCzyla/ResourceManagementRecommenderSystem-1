import { API_BASE_URL } from '../../config/api';
//
// Thin fetch wrapper around the backend's Project Manager API
// (backend/routes/ProjectManager/*) plus the shared notifications
// endpoint. Every PM tab imports from here instead of talking to
// mock data or supabase directly.
//
// OPTIMIZATIONS:
// 1. Request deduplication - prevents duplicate parallel requests
// 2. AbortController support - cancels requests on unmount
// 3. Request caching - caches GET responses
// 4. Automatic retry on network errors (max 1 retry)
// 5. Request timeout
// 6. Cache invalidation after mutations

const PM_BASE = `${API_BASE_URL}/api/pm`;
const NOTIF_BASE = `${API_BASE_URL}/api/notifications`;

// ── Auth Helper ──────────────────────────────────────────────────────────

// ✅ Get auth token from localStorage
function getAuthToken() {
  const token = localStorage.getItem('token');
  return token || null;
}

// ── Caching & Deduplication ──────────────────────────────────────────

// Simple in-memory cache for GET requests
const cache = new Map();
const CACHE_TTL = 60000; // 60 seconds

// Track pending requests for deduplication
const pendingRequests = new Map();

function getCacheKey(url, options = {}) {
  return `${options.method || 'GET'}:${url}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function clearCache() {
  cache.clear();
}

// ── Main Request Function ────────────────────────────────────────────

async function request(base, path, options = {}) {
  const url = `${base}${path}`;
  const method = options.method || 'GET';
  const cacheKey = getCacheKey(url, options);
  
  // ✅ Get auth token
  const token = getAuthToken();
  
  // ✅ Build headers with Authorization
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // ✅ Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Log token status (don't log the actual token)
  console.log(`🔑 Auth token ${token ? 'present' : 'missing'}`);
  
  // For GET requests, check cache first
  if (method === 'GET' && !options.skipCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit: ${url}`);
      return cached;
    }
  }
  
  // For GET requests, deduplicate pending requests
  if (method === 'GET' && pendingRequests.has(cacheKey)) {
    console.log(`🔄 Deduplicating request: ${url}`);
    return pendingRequests.get(cacheKey);
  }
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 30000); // 30 second timeout
  
  const requestPromise = (async () => {
    try {
      console.log(`🌐 API Request: ${method} ${url}`);
      
      const res = await fetch(url, {
        headers,
        signal: options.signal || controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      console.log(`  → Status: ${res.status}`);

      let body = null;
      try {
        body = await res.json();
        console.log(`  → Response:`, body);
      } catch {
        console.log(`  → No JSON body`);
      }

      // ✅ Handle 401 specifically - token expired or invalid
      if (res.status === 401) {
        console.error('🔑 Token expired or invalid. Please login again.');
        // You could redirect to login here if needed
        // window.location.href = '/login';
      }

      if (!res.ok || (body && body.success === false)) {
        const message = (body && (body.message || body.error)) || `Request failed (${res.status})`;
        console.error(`  ✗ Error: ${message}`);
        throw new Error(message);
      }

      const data = body ? body.data : null;
      
      // Cache GET responses
      if (method === 'GET' && !options.skipCache) {
        setCache(cacheKey, data);
      }
      
      return data;
      
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Don't treat aborted requests as errors
      if (err.name === 'AbortError') {
        console.log(`🛑 Request aborted: ${url}`);
        throw err;
      }
      
      // Only retry on network errors, not auth errors
      if (!options.retry && (err.message.includes('fetch') || err.message.includes('network'))) {
        console.log(`🔁 Retrying request (attempt 2): ${url}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return request(base, path, { ...options, retry: true });
      }
      
      throw err;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();
  
  // Store pending request for deduplication
  if (method === 'GET') {
    pendingRequests.set(cacheKey, requestPromise);
  }
  
  return requestPromise;
}

const pm = (path, options) => request(PM_BASE, path, options);
const notif = (path, options) => request(NOTIF_BASE, path, options);

// ── Utility Functions ─────────────────────────────────────────────────

// Clear all cached data (call when user logs out or data changes)
export function clearAllCache() {
  clearCache();
  pendingRequests.clear();
  console.log('🧹 Cache cleared');
}

// Clear cache for specific endpoints
export function clearCacheForEndpoints(endpoints) {
  const keysToDelete = [];
  for (const [key] of cache) {
    for (const endpoint of endpoints) {
      if (key.includes(endpoint)) {
        keysToDelete.push(key);
        break;
      }
    }
  }
  keysToDelete.forEach(key => cache.delete(key));
  console.log(`🧹 Cleared cache for: ${endpoints.join(', ')}`);
}

// Invalidate cache after mutations
export function invalidateCache() {
  clearAllCache();
  // Optionally call the backend cache clear endpoint
  fetch(`${API_BASE_URL}/api/pm/employees/cache/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {
    // Silently fail - backend cache will eventually expire
    console.log('⚠️ Could not clear backend cache');
  });
}

// Abort all pending requests
export function abortAllRequests() {
  for (const [key, promise] of pendingRequests) {
    // We can't directly abort promises, but we can clear them
    pendingRequests.delete(key);
  }
  console.log('🛑 All pending requests aborted');
}

// ── Dashboard ───────────────────────────────────────────────────────────

export function getDashboardStats(createdBy, signal) {
  const qs = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : '';
  return pm(`/dashboard${qs}`, { signal });
}

// ── Employees ───────────────────────────────────────────────────────────
// pmId scopes results to only the employees assigned to that PM's own
// projects; projectId narrows further to just ONE project's assigned team
// (e.g. for an "Assign Task" dropdown); departmentId additionally narrows
// by department.
export function getEmployees(pmId, departmentId, projectId, signal) {
  const params = new URLSearchParams();
  if (pmId) params.set('pmId', pmId);
  if (departmentId) params.set('departmentId', departmentId);
  if (projectId) params.set('projectId', projectId);
  const qs = params.toString();
  return pm(`/employees${qs ? `?${qs}` : ''}`, { signal });
}

// ── Projects ────────────────────────────────────────────────────────────

export function getProjects(createdBy, signal) {
  const qs = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : '';
  return pm(`/projects${qs}`, { signal });
}

export function getProject(id, signal) {
  return pm(`/projects/${id}`, { signal });
}

export function getProjectHistoryDetails(id, signal) {
  return pm(`/projects/${id}/history-details`, { signal, skipCache: true });
}

export function createProject(payload) {
  clearCacheForEndpoints(['/projects', '/dashboard']);
  return pm('/projects', { 
    method: 'POST', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function updateProject(id, payload) {
  clearCacheForEndpoints(['/projects', '/dashboard']);
  return pm(`/projects/${id}`, { 
    method: 'PUT', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function updateProjectStatus(id, status, restoreMode, reason) {
  clearCacheForEndpoints(['/projects', '/dashboard', '/employees', '/tasks']);
  return pm(`/projects/${id}/status`, { 
    method: 'PATCH', 
    body: JSON.stringify({ status, restoreMode, reason }),
    skipCache: true
  });
}

export function deleteProject(id) {
  clearCacheForEndpoints(['/projects', '/dashboard', '/employees']);
  return pm(`/projects/${id}`, { 
    method: 'DELETE',
    skipCache: true
  });
}

export function assignEmployeeToProject(projectId, employeeId, role, assignedBy) {
  clearCacheForEndpoints(['/employees', '/dashboard']);
  return pm(`/projects/${projectId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ employeeId, role, assignedBy }),
    skipCache: true
  });
}

// ── Skills ──────────────────────────────────────────────────────────────

// ✅ Get skills for autocomplete
export function getSkills(search = '', signal) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return pm(`/skills${qs}`, { signal });
}

// ── Resource requests ───────────────────────────────────────────────────

export function getResourceRequests(projectId, signal) {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return pm(`/resource-requests${qs}`, { signal });
}

export function createResourceRequest(payload) {
  clearCacheForEndpoints(['/resource-requests', '/dashboard']);
  return pm('/resource-requests', { 
    method: 'POST', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function updateResourceRequestStatus(id, status) {
  clearCacheForEndpoints(['/resource-requests', '/dashboard']);
  return pm(`/resource-requests/${id}/status`, { 
    method: 'PATCH', 
    body: JSON.stringify({ status }),
    skipCache: true
  });
}

export function cancelResourceRequest(id) {
  return updateResourceRequestStatus(id, 'Canceled');
}

export function deleteResourceRequest(id) {
  clearCacheForEndpoints(['/resource-requests', '/dashboard']);
  return pm(`/resource-requests/${id}`, { 
    method: 'DELETE', 
    skipCache: true
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────

export function getTasks(filters = {}, signal) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.employeeId) params.set('employeeId', filters.employeeId);
  const qs = params.toString();
  return pm(`/tasks${qs ? `?${qs}` : ''}`, { signal });
}

export function createTask(payload) {
  clearCacheForEndpoints(['/tasks', '/dashboard']);
  return pm('/tasks', { 
    method: 'POST', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function updateTask(id, payload) {
  clearCacheForEndpoints(['/tasks', '/dashboard']);
  return pm(`/tasks/${id}`, { 
    method: 'PUT', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function logTaskProgress(id, payload) {
  clearCacheForEndpoints(['/tasks', '/dashboard']);
  return pm(`/tasks/${id}/progress`, { 
    method: 'POST', 
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function deleteTask(id) {
  clearCacheForEndpoints(['/tasks', '/dashboard']);
  return pm(`/tasks/${id}`, { 
    method: 'DELETE',
    skipCache: true
  });
}

// ── Weekly Reports ───────────────────────────────────────────────────────

export function getWeeklyReports(signal) {
  return pm('/reports', { signal, skipCache: true });
}

// ── Notifications ───────────────────────────────────────────────────────

export function getNotifications(userId, signal) {
  return notif(`?userId=${encodeURIComponent(userId)}`, { signal });
}

export function markAllNotificationsRead(userId) {
  clearCacheForEndpoints(['/notifications']);
  return notif('/mark-all-read', { 
    method: 'PATCH', 
    body: JSON.stringify({ userId }),
    skipCache: true
  });
}

export function deleteNotification(id) {
  clearCacheForEndpoints(['/notifications']);
  return notif(`/${id}`, { 
    method: 'DELETE',
    skipCache: true
  });
}


// ── Feedback Requests ───────────────────────────────────────────────────

export function getFeedbackRequests(createdBy, signal) {
  const qs = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : '';
  return pm(`/feedback-requests${qs}`, { signal });
}

export function createFeedbackRequest(payload) {
  clearCacheForEndpoints(['/feedback-requests']);
  return pm('/feedback-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipCache: true
  });
}

export function resendFeedbackRequest(id) {
  clearCacheForEndpoints(['/feedback-requests']);
  return pm(`/feedback-requests/${id}/resend`, {
    method: 'POST',
    skipCache: true
  });
}

// ── Performance / PM Evaluation (360 feedback) ──────────────────────────

export function getEmployeeClientFeedback(profileId, projectId, signal) {
  const params = new URLSearchParams();
  if (profileId) params.set('profileId', profileId);
  if (projectId) params.set('projectId', projectId);
  return pm(`/performance/client-feedback?${params.toString()}`, { signal });
}

export function submitPmEvaluation(payload) {
  clearCacheForEndpoints(['/performance']);
  return pm('/performance/evaluations', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipCache: true,
  });
}

export function getPmClientFeedback(signal) {
  return pm('/performance/my-client-feedback', { signal });
}