// src/new-ui/pages/Settings.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  loadSettings,
  saveSettings,
  clearWellnessRuntime,
  resetLogoutFired,
} from "../utils/wellness";
import {
  getMe,
  uploadAvatar,
  deleteAvatar,
  getMotivationPrefs,
  updateMotivationPrefs,
  changePassword, // <-- added
} from "../api";

/** Reasonable fallbacks in case backend returns an empty allowed set */
const FALLBACK_INTERESTS = [
  "sports","football","reading","writing","coding","startups","photography",
  "travel","music","movies","art","ai","science","history","gaming","fitness",
  "mindfulness","productivity","study","exams","leadership"
];
const FALLBACK_GOALS = [
  "be-a-writer","get-fit","learn-to-code","ace-exams","grow-business",
  "be-more-confident","improve-focus","save-money","learn-language"
];
const FALLBACK_ROLES = ["student","engineer","designer","teacher","freelancer","entrepreneur","athlete","artist","other"];

/** small helpers */
const chip = (on) =>
  "px-3 py-1.5 rounded-xl text-sm " +
  (on ? "bg-sky-600 text-white" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100");
const toggleInArr = (arr = [], val) =>
  arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

export default function Settings() {
  // ---------- account ----------
  const [me, setMe] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  // ---------- motivation (server prefs) ----------
  const [mot, setMot] = useState(null);
  const [allowed, setAllowed] = useState({
    interests: FALLBACK_INTERESTS,
    goals: FALLBACK_GOALS,
    roles: FALLBACK_ROLES,
  });
  const [loadingMot, setLoadingMot] = useState(true);
  const [savingMot, setSavingMot] = useState(false);

  // ---------- wellness (client/local) ----------
  const [s, setS] = useState(() => loadSettings());
  const [savedLocal, setSavedLocal] = useState(false);
  useEffect(() => {
    setSavedLocal(false);
  }, [s]);

  // load me + motivation prefs
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const [user, motData] = await Promise.all([
          getMe().catch(() => null),
          getMotivationPrefs().catch(() => null),
        ]);
        if (stop) return;
        setMe(user);
        if (motData?.prefs) setMot(motData.prefs);
        if (motData?.allowed) {
          setAllowed({
            interests: motData.allowed.interests?.length
              ? motData.allowed.interests
              : FALLBACK_INTERESTS,
            goals: motData.allowed.goals?.length
              ? motData.allowed.goals
              : FALLBACK_GOALS,
            roles: motData.allowed.roles?.length
              ? motData.allowed.roles
              : FALLBACK_ROLES,
          });
        }
      } finally {
        if (!stop) setLoadingMot(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  // ---------- Account actions ----------
  async function onPickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAvatar(file);
      const fresh = await getMe().catch(() => null);
      setMe(fresh || me);
    } finally {
      setUploading(false);
      try {
        e.target.value = "";
      } catch {}
    }
  }
  async function onDeleteAvatar() {
    setUploading(true);
    try {
      await deleteAvatar();
      const fresh = await getMe().catch(() => null);
      setMe(fresh || me);
    } finally {
      setUploading(false);
    }
  }
  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // ---------- Motivation actions ----------
  function motSet(part) {
    setMot((prev) => ({
      ...(prev || {
        enabled: true,
        tone: { inspiration: true, humor: false },
        interests: [],
        goals: [],
      }),
      ...part,
    }));
  }
  function motToggleTone(key) {
    motSet({ tone: { ...(mot?.tone || {}), [key]: !mot?.tone?.[key] } });
  }
  function motToggleArr(field, tag) {
    motSet({ [field]: toggleInArr(mot?.[field] || [], tag) });
  }
  async function saveMotivation() {
    if (!mot) return;
    setSavingMot(true);
    try {
      const payload = {
        enabled: !!mot.enabled,
        tone: {
          inspiration: !!(mot.tone?.inspiration ?? true),
          humor: !!(mot.tone?.humor ?? false),
        },
        interests: Array.isArray(mot.interests) ? mot.interests : [],
        goals: Array.isArray(mot.goals) ? mot.goals : [],
        role: mot.role || "",
      };
      const res = await updateMotivationPrefs(payload);
      if (res?.prefs) setMot(res.prefs);
    } finally {
      setSavingMot(false);
    }
  }

  // ---------- Wellness actions ----------
  const onLocal = (field, value) => setS((prev) => ({ ...prev, [field]: value }));
  const onGoalToggle = (key) =>
    onLocal("goals", { ...(s.goals || {}), [key]: !s.goals?.[key] });
  const saveWellnessLocal = () => {
    saveSettings(s);
    setSavedLocal(true);
    try {
      window.dispatchEvent(new Event("wellness:settingsChanged"));
    } catch {}
  };
  const forceTestReminder = () => {
    try {
      window.dispatchEvent(new Event("wellness:forceShow"));
    } catch {}
  };
  const resetWellness = () => {
    try {
      window.dispatchEvent(new Event("wellness:resetAll"));
    } catch {}
    clearWellnessRuntime();
    resetLogoutFired();
  };

  // ---------- derived ----------
  const roleChips = useMemo(
    () => allowed.roles || FALLBACK_ROLES,
    [allowed.roles]
  );
  const interestChips = useMemo(
    () => allowed.interests || FALLBACK_INTERESTS,
    [allowed.interests]
  );
  const goalChips = useMemo(
    () => allowed.goals || FALLBACK_GOALS,
    [allowed.goals]
  );

  // ---------- Change password (Privacy) ----------
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState({ kind: "", text: "" });

  function pwRuleError(next) {
    if (!next || next.length < 8) return "New password must be at least 8 characters.";
    if (!/[A-Za-z]/.test(next)) return "New password needs at least one letter.";
    if (!/\d/.test(next)) return "New password needs at least one number.";
    return "";
  }
  const nextErr = pwRuleError(pw.next);
  const confirmErr = pw.next && pw.confirm && pw.next !== pw.confirm ? "Passwords do not match." : "";
  const canSavePw =
    pw.current.trim().length > 0 &&
    !nextErr &&
    !confirmErr &&
    !savingPw;

  async function onChangePassword() {
    setPwMsg({ kind: "", text: "" });
    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ kind: "ok", text: "Password updated. You may need to log in again on other devices." });
    } catch (e) {
      setPwMsg({ kind: "err", text: e?.message || "Failed to change password." });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-zinc-950/70 rounded-t-3xl">
        <div className="px-4 py-3">
          <div className="text-xl font-bold">Settings</div>
          <div className="text-sm text-zinc-500">Preferences</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* 1) DAILY MOTIVATION */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-lg font-semibold mb-2">Daily motivation</div>
          <p className="text-xs text-zinc-500 mb-3">
            Pick your interests & goals. You’ll get a short inspiration or light humor (on login and via notifications).
          </p>

          {loadingMot ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : (
            <>
              <label className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={!!mot?.enabled}
                  onChange={(e) => motSet({ enabled: e.target.checked })}
                />
                <span>Enable motivation messages</span>
              </label>

              <div className="mb-3">
                <div className="text-sm font-medium mb-1">Tone</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => motToggleTone("inspiration")}
                    className={chip(!!mot?.tone?.inspiration)}
                  >
                    Inspiration
                  </button>
                  <button
                    type="button"
                    onClick={() => motToggleTone("humor")}
                    className={chip(!!mot?.tone?.humor)}
                  >
                    Light humor
                  </button>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-sm font-medium mb-1">Interests</div>
                <div className="flex flex-wrap gap-2">
                  {interestChips.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      className={chip(mot?.interests?.includes(tag))}
                      onClick={() => motToggleArr("interests", tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <div className="text-sm font-medium mb-1">Aspirations / goals</div>
                <div className="flex flex-wrap gap-2">
                  {goalChips.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      className={chip(mot?.goals?.includes(tag))}
                      onClick={() => motToggleArr("goals", tag)}
                    >
                      {tag.replace(/-/g, " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm font-medium mb-1">Your role</div>
                <div className="flex flex-wrap gap-2">
                  {roleChips.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      className={chip((mot?.role || "") === tag)}
                      onClick={() => motSet({ role: (mot?.role || "") === tag ? "" : tag })}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveMotivation}
                  disabled={savingMot}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm"
                >
                  {savingMot ? "Saving…" : "Save motivation"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* 2) WELLNESS REMINDERS */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-lg font-semibold mb-2">Wellness reminders</div>
          <p className="text-xs text-zinc-500 mb-3">
            Two nudges, then a warning, then auto-logout if you keep scrolling. Test mode runs the full flow in ~60s.
          </p>

          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={!!s.enabled}
              onChange={(e) => onLocal("enabled", e.target.checked)}
            />
            <span>Enable wellness reminders on this device</span>
          </label>

          <div className="mb-3">
            <div className="text-sm font-medium mb-1">Focus areas</div>
            <div className="flex flex-wrap gap-2">
              {["stretch","eyes","hydrate","breathe"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={chip(!!s.goals?.[k])}
                  onClick={() => onGoalToggle(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={!!s.useTestTimings}
              onChange={(e) => onLocal("useTestTimings", e.target.checked)}
            />
            <span>Enable 1-minute demo timings (10s, 30s, 45s, 60s)</span>
          </label>

          {/* Testing tools */}
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="text-sm font-medium mb-2">Testing tools</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={forceTestReminder}
                className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm"
              >
                Force test reminder
              </button>
              <button
                type="button"
                onClick={resetWellness}
                className="px-3 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-sm"
              >
                Reset countdowns
              </button>
              <button
                type="button"
                onClick={saveWellnessLocal}
                className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm"
              >
                Save wellness
              </button>
              {savedLocal && (
                <span className="text-xs text-zinc-500">Saved.</span>
              )}
            </div>
            <div className="text-[11px] text-zinc-500 mt-2">
              Test mode uses: reminders at 10s & 30s, warning at 45s (with 60s auto-logout).
            </div>
          </div>
        </section>

        {/* 3) ACCOUNT (avatar + theme) */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-lg font-semibold mb-3">Account</div>
          {!me ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden">
                {me.avatarURL ? (
                  <img
                    src={me.avatarURL}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {me.pseudonym || me.username || me.name || "You"}
                </div>
                {me.email ? (
                  <div className="text-xs text-zinc-500 truncate">{me.email}</div>
                ) : null}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <label className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAvatar}
                  />
                  {uploading ? "Uploading…" : "Change photo"}
                </label>
                {me.avatarURL && (
                  <button
                    onClick={onDeleteAvatar}
                    className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm"
                    type="button"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={toggleTheme}
                  className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-sm"
                  type="button"
                >
                  {isDark ? "Light theme" : "Dark theme"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 4) PRIVACY (Change password) */}
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="text-lg font-semibold mb-2">Privacy</div>

          {/* Change password card */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <div className="text-sm font-medium mb-2">Change password</div>

            {pwMsg.text ? (
              <div
                className={
                  "mb-3 text-sm rounded-md px-3 py-2 " +
                  (pwMsg.kind === "ok"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300")
                }
              >
                {pwMsg.text}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 max-w-md">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Current password
                </label>
                <input
                  type="password"
                  value={pw.current}
                  onChange={(e) =>
                    setPw((p) => ({ ...p, current: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                  placeholder="Current password"
                  autoComplete="current-password"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  New password
                </label>
                <input
                  type="password"
                  value={pw.next}
                  onChange={(e) =>
                    setPw((p) => ({ ...p, next: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                  placeholder="At least 8 characters, 1 letter & 1 number"
                  autoComplete="new-password"
                />
                {nextErr ? (
                  <div className="mt-1 text-xs text-rose-500">{nextErr}</div>
                ) : null}
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={pw.confirm}
                  onChange={(e) =>
                    setPw((p) => ({ ...p, confirm: e.target.value }))
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                {confirmErr ? (
                  <div className="mt-1 text-xs text-rose-500">{confirmErr}</div>
                ) : null}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={onChangePassword}
                  disabled={!canSavePw}
                  className={
                    "px-4 py-2 rounded-xl text-white text-sm " +
                    (canSavePw
                      ? "bg-sky-600 hover:bg-sky-700"
                      : "bg-sky-300 cursor-not-allowed")
                  }
                >
                  {savingPw ? "Updating…" : "Update password"}
                </button>
              </div>
            </div>
          </div>

          {/* You can add additional privacy controls here later */}
        </section>
      </div>
    </>
  );
}
