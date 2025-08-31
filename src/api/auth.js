// src/api/auth.js
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api', // change if your backend URL is different
});

// Auto attach auth header from localStorage for every request
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('authToken');
  if (token) {
req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// Signup — returns res.data (should be { token, user })
export const signup = async (formData) => {
  try {
    const res = await API.post('/auth/signup', formData);
    return res.data;
  } catch (err) {
    console.error('Signup error:', err.response?.data || err.message);
    // Throw a real Error object with server message if present
    throw new Error(err.response?.data?.message || 'Signup failed');
  }
};

// Login — returns res.data (should be { token, user })
export const login = async (formData) => {
  try {
    const res = await API.post('/auth/login', formData);
    return res.data;
  } catch (err) {
    console.error('Login error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.message || 'Login failed');
  }
};

export { API };
