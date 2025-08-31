// src/new-ui/auth/AuthBackdrop.jsx
import React from "react";

/**
 * Bold night-sky backdrop:
 * - Deep teal base gradient
 * - Warm amber glow (top-left)
 * - Cool cyan glow (top-right)
 * - Soft vignette
 * - Starfield (two layers)
 *
 * Pure CSS, no images.
 */
export default function AuthBackdrop({ children }) {
  return (
    <div
      className="relative min-h-screen w-full overflow-hidden flex items-center justify-center p-6"
      style={{
        // Deeper base so the glows pop more
        background:
          "radial-gradient(1200px 600px at 60% -10%, #0c1821 0%, #0a141d 40%, #091017 70%)",
      }}
    >
      {/* WARM GLOW — bigger + stronger */}
      <div
        className="pointer-events-none absolute -top-[28rem] -left-[28rem] w-[120rem] h-[120rem] rounded-full blur-[100px] opacity-80"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,188,120,0.55), rgba(255,188,120,0.18) 55%, transparent 70%)",
        }}
      />

      {/* COOL CYAN GLOW — bigger + stronger */}
      <div
        className="pointer-events-none absolute -top-[32rem] -right-[32rem] w-[125rem] h-[125rem] rounded-full blur-[120px] opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,212,255,0.40), rgba(0,212,255,0.14) 55%, transparent 70%)",
        }}
      />

      {/* Slight center deepening so the card sits on a “stage” */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 50% 60%, rgba(0,0,0,0.35), transparent 70%)",
        }}
      />

      {/* VIGNETTE to frame the composition */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: "inset 0 0 220px 80px rgba(0,0,0,0.55)",
        }}
      />

      {/* STARFIELD (two layers) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1.6px)",
          backgroundSize: "40px 40px",
          opacity: 0.10,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.55) 0.8px, transparent 1.4px)",
          backgroundSize: "66px 66px",
          opacity: 0.07,
        }}
      />

      {/* CONTENT */}
      <div className="relative z-10 w-full max-w-xl">{children}</div>
    </div>
  );
}
