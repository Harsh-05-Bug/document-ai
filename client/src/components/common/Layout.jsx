import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import WorkspaceSwitch from "./WorkspaceSwitch.jsx";
import ThemeSwitch from "./ThemeSwitch.jsx";

export default function Layout() {
  const { user, workspace, workspaceId, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // The workspace list decides what every page can request, so wait for
  // it rather than firing requests with no workspace id.
  if (loading) return <p className="empty">Loading…</p>;

  if (!workspaceId) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>No workspace yet</h1>
          <p className="notice">
            You need a workspace before you can upload anything. Create one, or
            ask someone to send you an invite link.
          </p>
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">
          Knowledge Base
          <span>{workspace?.name}</span>
        </div>

        <WorkspaceSwitch />

        <nav>
          <NavLink to="/ask">Ask</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/dashboard">Activity</NavLink>
          <NavLink to="/members">People</NavLink>
        </nav>

        <div className="who">
          <strong>{user?.name || user?.email}</strong>
          {workspace?.role}
          <div>
            <button className="quiet" onClick={() => { signOut(); navigate("/login"); }}>
              Sign out
            </button>
          </div>
        </div>

        <ThemeSwitch />
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}