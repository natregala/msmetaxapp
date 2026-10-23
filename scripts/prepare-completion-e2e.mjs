// Local synthetic confirmed Auth fixture for interrupted setup/offline tests.
// Apply the ignored SQL ONLY to the isolated CSSprint MSME test project. No email is sent.
import { access, mkdir, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
try {
  await access(".env.completion-e2e");
  throw Error("Existing completion credentials found; reuse them.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const id = randomUUID(),
  email =
    "synthetic-completion-" +
    randomBytes(6).toString("hex") +
    "@example.invalid";
const password = randomBytes(24).toString("base64url"),
  hash = await bcrypt.hash(password, 10);
await mkdir(".test-data", { recursive: true });
await writeFile(
  ".env.completion-e2e",
  "E2E_COMPLETION_EMAIL=" +
    email +
    "\nE2E_COMPLETION_PASSWORD=" +
    password +
    "\n",
);
const sql = `begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}','${hash}',now(),'{"provider":"email","providers":["email"]}','{"synthetic_test":true}',now(),now(),'','','','');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
values ('${id}','${id}','{"sub":"${id}","email":"${email}","email_verified":true}','email',now(),now());
commit;`;
await writeFile(".test-data/completion-auth-fixture.sql", sql);
console.log(
  "Prepared isolated completion fixture. Credentials and SQL stay in ignored local files.",
);
