// main/src/frontend/ResourceManager/Rmapi.js
import { supabase } from '../../lib/supabaseClient';

// Use consistent API base URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/rm`
  : 'http://localhost:5000/api/rm';

// Debug logging
console.log('🔧 RM API Base URL:', API_BASE);

async function authHeaders() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('❌ Error getting session:', error);
      return {
        'Content-Type': 'application/json',
        Authorization: '',
      };
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: session ? `Bearer ${session.access_token}` : '',
    };

    console.log('🔑 Auth headers:', headers.Authorization ? 'Token present' : 'No token');
    return headers;
  } catch (error) {
    console.error('❌ Auth headers error:', error);
    return {
      'Content-Type': 'application/json',
      Authorization: '',
    };
  }
}

export const fetchEmployeeDetails = async (employeeId) => {
  try {
    const token = localStorage.getItem('token');
    console.log(`🔍 Fetching details for employee: ${employeeId}`);
    
    const response = await fetch(`http://localhost:5000/api/rm/employees/${employeeId}/details`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response:', errorData);
      throw new Error(errorData.error || 'Failed to fetch employee details');
    }
    
    const data = await response.json();
    console.log('✅ Employee details fetched:', data.data);
    return data.data;
  } catch (error) {
    console.error('❌ Error fetching employee details:', error);
    throw error;
  }
};

async function handle(res) {
  try {
    const body = await res.json().catch(() => ({}));
    console.log(`📥 Response ${res.status}:`, body);

    if (!res.ok || body.success === false) {
      throw new Error(body.error || body.message || `Request failed (${res.status})`);
    }
    return body;
  } catch (error) {
    console.error('❌ Response handling error:', error);
    throw error;
  }
}

// ---- Dashboard ----
export async function fetchDashboard() {
  console.log('📊 Fetching dashboard...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/dashboard`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Dashboard fetch error:', error);
    throw error;
  }
}

// ---- Employee Directory ----
export async function fetchEmployees() {
  console.log('👥 Fetching employees...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/employees`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Employees fetch error:', error);
    throw error;
  }
}

export async function toggleEmployeeVerified(profileId) {
  console.log(`🔄 Toggling verification for employee ${profileId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/employees/${profileId}/verify`, {
      method: 'PATCH',
      headers,
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Toggle verification error:', error);
    throw error;
  }
}

export async function assignEmployeeFromDirectory(profileId, { projectId, startDate, role, notes }) {
  console.log(`📋 Assigning employee ${profileId} to project ${projectId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/employees/${profileId}/assign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId, startDate, role, notes }),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Assignment error:', error);
    throw error;
  }
}

// ---- Projects ----
export async function fetchProjects() {
  console.log('📋 Fetching projects...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/projects`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Projects fetch error:', error);
    throw error;
  }
}

export async function assignEmployeeToProject(projectId, { employeeId, role }) {
  console.log(`📋 Assigning employee ${employeeId} to project ${projectId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/projects/${projectId}/assign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ employeeId, role }),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Assignment error:', error);
    throw error;
  }
}

export async function removeEmployeeFromProject(projectId, employeeId) {
  console.log(`🗑️ Removing employee ${employeeId} from project ${projectId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/projects/${projectId}/assign/${employeeId}`, {
      method: 'DELETE',
      headers,
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Remove assignment error:', error);
    throw error;
  }
}

// ---- Requirements ----
export async function fetchRequirements() {
  console.log('📋 Fetching requirements...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/requirements`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Requirements fetch error:', error);
    throw error;
  }
}

// ---- Assignments ----
export async function fetchAssignments() {
  console.log('📋 Fetching assignments...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/assignments`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Assignments fetch error:', error);
    throw error;
  }
}

// ---- Recommendations ----
export async function fetchRecommendations(requirementId) {
  console.log(`📋 Fetching recommendations for requirement ${requirementId}...`);
  try {
    const headers = await authHeaders();

    console.log(`📋 Calling: ${API_BASE}/recommendations/${requirementId}`);
    const res = await fetch(
      `${API_BASE}/recommendations/${requirementId}`,
      { headers }
    );

    if (!res.ok) {
      console.error(`❌ Recommendations fetch failed: ${res.status}`);

      if (res.status === 404) {
        console.warn('⚠️ Recommendation endpoint returned 404. Trying alternative...');
        return await fetchRecommendationsAlternative(requirementId, headers);
      }

      throw new Error(`Failed to fetch recommendations: ${res.status}`);
    }

    const data = await res.json();
    console.log('📋 Recommendations data received:', data);

    const candidates = data.data?.recommended ||
                      data.data?.candidates ||
                      data.candidates ||
                      [];

    console.log(`✅ Found ${candidates.length} candidates`);

    return {
      success: true,
      data: {
        recommended: candidates,
        all: candidates,
        totalCandidates: data.data?.totalCandidates || candidates.length,
        requiredSkills: data.data?.requiredSkills || []
      }
    };
  } catch (error) {
    console.error('❌ Recommendations fetch error:', error);
    return {
      success: false,
      data: { recommended: [], all: [] },
      error: error.message
    };
  }
}

// ✅ FIXED: Alternative method with correct endpoint
async function fetchRecommendationsAlternative(requirementId, headers) {
  console.log(`📋 Trying alternative: Get requirement ${requirementId} first...`);

  try {
    // First, get the requirement to find the project_id
    const reqRes = await fetch(`${API_BASE}/requirements/${requirementId}`, { headers });

    if (!reqRes.ok) {
      throw new Error(`Failed to fetch requirement: ${reqRes.status}`);
    }

    const requirementData = await reqRes.json();
    console.log('📋 Requirement data:', requirementData);

    // Handle different response formats
    const projectId = requirementData.project_id || 
                     requirementData.data?.project_id || 
                     requirementData.requirement?.project_id;
    
    if (!projectId) {
      throw new Error('No project_id found in requirement');
    }

    console.log(`📋 Found project ${projectId} for requirement ${requirementId}`);

    // ✅ FIXED: Correct endpoint for project recommendations
    const projectRes = await fetch(
      `${API_BASE}/recommendations/projects/${projectId}?minMatchingScore=0&maxCandidates=20`,
      { headers }
    );

    if (!projectRes.ok) {
      throw new Error(`Failed to fetch project recommendations: ${projectRes.status}`);
    }

    const data = await projectRes.json();
    console.log('📋 Project recommendations received:', data);

    const candidates = data.data?.recommended ||
                      data.data?.candidates ||
                      data.candidates ||
                      [];

    return {
      success: true,
      data: {
        recommended: candidates,
        all: candidates,
        totalCandidates: data.data?.totalCandidates || candidates.length,
        requiredSkills: data.data?.requiredSkills || []
      }
    };
  } catch (error) {
    console.error('❌ Alternative method failed:', error);
    throw error;
  }
}

// ✅ FIXED: Employee Performance endpoint
export async function fetchEmployeePerformance(profileId) {
  console.log(`📊 Fetching performance for employee ${profileId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/recommendations/employees/${profileId}/performance`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Performance fetch error:', error);
    throw error;
  }
}

// ✅ NEW: Employee Workload endpoint
export async function fetchEmployeeWorkload(profileId) {
  console.log(`📊 Fetching workload for employee ${profileId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/recommendations/employees/${profileId}/workload`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Workload fetch error:', error);
    throw error;
  }
}

// ✅ FIXED: Assign employee to project
export async function assignEmployeeToProjectRM(projectId, { profileId, taskTitle, priority, dueDate }) {
  console.log(`📋 Assigning employee ${profileId} to project ${projectId}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/recommendations/projects/${projectId}/assign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        profileId, 
        taskTitle, 
        priority, 
        dueDate 
      }),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Assignment error:', error);
    throw error;
  }
}

// ---- Create Assignment ----
export async function createAssignment(data) {
  console.log('📋 Creating assignment...', data);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/assignments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Create assignment error:', error);
    throw error;
  }
}

// ---- Update Requirement Status ----
export async function updateRequirementStatus(id, status) {
  console.log(`📋 Updating requirement ${id} to ${status}...`);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/requirements/${id}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status }),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Update requirement status error:', error);
    throw error;
  }
}

// ---- HR Resource Requests (submitted by this RM) ----
export async function fetchResourceRequests() {
  console.log('📋 Fetching HR resource requests...');
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/resource-requests`, { headers });
    return handle(res);
  } catch (error) {
    console.error('❌ Resource requests fetch error:', error);
    throw error;
  }
}

export async function createResourceRequest(payload) {
  console.log('📋 Creating HR resource request...', payload);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/resource-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return handle(res);
  } catch (error) {
    console.error('❌ Create resource request error:', error);
    throw error;
  }
}

// Default export for easy importing
export default {
  fetchDashboard,
  fetchEmployees,
  toggleEmployeeVerified,
  assignEmployeeFromDirectory,
  fetchProjects,
  assignEmployeeToProject,
  removeEmployeeFromProject,
  fetchRequirements,
  fetchAssignments,
  fetchRecommendations,
  fetchEmployeePerformance,
  fetchEmployeeWorkload,
  assignEmployeeToProjectRM,
  createAssignment,
  updateRequirementStatus,
  fetchResourceRequests,
  createResourceRequest,
};