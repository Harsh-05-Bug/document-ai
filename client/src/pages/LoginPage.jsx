import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth.api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { PENDING_INVITE_KEY } from "./JoinPage.jsx";

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingInvite = (() => {
    try { return sessionStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
  })();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user, workspaces } = await login(form.email, form.password);
      signIn(token, user, workspaces);
      navigate(pendingInvite ? `/join/${pendingInvite}` : "/ask", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="notice">
          {pendingInvite
            ? "Sign in and we'll take you to the workspace you were invited to."
            : "Ask questions about your group's documents."}
        </p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}