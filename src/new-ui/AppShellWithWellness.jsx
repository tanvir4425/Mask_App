// src/new-ui/AppShellWithWellness.jsx
import React from "react";
import AppShell from "./AppShell";
import WellnessManager from "./components/WellnessManager";

export default function AppShellWithWellness() {
  return (
    <>
      <AppShell />
      <WellnessManager />
    </>
  );
}
