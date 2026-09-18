const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('darukaa_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'Something went wrong');
  return body;
}

export function setToken(token) {
  localStorage.setItem('darukaa_token', token);
}

export function clearToken() {
  localStorage.removeItem('darukaa_token');
}
