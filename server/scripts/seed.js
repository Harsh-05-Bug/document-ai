/**
 * Creates a demo workspace with one account per role, so the role
 * matrix can be tried immediately:  npm run seed
 *
 * The teacher owns the workspace; the others join it at the role their
 * name suggests. Each also gets their own workspace from signup, which
 * is a useful second thing to see: switching between workspaces, and
 * the fact that being an owner in one grants nothing in another.
 */
import { pool } from "../src/db/pool.js";
import { registerUser } from "../src/services/auth.service.js";
import { createInvite, acceptInvite } from "../src/services/workspace.service.js";

const OWNER = {
  email: "teacher@demo.test",
  password: "password123",
  name: "Tara Teacher",
  workspaceName: "Physics 101",
};

const JOINERS = [
  { email: "assistant@demo.test", password: "password123", name: "Alex Assistant", role: "admin" },
  { email: "student@demo.test",   password: "password123", name: "Sam Student",    role: "member" },
  { email: "guest@demo.test",     password: "password123", name: "Gita Guest",     role: "viewer" },
];

async function findUserId(email) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  return rows[0]?.id || null;
}

async function ensureUser(details) {
  try {
    const result = await registerUser(details);
    console.log(`created  ${details.email}`);
    return result;
  } catch (err) {
    if (!/already registered/i.test(err.message)) throw err;
    console.log(`existing ${details.email}`);
    return { user: { id: await findUserId(details.email) } };
  }
}

const owner = await ensureUser(OWNER);

// An existing owner has no workspace returned, so look theirs up.
const { rows } = await pool.query(
  `SELECT w.id, w.name FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = $1 AND m.role = 'owner'
    ORDER BY w.created_at LIMIT 1`,
  [owner.user.id]
);
const workspace = owner.workspace || rows[0];

if (!workspace) {
  console.error("Could not find or create the demo workspace.");
  await pool.end();
  process.exit(1);
}

for (const joiner of JOINERS) {
  const { role, ...details } = joiner;
  const person = await ensureUser({ ...details, workspaceName: `${details.name}'s workspace` });

  const invite = await createInvite({
    workspaceId: workspace.id,
    role,
    userId: owner.user.id,
  });
  await acceptInvite({ token: invite.token, userId: person.user.id });
  console.log(`  joined ${details.email} as ${role}`);
}

console.log(`\nWorkspace: ${workspace.name}`);
console.log("Accounts:");
console.log(`  ${OWNER.email.padEnd(24)} owner   — manages members and everything in the workspace`);
for (const j of JOINERS) {
  const note = { admin: "manages documents and invites", member: "uploads and asks", viewer: "reads and asks only" }[j.role];
  console.log(`  ${j.email.padEnd(24)} ${j.role.padEnd(7)} — ${note}`);
}
console.log("\npassword for all seeded accounts: password123");

await pool.end();