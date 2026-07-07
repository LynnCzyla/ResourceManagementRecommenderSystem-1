import { supabase } from '../../lib/supabaseClient'; // ⚠️ adjust path if your client lives elsewhere

// ⚠️ adjust to match however you expose the backend URL elsewhere in the app
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/rm`
  : 'http://localhost:5000/api/rm';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session ? `Bearer ${session.access_token}` : '',
  };
}

async function handle(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

// ---- Dashboard ----
export async function fetchDashboard() {
  const res = await fetch(`${API_BASE}/dashboard`, { headers: await authHeaders() });
  return handle(res);
}

// ---- Employee Directory ----
export async function fetchEmployees() {
  const res = await fetch(`${API_BASE}/employees`, { headers: await authHeaders() });
  return handle(res);
}

export async function toggleEmployeeVerified(profileId) {
  const res = await fetch(`${API_BASE}/employees/${profileId}/verify`, {
    method: 'PATCH',
    headers: await authHeaders(),
  });
  return handle(res);
}

export async function assignEmployeeFromDirectory(profileId, { projectId, startDate, role, notes }) {
  const res = await fetch(`${API_BASE}/employees/${profileId}/assign`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ projectId, startDate, role, notes }),
  });
  return handle(res);
}

// ---- Projects ----
export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`, { headers: await authHeaders() });
  return handle(res);
}

export async function assignEmployeeToProject(projectId, { employeeId, role }) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/assign`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ employeeId, role }),
  });
  return handle(res);
}

export async function removeEmployeeFromProject(projectId, employeeId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/assign/${employeeId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  return handle(res);
}