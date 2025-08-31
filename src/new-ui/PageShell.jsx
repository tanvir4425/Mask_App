// src/new-ui/PageShell.jsx
import React from "react";
import LeftNav from "./components/LeftNav";
import RightRail from "./RightRail";
import { ThemeProvider } from "./ThemeProvider";

export default function PageShell({ children }) {
  return (
    <ThemeProvider>
      <div
        className="min-h-screen text-zinc-900 dark:text-zinc-100"
        style={{ background: "var(--mask-app-bg)", backgroundAttachment: "fixed" }}
      >
        {/* One shared wrapper for every page */}
        <div className="max-w-[1440px] mx-auto flex gap-6 px-4">
          {/* Left rail */}
          <aside className="w-[320px] shrink-0 sticky top-3 self-start">
            <LeftNav />
          </aside>

          {/* Center column — fixed, consistent width everywhere */}
          <main className="flex-1 min-w-0 max-w-[780px] border-x border-zinc-200 dark:border-zinc-800">
            {children}
          </main>

          {/* Right rail */}
          <aside className="w-[360px] shrink-0 sticky top-3 self-start">
            <RightRail />
          </aside>
        </div>
      </div>
    </ThemeProvider>
  );
}
