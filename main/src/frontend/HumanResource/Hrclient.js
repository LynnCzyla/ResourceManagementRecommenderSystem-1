// D:\ResourceManagementRecommenderSystem\main\src\frontend\HumanResource\Hrclient.js

import axios from 'axios';

const TOKEN_KEYS = ['token', 'authToken', 'accessToken', 'access_token'];
const USER_KEY = 'user';

function getStoredToken() {
  // 1) Direct token keys
  for (const key of TOKEN_KEYS) {
    const val = localStorage.getItem(key);
    if (val) return val;
  }

  // 2) Fallback: token nested inside a stored user/session object
  try {
    const rawUser = localStorage.getItem(USER_KEY);
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.token) return parsed.token;
      if (parsed?.access_token) return parsed.access_token;
      if (parsed?.session?.access_token) return parsed.session.access_token;
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

function clearSessionAndRedirect() {
  TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('loginTime');
  window.location.href = '/login';
}

const hrClient = axios.create({
  baseURL: 'http://localhost:5000/api/hr',
});

hrClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn('hrClient: no auth token found in localStorage — request will likely 401:', config.url);
  }
  return config;
});

hrClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('hrClient: 401 Unauthorized — session invalid or expired. Redirecting to login.');
      clearSessionAndRedirect();
    }
    return Promise.reject(error);
  }
);

export default hrClient;