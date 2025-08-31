// src/new-ui/auth/SignupNew.jsx
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthBackdrop from "./AuthBackdrop";
import api from "../api"; // ✅ reuse axios with withCredentials

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupNew() {
  const nav = useNavigate();
  const [form, setForm] = useState({ pseudonym: "", email: "", password: "" });

  // OTP state
  const [code, setCode] = useState("");
  const [codePhase, setCodePhase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const normalizedEmail = useMemo(
    () => String(form.email || "").trim().toLowerCase(),
    [form.email]
  );

  async function requestSignupCode() {
    if (!EMAIL_RX.test(normalizedEmail)) throw new Error("Valid email required");
    const resp = await api.post(`/request-signup-code`, { email: normalizedEmail }, {
      headers: { "Content-Type": "application/json" },
    });
    return resp.data || {};
  }

  async function completeSignup() {
    const resp = await api.post(`/signup`, {
      email: normalizedEmail,
      pseudonym: form.pseudonym,
      password: form.password,
      code: code.trim(),
    }, {
      headers: { "Content-Type": "application/json" },
    });
    return resp.data || {};
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(""); setInfo("");
    setLoading(true);
    try {
      if (!codePhase) {
        const r = await requestSignupCode();
        setCodePhase(true);
        setInfo(r.throttled ? "A code was sent recently. Check your inbox." : "Code sent. Check your inbox.");
      } else {
        if (!/^\d{6}$/.test(code.trim())) throw new Error("Enter the 6-digit code");
        const { user } = await completeSignup();
        if (!user) throw new Error("Signup failed");
        localStorage.setItem("user", JSON.stringify(user));
        nav("/login-new");
      }
    } catch (e2) {
      setErr(e2?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackdrop>
      <div className="rounded-[36px] overflow-hidden shadow-2xl border border-zinc-800 bg-transparent relative text-zinc-100">
        {/* Hero inside card */}
        <div className="relative h-56">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-sky-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white font-extrabold text-5xl tracking-wide">MASK</div>
          </div>
        </div>

        {/* Seam overlap strip */}
        <div className="absolute left-4 right-4 top-[184px] h-10 rounded-t-[28px] bg-zinc-900 border-x border-t border-zinc-800" />

        {/* Form card */}
        <form onSubmit={onSubmit} className="relative z-10 -mt-6 mx-auto w-[92%] bg-zinc-900 border border-zinc-800 rounded-[28px] p-8">
          <h1 className="text-2xl font-extrabold mb-6">Sign up</h1>

          {err && (
            <div className="mb-4 text-sm text-rose-300 bg-rose-900/40 px-3 py-2 rounded-lg border border-rose-900/50">
              {err}
            </div>
          )}
          {info && !err && (
            <div className="mb-4 text-sm text-emerald-300 bg-emerald-900/30 px-3 py-2 rounded-lg border border-emerald-900/40">
              {info}
            </div>
          )}

          <div className="space-y-4">
            <input
              placeholder="Pseudonym"
              value={form.pseudonym}
              onChange={(e) => setForm({ ...form, pseudonym: e.target.value })}
              className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
              required
            />
            {codePhase && (
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Verification code (6 digits)"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, "").slice(0, 6))}
                className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
                required
              />
            )}
          </div>

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full py-3.5 bg-white text-black font-semibold hover:opacity-90 transition"
          >
            {loading ? (codePhase ? "Creating…" : "Sending code…") : (codePhase ? "CREATE ACCOUNT" : "CREATE ACCOUNT")}
          </button>
          <Link
            to="/login-new"
            className="mt-3 block w-full text-center rounded-full py-3.5 border border-zinc-700 font-semibold hover:bg-zinc-800 transition"
          >
            LOG IN
          </Link>
        </form>
      </div>
    </AuthBackdrop>
  );
}
