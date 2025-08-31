// src/utils/api.js
import axios from "axios";

// ==========================
// ✅ API Base Configuration
// ==========================
export const API_BASE_URL = "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add Authorization token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken"); // ✅ same key
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==========================
// ✅ API Helper Functions
// ==========================

// GET request (no auth required unless token exists)
export async function fetchData(endpoint) {
  const response = await api.get(`/${endpoint}`);
  return response.data;
}

// POST request (e.g., signup/login)
export async function postData(endpoint, data) {
  const response = await api.post(`/${endpoint}`, data);
  return response.data;
}

// PUT request (auth required)
export async function putData(endpoint, data) {
  const response = await api.put(`/${endpoint}`, data);
  return response.data;
}

// DELETE request (auth required)
export async function deleteData(endpoint) {
  const response = await api.delete(`/${endpoint}`);
  return response.data;
}

export default api;


// import { fetchData, postData } from "../utils/api";
