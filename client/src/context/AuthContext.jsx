import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listWorkspaces } from "../api/workspaces.api.js";

const AuthContext = createContext(null);

const WORKSPACE_KEY = "workspaceId";

/**
 * Who you are, and which workspace you're looking at.
 *
 * The two belong together: almost every request needs a workspace id,
 * and a user with no workspace has nowhere to put anything. The chosen
 * workspace is remembered per browser so a reload doesn't dump you
 * back into a different room.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem(WORKSPACE_KEY) || null);
  const [loading, setLoading] = useState(!!user);

  const loadWorkspaces = useCallback(async () => {
    const list = await listWorkspaces();
    setWorkspaces(list);

    // Keep the remembered choice only if it's still one we belong to —
    // being removed from a workspace shouldn't leave the app pointed at it.
    setWorkspaceId((current) => {
      const valid = list.some((w) => w.id === current);
      const next = valid ? current : list[0]?.id || null;
      if (next) localStorage.setItem(WORKSPACE_KEY, next);
      else localStorage.removeItem(WORKSPACE_KEY);
      return next;
    });

    return list;
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadWorkspaces().catch(() => {}).finally(() => setLoading(false));
  }, [user, loadWorkspaces]);

  const value = useMemo(
    () => ({
      user,
      workspaces,
      workspaceId,
      workspace: workspaces.find((w) => w.id === workspaceId) || null,
      // The caller's role in the current workspace, or null.
      role: workspaces.find((w) => w.id === workspaceId)?.role || null,
      loading,

      signIn(token, userData, initialWorkspaces = []) {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);

        if (initialWorkspaces.length) {
          setWorkspaces(initialWorkspaces);
          const first = initialWorkspaces[0].id;
          localStorage.setItem(WORKSPACE_KEY, first);
          setWorkspaceId(first);
        }
      },

      switchWorkspace(id) {
        localStorage.setItem(WORKSPACE_KEY, id);
        setWorkspaceId(id);
      },

      refreshWorkspaces: loadWorkspaces,

      signOut() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem(WORKSPACE_KEY);
        setUser(null);
        setWorkspaces([]);
        setWorkspaceId(null);
      },
    }),
    [user, workspaces, workspaceId, loading, loadWorkspaces]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);