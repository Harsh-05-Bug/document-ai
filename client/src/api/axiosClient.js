import axios from "axios";

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url.includes("/auth/")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.assign("/login");
    }
    // Surface the API's message instead of "Request failed with status code 400"
    return Promise.reject(new Error(error.response?.data?.error || error.message));
  }
);

export default axiosClient;
