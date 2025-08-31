// src/new-ui/utils/goToComposer.js
const APP_HOME = "/app"; // change if your home route is different



export function goToComposer() {
  try {
    const atHome = window.location.pathname.startsWith(APP_HOME);
    const hash = "#composer";

    // If we're not on /app yet, go there with the hash (Composer will auto-focus)
    if (!atHome) {
      window.location.assign(`${APP_HOME}${hash}`);
      return;
    }

    // Already on /app: ensure hash set, scroll center column to top, focus textarea
    if (window.location.hash !== hash) {
      window.location.hash = "composer";
    }

    // Smooth scroll the ONLY scroll container (center <main>) to top
    const main = document.querySelector("main");
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });

    // Focus the composer textarea (Composer already listens to #composer, but this is instant)
    setTimeout(() => {
      const t = document.querySelector("#composer textarea");
      if (t) t.focus();
    }, 0);
  } catch {
    // no-op; never break navigation
  }
}
