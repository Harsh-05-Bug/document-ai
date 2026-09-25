import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { joinWorkspace } from "../api/workspaces.api.js";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Redeems an invite link.
 *
 * Runs as soon as the page opens: someone clicking a link from a
 * message expects to land inside the workspace, not to be asked to
 * confirm something they already chose by clicking.
 */
export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refreshWorkspaces, switchWorkspace } = useAuth();
  const [error, setError] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; joining once is enough.
    if (attempted.current) return;
    attempted.current = true;

    joinWorkspace(token)
      .then(async (workspace) => {
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