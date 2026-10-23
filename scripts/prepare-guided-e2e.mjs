// Fresh synthetic first-time owner for the isolated CSSprint MSME test project.
// Apply generated SQL with the connected database tool; this script sends no email.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import bcrypt from "bcryptjs";

loadEnvFile(".env.e2e");
if (!process.env.E2E_PASSWORD)
  throw new Error("Prepare the original isolated test credentials first.");
const id = randomUUID();
const email = `synthetic-guided-${randomBytes(6).toString("hex")}@example.invalid`;
const hash = await bcrypt.hash(process.env.E2E_PASSWORD, 10);
await mkdir(".test-data", { recursive: true });
await writeFile(
  ".env.guided-e2e",
  `E2E_GUIDED_EMAIL=${email}\nE2E_GUIDED_USER=${id}\n`,
);
const sql = `begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}','${hash}',now(),'{"provider":"email","providers":["email"]}','{"synthetic_test":true}',now(),now(),'','','','');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
values ('${id}','${id}','{"sub":"${id}","email":"${email}","email_verified":true}','email',now(),now());
commit;`;
await writeFile(".test-data/guided-auth-fixture.sql", sql);
console.log(
  "Prepared one fresh synthetic first-time owner; credentials remain in ignored local files.",
);
