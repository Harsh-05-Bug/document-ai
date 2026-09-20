import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/auth.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user } = await login(form.email, form.password);
      signIn(token, user);
      navigate(location.state?.from?.pathname || "/ask", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Knowledge Base</h1>
        <p className="notice">Search and ask questions across your company's documents.</p>

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="email"
                 value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password"
                 value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
