// Minimal, removable debugging utility
export const DEBUG =
  (localStorage.getItem('debug') || process.env.REACT_APP_DEBUG || '').toLowerCase() === 'true';

export function dbg(...args) {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.debug(`[DEBUG ${ts}]`, ...args);
}

export function time(label) {
  if (!DEBUG) return { end() {} };
  const start = performance.now();
  return {
    end(extra) {
      const ms = (performance.now() - start).toFixed(1);
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${label} -> ${ms}ms`, extra || '');
    }
  };
}
