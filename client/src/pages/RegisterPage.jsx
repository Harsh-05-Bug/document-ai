import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth.api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { PENDING_INVITE_KEY } from "./JoinPage.jsx";

export default function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", workspaceName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Arrived from an invite link: they're joining a workspace, not
  // making one, so don't ask them to name anything.
  const pendingInvite = (() => {
    try { return sessionStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
  })();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = pendingInvite ? { ...form, workspaceName: "" } : form;
      const { token, user, workspace } = await register(payload);
      signIn(token, user, [workspace]);
      navigate(pendingInvite ? `/join/${pendingInvite}` : "/documents", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create an account</h1>
        <p className="notice">
          {pendingInvite
            ? "Sign up and we'll take you straight into the workspace you were invited to."
            : "You'll get a workspace of your own — a shared space for a class, a team or a group of friends. Invite people to it once you're in."}
        </p>

        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

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
            autoComplete="new-password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <p className="notice" style={{ margin: "4px 0 0", fontSize: 12 }}>
            At least 8 characters.
          </p>
        </div>

        {!pendingInvite && (
          <div className="field">
            <label htmlFor="workspaceName">Workspace name</label>
            <input
              id="workspaceName"
              placeholder="Physics 101"
              value={form.workspaceName}
              onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
            />
            <p className="notice" style={{ margin: "4px 0 0", fontSize: 12 }}>
              Optional — we'll name one after you if you leave it blank.
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>

        {busy && (
          <p className="notice" style={{ marginTop: 12, fontSize: 13 }}>
            This demo runs on free hosting and sleeps when idle. If it's been
            quiet, creating your account can take up to a minute.
          </p>
        )}

        <p className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}