/**
 * Creates three users, one per role, so you can test the permission
 * matrix immediately:  npm run seed
 */
import { pool } from "../src/db/pool.js";
import { registerUser } from "../src/services/auth.service.js";

const users = [
  { email: "admin@acme.test",   password: "password123", name: "Ada Admin",     role: "admin",    department: "Technology" },
  { email: "manager@acme.test", password: "password123", name: "Manny Manager", role: "manager",  department: "Finance" },
  { email: "emp@acme.test",     password: "password123", name: "Evan Employee", role: "employee", department: "Finance" },
];

for (const user of users) {
  try {
    await registerUser(user);
    console.log(`created ${user.role.padEnd(8)} ${user.email}`);
  } catch (err) {
    console.log(`skipped ${user.email} — ${err.message}`);
  }
}

console.log("\npassword for all seeded accounts: password123");
await pool.end();
