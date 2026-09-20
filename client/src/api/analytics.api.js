import client from "./axiosClient.js";

export const getOverview = () => client.get("/analytics/overview").then((r) => r.data);
