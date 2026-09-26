import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { joinWorkspace } from "../api/workspaces.api.js";
import { useAuth } from "../context/AuthContext.jsx";

export const PENDING_INVITE_KEY = "pendingInvite";

/**
 * Redeems an invite link.
 *
 * Someone clicking a link from a message may not have an account yet.
 * Rather than dropping them into normal signup — where they'd create a
 * workspace they never wanted and never reach the invite — the token is
 * held here and redeemed once they're signed in.
 */
export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, refreshWorkspaces, switchWorkspace } = useAuth();
  const [error, setError] = useState("");
  const attempted = useRef(false);

  // Not signed in: remember the invite and come back to it.
  if (!user) {
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
    } catch {
      // Private browsing can refuse storage; the link still works
      // once they sign in and open it again.
    }
    return <Navigate to="/register" replace />;
  }

  useEffect(() => {
    // StrictMode runs effects twice in development; joining once is enough.
    if (attempted.current) return;
    attempted.current = true;

    joinWorkspace(token)
      .then(async (workspace) => {
        try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
        await refreshWorkspaces();
        switchWorkspace(workspace.id);
        navigate("/documents", { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [token, navigate, refreshWorkspaces, switchWorkspace]);

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>{error ? "Can't join" : "Joining…"}</h1>
        {error ? (
          <>
            <p className="error">{error}</p>
            <p className="notice">
              Invite links expire and can be revoked. Ask whoever sent it for a new one.
            </p>
            <button type="button" onClick={() => navigate("/ask")}>
              Go to my workspaces
            </button>
          </>
        ) : (
          <p className="notice">Adding you to the workspace.</p>
        )}
      </div>
    </div>
  );
}