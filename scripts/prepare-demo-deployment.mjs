import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Explicit source allowlist: credentials, private data, tests, and local artifacts never enter it.
const files = [];
function add(relative) {
  const absolute = path.resolve(relative);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink())
    throw new Error(`Deployment refuses symlinks: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolute).sort())
      add(path.join(relative, name));
    return;
  }
  const file = relative.replaceAll("\\", "/");
  if (file.split("/").some((part) => part.startsWith(".env")))
    throw new Error("Environment file refused");
  const bytes = fs.readFileSync(absolute);
  const data = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9]{15}|eyJhbGci[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(
      data,
    )
  ) {
    throw new Error(`Potential credential refused: ${file}`);
  }
  files.push({ file, data });
}
for (const entry of [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "tsconfig.json",
  "eslint.config.mjs",
])
  add(entry);
const payload = JSON.stringify(files);
fs.mkdirSync(".vercel", { recursive: true });
fs.writeFileSync(".vercel/demo-deployment-files.json", payload, "utf8");
console.log(
  JSON.stringify({
    files: files.length,
    characters: payload.length,
    bytes: Buffer.byteLength(payload),
    sha256: crypto.createHash("sha256").update(payload).digest("hex"),
    environmentFiles: 0,
  }),
);
