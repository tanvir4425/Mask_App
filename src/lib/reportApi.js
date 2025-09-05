// src/lib/reportApi.js
import axios from "axios";

export async function submitReport(payload) {
  try {
    const res = await axios.post("/api/reports", payload, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true, // let us read 4xx bodies
    });
    return { status: res.status, data: res.data };
  } catch (e) {
    return {
      status: 0,
      data: { message: e?.message || "Network error" },
    };
  }
}
