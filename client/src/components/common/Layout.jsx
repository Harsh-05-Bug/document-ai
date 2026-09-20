import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">
          Knowledge Base
          <span>{user?.department || "All departments"}</span>
        </div>

        <nav>
          <NavLink to="/ask">Ask</NavLink>
          <NavLink to="/documents">Documents</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/dashboard">Activity</NavLink>
        </nav>

        <div className="who">
          <strong>{user?.name || user?.email}</strong>
          {user?.role}
          <div>
            <button className="quiet" onClick={() => { signOut(); navigate("/login"); }}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
