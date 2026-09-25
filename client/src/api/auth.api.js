import client from "./axiosClient.js";

export const login = (email, password) =>
  client.post("/auth/login", { email, password }).then((r) => r.data);

export const register = (payload) =>
  client.post("/auth/register", payload).then((r) => r.data);

/** The signed-in user plus every workspace they belong to. */
export const me = () => client.get("/auth/me").then((r) => r.data);