import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

// same user source your app already uses elsewhere
function getLocalUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Usage (React Router v6+):
 * <Route element={<ProtectedRoute />}>
 *   <Route path="/" element={<Home />} />
 *   ...
 * </Route>
 */
export default function ProtectedRoute({ children, redirect = "/login-new" }) {
  const user = getLocalUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to={redirect} replace state={{ from: location }} />;
  }
  // Works for both wrapped children and nested routes
  return children || <Outlet />;
}
