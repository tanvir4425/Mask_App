// src/new-ui/AppShell.jsx
import React from "react";
import { Outlet } from "react-router-dom";

// default imports (your files should export default components)
import LeftNavMod from "./components/LeftNav";
import RightRailMod from "./RightRail";

// Guard: is this something React can render? (function, memo, or forwardRef)
function isRenderable(Comp) {
  if (!Comp) return false;
  if (typeof Comp === "function") return true;            // normal component
  const t = Comp && Comp.$$typeof && Comp.$$typeof.toString();
  // memo/forwardRef show as Symbol(react.memo) / Symbol(react.forward_ref)
  return t === "Symbol(react.memo)" || t === "Symbol(react.forward_ref)";
}

// Tiny dev banner to avoid blank screen if one side is wrong
function Fallback({ name }) {
  return (
    <div className="m-2 rounded-md border border-amber-300 bg-amber-50 text-amber-700 px-3 py-2 text-sm">
      {name} failed to load. Make sure <code>{name}.jsx</code> does
      <code> export default function {name}() {{}} </code> (or a memo/forwardRef of it).
    </div>
  );
}

// If you have a fixed header, put its height in px here (e.g., 64). If not, keep 0.
const HEADER_H = 0;

export default function AppShell() {
  const LeftNav = isRenderable(LeftNavMod) ? LeftNavMod : null;
  const RightRail = isRenderable(RightRailMod) ? RightRailMod : null;

  return (
    <div className="min-h-screen">
      {/* only needed if you actually have a fixed header */}
      <div style={{ paddingTop: HEADER_H }}>
        {/* Wider center, sidebars pushed out, more breathing room */}
        <div className="grid max-w-[1500px] mx-auto px-4 gap-x-6 grid-cols-[260px,minmax(780px,1fr),320px]">
          {/* LEFT — sticky; move overflow to inner wrapper to avoid clipping */}
          <aside
            className="sticky self-start"
            style={{ top: HEADER_H, maxHeight: `calc(100vh - ${HEADER_H}px)` }}
          >
            <div className="pr-2 overflow-y-auto max-h-[inherit]">
              {LeftNav ? <LeftNav /> : <Fallback name="LeftNav" />}
            </div>
          </aside>

          {/* CENTER — the ONLY scroll container */}
          <main
            className="border-l border-r"
            style={{ height: `calc(100vh - ${HEADER_H}px)`, overflowY: "auto" }}
          >
            {/* If a child page throws, show a friendly message instead of white screen */}
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>

          {/* RIGHT — sticky; move overflow to inner wrapper to avoid clipping */}
          <aside
            className="sticky self-start"
            style={{ top: HEADER_H, maxHeight: `calc(100vh - ${HEADER_H}px)` }}
          >
            <div className="pl-2 overflow-y-auto max-h-[inherit]">
              {RightRail ? <RightRail /> : <Fallback name="RightRail" />}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------- tiny error boundary so a child crash never blanks the page ---------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err){ return { err }; }
  componentDidCatch(err, info){ console.error("Center column error:", err, info); }
  render(){
    if (this.state.err) {
      return (
        <div className="m-4 p-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-700">
          Something went wrong loading this section. Check the console for details.
        </div>
      );
    }
    return this.props.children;
  }
}
