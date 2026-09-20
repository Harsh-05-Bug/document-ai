import client from "./axiosClient.js";

export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const register = (payload) =>
  client.post("/auth/register", payload).then((r) => r.data);

export const listUsers = () => client.get("/auth/users").then((r) => r.data);
