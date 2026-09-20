import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "employee", department: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token, user } = await register(form);
      signIn(token, user);
      navigate("/documents", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create an account</h1>
        <p className="notice">
          Role decides what you can reach: employees see their own and shared documents,
          managers also see their department's, admins see everything.
        </p>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={form.name} onChange={update("name")} />
        </div>

        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" value={form.email} onChange={update("email")} />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password"
                 value={form.password} onChange={update("password")} />
        </div>

        <div className="field">
          <label htmlFor="department">Department</label>
          <input id="department" placeholder="Finance" value={form.department} onChange={update("department")} />
        </div>

        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" value={form.role} onChange={update("role")}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Administrator</option>
          </select>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
