// src/new-ui/auth/LoginNew.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api";
import AuthBackdrop from "./AuthBackdrop";

export default function LoginNew() {
  const nav = useNavigate();
  const [form, setForm] = useState({ pseudonym: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { user } = await login(form);
      if (user) {
        localStorage.setItem("user", JSON.stringify(user));
        nav("/new");
      } else setErr("Invalid response from server");
    } catch {
      setErr("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackdrop>
      <div className="rounded-[36px] overflow-hidden shadow-2xl border border-zinc-800 bg-transparent relative text-zinc-100">
        {/* Hero inside card (your original) */}
        <div className="relative h-56">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-sky-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white font-extrabold text-5xl tracking-wide">
              MASK
            </div>
          </div>
        </div>

        {/* Seam overlap strip */}
        <div className="absolute left-4 right-4 top-[184px] h-10 rounded-t-[28px] bg-zinc-900 border-x border-t border-zinc-800" />

        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="relative z-10 -mt-6 mx-auto w-[92%] bg-zinc-900 border border-zinc-800 rounded-[28px] p-8"
        >
          <h1 className="text-2xl font-extrabold mb-6">Log in</h1>

          {err && (
            <div className="mb-4 text-sm text-rose-300 bg-rose-900/40 px-3 py-2 rounded-lg border border-rose-900/50">
              {err}
            </div>
          )}

          <div className="space-y-4">
            <input
              placeholder="Pseudonym"
              value={form.pseudonym}
              onChange={(e) =>
                setForm({ ...form, pseudonym: e.target.value })
              }
              className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              className="w-full px-5 py-3.5 rounded-full bg-zinc-800 border border-zinc-700 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-400/40"
              required
            />
          </div>

          <button
            disabled={loading}
            className="mt-6 w-full rounded-full py-3.5 bg-white text-black font-semibold hover:opacity-90 transition"
          >
            {loading ? "Signing in…" : "SIGN IN"}
          </button>
          <Link
            to="/signup-new"
            className="mt-3 block w-full text-center rounded-full py-3.5 border border-zinc-700 font-semibold hover:bg-zinc-800 transition"
          >
            CREATE ACCOUNT
          </Link>
        </form>
      </div>
    </AuthBackdrop>
  );
}
