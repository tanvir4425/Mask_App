import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRouteNew({ children }) {
  const loc = useLocation();
  const [status, setStatus] = useState("checking"); // 'checking' | 'ok' | 'nope'

  useEffect(() => {
    let cancelled = false;

    // 1) If we already have a user in localStorage, allow immediately
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      if (user && user._id) {
        if (!cancelled) setStatus("ok");
        return;
      }
    } catch {}

    // 2) Otherwise, try to hydrate from cookie by calling /users/me
    (async () => {
      try {
        const res = await fetch("/api/users/me", {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setStatus("nope");
          return;
        }
        const me = await res.json();
        try {
          localStorage.setItem("user", JSON.stringify(me));
        } catch {}
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("nope");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    // simple inline loader (keeps layout stable)
    return (
      <div className="w-full flex items-center justify-center py-12 text-sm text-zinc-500">
        Checking session…
      </div>
    );
  }

  if (status === "nope") {
    return <Navigate to="/login-new" state={{ from: loc }} replace />;
  }

  return children;
}
