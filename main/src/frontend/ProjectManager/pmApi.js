// frontend/src/components/ProjectManager/pmApi.js
//
// Thin fetch wrapper around the backend's Project Manager API
// (backend/routes/ProjectManager/*) plus the shared notifications
// endpoint. Every PM tab imports from here instead of talking to
// mock data or supabase directly.

const PM_BASE = 'http://localhost:5000/api/pm';
const NOTIF_BASE = 'http://localhost:5000/api/notifications';

async function request(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body (e.g. network-level failure) — fall through
  }

  if (!res.ok || (body && body.success === false)) {
    const message = (body && (body.message || body.error)) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body ? body.data : null;
}

const pm = (path, options) => request(PM_BASE, path, options);
const notif = (path, options) => request(NOTIF_BASE, path, options);

// ── Dashboard ───────────────────────────────────────────────────────────
export function getDashboardStats(createdBy) {
  const qs = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : '';
  return pm(`/dashboard${qs}`);
}

// ── Employees ───────────────────────────────────────────────────────────
export function getEmployees(departmentId) {
  const qs = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : '';
  return pm(`/employees${qs}`);
}

// ── Projects ────────────────────────────────────────────────────────────
export function getProjects(createdBy) {
  const qs = createdBy ? `?createdBy=${encodeURIComponent(createdBy)}` : '';
  return pm(`/projects${qs}`);
}

export function getProject(id) {
  return pm(`/projects/${id}`);
}

export function createProject(payload) {
  return pm('/projects', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateProject(id, payload) {
  return pm(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function updateProjectStatus(id, status) {
  return pm(`/projects/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function deleteProject(id) {
  return pm(`/projects/${id}`, { method: 'DELETE' });
}

// ── Resource requests ───────────────────────────────────────────────────
export function getResourceRequests(projectId) {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return pm(`/resource-requests${qs}`);
}

export function createResourceRequest(payload) {
  return pm('/resource-requests', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateResourceRequestStatus(id, status) {
  return pm(`/resource-requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function deleteResourceRequest(id) {
  return pm(`/resource-requests/${id}`, { method: 'DELETE' });
}

// ── Tasks ───────────────────────────────────────────────────────────────
export function getTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.employeeId) params.set('employeeId', filters.employeeId);
  const qs = params.toString();
  return pm(`/tasks${qs ? `?${qs}` : ''}`);
}

export function createTask(payload) {
  return pm('/tasks', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTask(id, payload) {
  return pm(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function logTaskProgress(id, payload) {
  return pm(`/tasks/${id}/progress`, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteTask(id) {
  return pm(`/tasks/${id}`, { method: 'DELETE' });
}

// ── Notifications ───────────────────────────────────────────────────────
export function getNotifications(userId) {
  return notif(`?userId=${encodeURIComponent(userId)}`);
}

export function markAllNotificationsRead(userId) {
  return notif('/mark-all-read', { method: 'PATCH', body: JSON.stringify({ userId }) });
}

export function deleteNotification(id) {
  return notif(`/${id}`, { method: 'DELETE' });
}