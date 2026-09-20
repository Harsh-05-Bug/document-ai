import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });

pool.on("error", (err) => console.error("Unexpected idle client error", err));

/** Run a set of queries in a single transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
