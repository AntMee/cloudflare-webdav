import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const d1Name = process.env.D1_NAME || "webdav_db";
const kvName = process.env.KV_NAME || "webdav_files";

const d1Id = ensureD1(d1Name);
const kvId = ensureKV(kvName);
updateWranglerConfig(d1Name, d1Id, kvId);

console.log(`D1 database: ${d1Name} (${d1Id})`);
console.log(`KV namespace: ${kvName} (${kvId})`);

function ensureD1(name) {
  const existing = findD1(name);
  if (existing) return existing;

  runWrangler(["d1", "create", name]);
  const created = findD1(name);
  if (!created) {
    throw new Error(`D1 database was created but its id could not be found: ${name}`);
  }
  return created;
}

function findD1(name) {
  const list = JSON.parse(runWrangler(["d1", "list", "--json"]) || "[]");
  const match = list.find((item) => item.name === name);
  return match?.uuid || match?.id || "";
}

function ensureKV(title) {
  const existing = findKV(title);
  if (existing) return existing;

  runWrangler(["kv", "namespace", "create", title]);
  const created = findKV(title);
  if (!created) {
    throw new Error(`KV namespace was created but its id could not be found: ${title}`);
  }
  return created;
}

function findKV(title) {
  const list = JSON.parse(runWrangler(["kv", "namespace", "list"]) || "[]");
  const match = list.find((item) => item.title === title);
  return match?.id || "";
}

function updateWranglerConfig(databaseName, databaseId, kvId) {
  const path = "wrangler.jsonc";
  let content = readFileSync(path, "utf8");

  content = content.replace(
    /"binding"\s*:\s*"DB"([\s\S]*?)"database_name"\s*:\s*"[^"]+"/,
    `"binding": "DB"$1"database_name": "${databaseName}"`,
  );
  content = content.replace(
    /"binding"\s*:\s*"DB"([\s\S]*?)"database_id"\s*:\s*"[^"]+"/,
    `"binding": "DB"$1"database_id": "${databaseId}"`,
  );
  content = content.replace(
    /"binding"\s*:\s*"KV"([\s\S]*?)"id"\s*:\s*"[^"]+"/,
    `"binding": "KV"$1"id": "${kvId}"`,
  );

  writeFileSync(path, content);
}

function runWrangler(args) {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: process.env,
  }).trim();
}
