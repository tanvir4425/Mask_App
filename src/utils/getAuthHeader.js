// src/utils/getAuthHeader.js
export default function getAuthHeader() {
  // Try a few keys where token might be stored
  const token = localStorage.getItem('authToken') 
              || localStorage.getItem('token') 
              || localStorage.getItem('auth');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
