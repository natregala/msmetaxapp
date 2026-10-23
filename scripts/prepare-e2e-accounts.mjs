// Produces local-only, synthetic credentials and SQL; never sends email.
// Apply .test-data/auth-fixtures.sql ONLY to this app's isolated test project.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import bcrypt from "bcryptjs";

try {
  await access(".env.e2e");
  throw new Error(
    "Existing .env.e2e found; reuse its fixtures instead of replacing credentials.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const password = randomBytes(24).toString("base64url");
const hash = await bcrypt.hash(password, 10);
const run = randomBytes(5).toString("hex");
const users = ["a", "b"].map((owner) => ({
  id: randomUUID(),
  email: `synthetic-${run}-${owner}@example.invalid`,
}));
await mkdir(".test-data", { recursive: true });
await writeFile(
  ".env.e2e",
  `E2E_EMAIL_A=${users[0].email}\nE2E_EMAIL_B=${users[1].email}\nE2E_PASSWORD=${password}\nE2E_USER_A=${users[0].id}\nE2E_USER_B=${users[1].id}\n`,
);
const sql = users
  .map(
    ({ id, email }) => `
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}','${hash}',now(),'{"provider":"email","providers":["email"]}','{"synthetic_test":true}',now(),now(),'','','','');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
values ('${id}','${id}','{"sub":"${id}","email":"${email}","email_verified":true}','email',now(),now());
`,
  )
  .join("\n");
await writeFile(".test-data/auth-fixtures.sql", `begin;\n${sql}\ncommit;`);
console.log(
  "Prepared two synthetic account fixtures. Credentials are only in ignored .env.e2e.",
);
