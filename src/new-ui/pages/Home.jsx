// src/new-ui/pages/Home.jsx
import React from "react";
import { ThemeProvider } from "../ThemeProvider";
import LeftNav from "../components/LeftNav";
import RightRail from "../RightRail";

// ⬇️ keep all your current imports for Home feed logic (getPosts, PostCard, etc.)

export default function HomePage() {
  // ⬇️ keep all your current state/effects for loading the feed

  return (
    <ThemeProvider>
      <div
        className="min-h-screen text-zinc-900 dark:text-zinc-100"
        style={{ background: "var(--mask-app-bg)", backgroundAttachment: "fixed" }}
      >
        {/* Same layout as Explore/others */}
        <div className="max-w-[1280px] mx-auto flex gap-6 px-3 sm:px-0">
          <LeftNav />

          {/* ⬇️ put your existing Home <main> markup here (unchanged).
              Just ensure the outer <main> has the same borders so the
              left column visually separates from the feed */}
          <main className="flex-1 min-w-0 border-l border-r border-zinc-200 dark:border-zinc-800">
            {/* ----- your existing Home header + composer + feed list ----- */}
            {/* (No changes to your actual feed content) */}
          </main>

          <RightRail />
        </div>
      </div>
    </ThemeProvider>
  );
}
