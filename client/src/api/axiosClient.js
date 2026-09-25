import axios from "axios";

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
});

/**
 * Every request carries the token and, where the endpoint needs one,
 * the current workspace.
 *
 * Attaching the workspace here rather than in each component means no
 * page can forget it — and the server rejects a request without one,
 * so forgetting would be a bug on every screen rather than a silent
 * widening of scope.
 */
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const workspaceId = localStorage.getItem("workspaceId");
  if (!workspaceId) return config;

  const url = config.url || "";
  // Auth and workspace management name their own scope, or need none.
  const scoped = !url.startsWith("/auth") && !url.startsWith("/workspaces");

  if (scoped) {
    const method = (config.method || "get").toLowerCase();
    if (method === "get" || method === "delete") {
      config.params = { workspaceId, ...(config.params || {}) };
    } else if (config.data instanceof FormData) {
      if (!config.data.has("workspaceId")) config.data.append("workspaceId", workspaceId);
    } else if (config.data && typeof config.data === "object") {
      config.data = { workspaceId, ...config.data };
    } else if (config.data == null) {
      config.data = { workspaceId };
    }
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url.includes("/auth/")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("workspaceId");
      window.location.assign("/login");
    }
    // Surface the API's message instead of "Request failed with status code 400"
    return Promise.reject(new Error(error.response?.data?.error || error.message));
  }
);

export default axiosClient;