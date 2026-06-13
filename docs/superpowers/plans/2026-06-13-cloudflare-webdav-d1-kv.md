# Cloudflare WebDAV D1 + KV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Workers + Pages WebDAV service where admins can create users, D1 stores users and file metadata, and KV stores file contents up to 20 MB.

**Architecture:** The Worker exposes `/dav/*` for WebDAV and `/api/admin/*` for admin JSON APIs. Core logic is split into auth, path normalization, D1 repositories, KV file storage, WebDAV handlers, and admin handlers. Pages hosts a static admin UI that calls the Worker API.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, D1, Workers KV, Pages static assets, Vitest.

---

## File Structure

- Create `cloudflare-webdav/package.json`: scripts and development dependencies.
- Create `cloudflare-webdav/tsconfig.json`: TypeScript configuration.
- Create `cloudflare-webdav/wrangler.jsonc`: Worker, D1, KV, observability config.
- Create `cloudflare-webdav/migrations/0001_initial.sql`: D1 schema.
- Create `cloudflare-webdav/src/index.ts`: Worker entrypoint and route dispatch.
- Create `cloudflare-webdav/src/env.ts`: generated-binding-facing shared Env type until `wrangler types` is run.
- Create `cloudflare-webdav/src/http.ts`: response helpers.
- Create `cloudflare-webdav/src/path.ts`: WebDAV path normalization.
- Create `cloudflare-webdav/src/auth.ts`: Basic Auth, password hashing, session tokens.
- Create `cloudflare-webdav/src/repositories/users.ts`: D1 user and session operations.
- Create `cloudflare-webdav/src/repositories/nodes.ts`: D1 file and directory metadata operations.
- Create `cloudflare-webdav/src/storage/kv-files.ts`: KV content operations.
- Create `cloudflare-webdav/src/webdav/xml.ts`: WebDAV XML response generation.
- Create `cloudflare-webdav/src/webdav/handler.ts`: WebDAV method handling.
- Create `cloudflare-webdav/src/admin/handler.ts`: admin API handling.
- Create `cloudflare-webdav/pages-admin/index.html`: Pages admin UI.
- Create `cloudflare-webdav/pages-admin/app.js`: admin UI behavior.
- Create `cloudflare-webdav/test/path.test.ts`: path tests.
- Create `cloudflare-webdav/test/auth.test.ts`: auth tests.
- Create `cloudflare-webdav/test/webdav.test.ts`: method-level tests with mocked repositories.
- Create `cloudflare-webdav/README.md`: setup and deployment guide.

## Task 1: Project Skeleton

**Files:**
- Create: `cloudflare-webdav/package.json`
- Create: `cloudflare-webdav/tsconfig.json`
- Create: `cloudflare-webdav/wrangler.jsonc`
- Create: `cloudflare-webdav/src/env.ts`
- Create: `cloudflare-webdav/src/index.ts`
- Create: `cloudflare-webdav/src/http.ts`

- [ ] **Step 1: Create package metadata**

Create `cloudflare-webdav/package.json`:

```json
{
  "name": "cloudflare-webdav",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "types": "wrangler types",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `cloudflare-webdav/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create Wrangler config**

Create `cloudflare-webdav/wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "cloudflare-webdav",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-13",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "vars": {
    "MAX_FILE_BYTES": "20971520",
    "SESSION_TTL_SECONDS": "43200"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cloudflare-webdav",
      "database_id": "replace-with-d1-database-id",
      "migrations_dir": "migrations"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "FILES",
      "id": "replace-with-kv-namespace-id"
    }
  ]
}
```

- [ ] **Step 4: Create Env and response helpers**

Create `cloudflare-webdav/src/env.ts`:

```ts
export interface Env {
  DB: D1Database;
  FILES: KVNamespace;
  MAX_FILE_BYTES: string;
  SESSION_TTL_SECONDS: string;
}
```

Create `cloudflare-webdav/src/http.ts`:

```ts
export function textResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function noContent(status = 204, headers: HeadersInit = {}): Response {
  return new Response(null, { status, headers });
}

export function methodNotAllowed(allowed: string[]): Response {
  return textResponse("Method Not Allowed", 405, { allow: allowed.join(", ") });
}
```

- [ ] **Step 5: Create route entrypoint**

Create `cloudflare-webdav/src/index.ts`:

```ts
import type { Env } from "./env";
import { jsonResponse, textResponse } from "./http";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname.startsWith("/dav")) {
      return textResponse("WebDAV handler is not implemented yet", 501);
    }

    if (url.pathname.startsWith("/api/admin")) {
      return jsonResponse({ error: "Admin API is not implemented yet" }, 501);
    }

    return textResponse("Not Found", 404);
  },
};
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm install
npm run typecheck
```

Expected: dependencies install and TypeScript reports no errors.

## Task 2: D1 Schema

**Files:**
- Create: `cloudflare-webdav/migrations/0001_initial.sql`
- Create: `cloudflare-webdav/README.md`

- [ ] **Step 1: Create migration**

Create `cloudflare-webdav/migrations/0001_initial.sql`:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file', 'directory')),
  kv_key TEXT,
  mime_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (owner_user_id, path)
);

CREATE INDEX idx_nodes_owner_path ON nodes(owner_user_id, path);
CREATE INDEX idx_nodes_owner_updated ON nodes(owner_user_id, updated_at);
CREATE INDEX idx_sessions_user ON admin_sessions(user_id);
CREATE INDEX idx_sessions_expires ON admin_sessions(expires_at);
```

- [ ] **Step 2: Create README setup section**

Create `cloudflare-webdav/README.md`:

```md
# Cloudflare WebDAV

Cloudflare Workers WebDAV service for configuration files up to 20 MB.

## Storage

- D1 stores users, admin sessions, directories, and file metadata.
- Workers KV stores file contents.
- R2 is not required.

## Local Setup

```bash
npm install
npm run typecheck
npm test
```

## Cloudflare Setup

```bash
wrangler d1 create cloudflare-webdav
wrangler kv namespace create FILES
```

Copy the returned IDs into `wrangler.jsonc`, then run:

```bash
wrangler d1 migrations apply cloudflare-webdav --local
wrangler dev
```
```

- [ ] **Step 3: Validate migration syntax locally**

Run:

```bash
cd cloudflare-webdav
npx wrangler d1 migrations apply cloudflare-webdav --local
```

Expected: Wrangler applies `0001_initial.sql` locally after the config has a valid local D1 binding.

## Task 3: Path Normalization

**Files:**
- Create: `cloudflare-webdav/src/path.ts`
- Create: `cloudflare-webdav/test/path.test.ts`

- [ ] **Step 1: Write path tests**

Create `cloudflare-webdav/test/path.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeDavPath, parentPath } from "../src/path";

describe("normalizeDavPath", () => {
  it("normalizes root", () => {
    expect(normalizeDavPath("/dav")).toEqual({ ok: true, path: "/" });
    expect(normalizeDavPath("/dav/")).toEqual({ ok: true, path: "/" });
  });

  it("normalizes nested files", () => {
    expect(normalizeDavPath("/dav/app/config.json")).toEqual({ ok: true, path: "/app/config.json" });
  });

  it("rejects traversal", () => {
    expect(normalizeDavPath("/dav/../secret")).toEqual({ ok: false, status: 400, message: "Invalid path" });
  });

  it("rejects control characters", () => {
    expect(normalizeDavPath("/dav/a%00b")).toEqual({ ok: false, status: 400, message: "Invalid path" });
  });
});

describe("parentPath", () => {
  it("returns parent directories", () => {
    expect(parentPath("/a/b.txt")).toBe("/a/");
    expect(parentPath("/a/")).toBe("/");
    expect(parentPath("/")).toBe("/");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd cloudflare-webdav
npm test -- path.test.ts
```

Expected: FAIL because `src/path.ts` does not exist.

- [ ] **Step 3: Implement path helpers**

Create `cloudflare-webdav/src/path.ts`:

```ts
export type NormalizedPath =
  | { ok: true; path: string }
  | { ok: false; status: 400; message: string };

export function normalizeDavPath(pathname: string): NormalizedPath {
  const prefix = "/dav";
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    return { ok: false, status: 400, message: "Invalid path" };
  }

  const raw = pathname.slice(prefix.length) || "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { ok: false, status: 400, message: "Invalid path" };
  }

  if (!decoded.startsWith("/")) {
    decoded = `/${decoded}`;
  }

  if (/[\u0000-\u001F\u007F]/u.test(decoded)) {
    return { ok: false, status: 400, message: "Invalid path" };
  }

  const hadTrailingSlash = decoded.endsWith("/");
  const parts = decoded.split("/").filter(Boolean);

  if (parts.some((part) => part === "." || part === "..")) {
    return { ok: false, status: 400, message: "Invalid path" };
  }

  const normalized = `/${parts.join("/")}`;
  if (normalized === "/") {
    return { ok: true, path: "/" };
  }

  return { ok: true, path: hadTrailingSlash ? `${normalized}/` : normalized };
}

export function parentPath(path: string): string {
  if (path === "/") return "/";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) return "/";
  return `${trimmed.slice(0, index)}/`;
}

export function fileName(path: string): string {
  if (path === "/") return "";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}
```

- [ ] **Step 4: Run path tests**

Run:

```bash
cd cloudflare-webdav
npm test -- path.test.ts
```

Expected: PASS.

## Task 4: Authentication

**Files:**
- Create: `cloudflare-webdav/src/auth.ts`
- Create: `cloudflare-webdav/test/auth.test.ts`

- [ ] **Step 1: Write auth tests**

Create `cloudflare-webdav/test/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPasswordHash, parseBasicAuth, verifyPasswordHash } from "../src/auth";

describe("parseBasicAuth", () => {
  it("parses valid basic auth", () => {
    const value = btoa("alice:secret");
    expect(parseBasicAuth(`Basic ${value}`)).toEqual({ ok: true, username: "alice", password: "secret" });
  });

  it("rejects missing or malformed auth", () => {
    expect(parseBasicAuth(null)).toEqual({ ok: false });
    expect(parseBasicAuth("Bearer token")).toEqual({ ok: false });
  });
});

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const hash = await createPasswordHash("secret");
    await expect(verifyPasswordHash("secret", hash)).resolves.toBe(true);
    await expect(verifyPasswordHash("wrong", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd cloudflare-webdav
npm test -- auth.test.ts
```

Expected: FAIL because `src/auth.ts` does not exist.

- [ ] **Step 3: Implement auth helpers**

Create `cloudflare-webdav/src/auth.ts`:

```ts
const encoder = new TextEncoder();

export type BasicAuthResult =
  | { ok: true; username: string; password: string }
  | { ok: false };

export function parseBasicAuth(header: string | null): BasicAuthResult {
  if (!header?.startsWith("Basic ")) {
    return { ok: false };
  }

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator <= 0) return { ok: false };
    return {
      ok: true,
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return { ok: false };
  }
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt);
  return `pbkdf2-sha256:100000:${toBase64(salt)}:${toBase64(key)}`;
}

export async function verifyPasswordHash(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await derivePasswordKey(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export async function createSessionToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(bytes);
  return { token, tokenHash: await sha256Hex(token) };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations = 100000): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index]! ^ b[index]!;
  }
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string | undefined): Uint8Array {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
```

- [ ] **Step 4: Run auth tests**

Run:

```bash
cd cloudflare-webdav
npm test -- auth.test.ts
```

Expected: PASS.

## Task 5: D1 Repositories

**Files:**
- Create: `cloudflare-webdav/src/repositories/users.ts`
- Create: `cloudflare-webdav/src/repositories/nodes.ts`

- [ ] **Step 1: Implement user repository**

Create `cloudflare-webdav/src/repositories/users.ts`:

```ts
export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: "admin" | "user";
}

export async function findUserByUsername(db: D1Database, username: string): Promise<UserRecord | null> {
  return db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<UserRecord>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRecord | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRecord>();
}

export async function listUsers(db: D1Database): Promise<UserRecord[]> {
  const result = await db.prepare(
    "SELECT * FROM users ORDER BY role ASC, username ASC",
  ).all<UserRecord>();
  return result.results;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<UserRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO users (id, username, password_hash, role, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).bind(id, input.username, input.passwordHash, input.role, now, now).run();
  const user = await findUserById(db, id);
  if (!user) throw new Error("Created user was not found");
  return user;
}

export async function setUserEnabled(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await db.prepare("UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, new Date().toISOString(), id)
    .run();
}

export async function updateUserPassword(db: D1Database, id: string, passwordHash: string): Promise<void> {
  await db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, new Date().toISOString(), id)
    .run();
}

export async function createAdminSession(
  db: D1Database,
  tokenHash: string,
  userId: string,
  ttlSeconds: number,
): Promise<void> {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);
  await db.prepare(
    "INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).bind(tokenHash, userId, expires.toISOString(), now.toISOString()).run();
}

export async function findAdminSessionUser(db: D1Database, tokenHash: string): Promise<UserRecord | null> {
  return db.prepare(
    `SELECT users.*
     FROM admin_sessions
     JOIN users ON users.id = admin_sessions.user_id
     WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ? AND users.enabled = 1`,
  ).bind(tokenHash, new Date().toISOString()).first<UserRecord>();
}
```

- [ ] **Step 2: Implement node repository**

Create `cloudflare-webdav/src/repositories/nodes.ts`:

```ts
export interface NodeRecord {
  id: string;
  owner_user_id: string;
  path: string;
  kind: "file" | "directory";
  kv_key: string | null;
  mime_type: string | null;
  size: number;
  etag: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertFileInput {
  ownerUserId: string;
  path: string;
  kvKey: string;
  mimeType: string;
  size: number;
  etag: string;
}

export async function getNode(db: D1Database, ownerUserId: string, path: string): Promise<NodeRecord | null> {
  return db.prepare("SELECT * FROM nodes WHERE owner_user_id = ? AND path = ?")
    .bind(ownerUserId, path)
    .first<NodeRecord>();
}

export async function listChildren(db: D1Database, ownerUserId: string, directoryPath: string): Promise<NodeRecord[]> {
  const prefix = directoryPath === "/" ? "/" : directoryPath;
  const result = await db.prepare(
    `SELECT * FROM nodes
     WHERE owner_user_id = ?
       AND path != ?
       AND path LIKE ?
     ORDER BY kind DESC, path ASC`,
  ).bind(ownerUserId, directoryPath, `${prefix}%`).all<NodeRecord>();

  const baseDepth = directoryPath === "/" ? 1 : directoryPath.split("/").filter(Boolean).length + 1;
  return result.results.filter((node) => node.path.split("/").filter(Boolean).length === baseDepth);
}

export async function ensureRootDirectory(db: D1Database, ownerUserId: string): Promise<void> {
  const existing = await getNode(db, ownerUserId, "/");
  if (existing) return;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO nodes (id, owner_user_id, path, kind, size, created_at, updated_at)
     VALUES (?, ?, '/', 'directory', 0, ?, ?)`,
  ).bind(crypto.randomUUID(), ownerUserId, now, now).run();
}

export async function createDirectory(db: D1Database, ownerUserId: string, path: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO nodes (id, owner_user_id, path, kind, size, created_at, updated_at)
     VALUES (?, ?, ?, 'directory', 0, ?, ?)`,
  ).bind(crypto.randomUUID(), ownerUserId, path, now, now).run();
}

export async function upsertFile(db: D1Database, input: UpsertFileInput): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO nodes (id, owner_user_id, path, kind, kv_key, mime_type, size, etag, created_at, updated_at)
     VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_user_id, path) DO UPDATE SET
       kind = 'file',
       kv_key = excluded.kv_key,
       mime_type = excluded.mime_type,
       size = excluded.size,
       etag = excluded.etag,
       updated_at = excluded.updated_at`,
  ).bind(
    crypto.randomUUID(),
    input.ownerUserId,
    input.path,
    input.kvKey,
    input.mimeType,
    input.size,
    input.etag,
    now,
    now,
  ).run();
}

export async function deleteNode(db: D1Database, ownerUserId: string, path: string): Promise<void> {
  await db.prepare("DELETE FROM nodes WHERE owner_user_id = ? AND path = ?").bind(ownerUserId, path).run();
}

export async function hasChildren(db: D1Database, ownerUserId: string, directoryPath: string): Promise<boolean> {
  const prefix = directoryPath === "/" ? "/" : directoryPath;
  const row = await db.prepare(
    "SELECT id FROM nodes WHERE owner_user_id = ? AND path != ? AND path LIKE ? LIMIT 1",
  ).bind(ownerUserId, directoryPath, `${prefix}%`).first<{ id: string }>();
  return row !== null;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 6: KV File Storage

**Files:**
- Create: `cloudflare-webdav/src/storage/kv-files.ts`

- [ ] **Step 1: Implement KV storage**

Create `cloudflare-webdav/src/storage/kv-files.ts`:

```ts
export interface StoredFile {
  body: ArrayBuffer;
  etag: string;
}

export function kvKeyFor(ownerUserId: string, path: string): string {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `users/${ownerUserId}/${normalized}`;
}

export async function putFile(namespace: KVNamespace, key: string, body: ArrayBuffer): Promise<string> {
  const etag = await contentEtag(body);
  await namespace.put(key, body, {
    metadata: { etag },
  });
  return etag;
}

export async function getFile(namespace: KVNamespace, key: string): Promise<StoredFile | null> {
  const result = await namespace.getWithMetadata<{ etag?: string }>(key, "arrayBuffer");
  if (result.value === null) return null;
  return {
    body: result.value,
    etag: result.metadata?.etag ?? await contentEtag(result.value),
  };
}

export async function deleteFile(namespace: KVNamespace, key: string): Promise<void> {
  await namespace.delete(key);
}

async function contentEtag(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `"${hex}"`;
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 7: WebDAV XML

**Files:**
- Create: `cloudflare-webdav/src/webdav/xml.ts`

- [ ] **Step 1: Implement XML builder**

Create `cloudflare-webdav/src/webdav/xml.ts`:

```ts
import type { NodeRecord } from "../repositories/nodes";

export function propfindResponse(originPath: string, nodes: NodeRecord[]): string {
  const responses = nodes.map((node) => nodeResponse(originPath, node)).join("");
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:multistatus xmlns:D="DAV:">${responses}</D:multistatus>`;
}

function nodeResponse(originPath: string, node: NodeRecord): string {
  const href = hrefFor(originPath, node.path);
  const resourceType = node.kind === "directory" ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>";
  const length = node.kind === "file" ? `<D:getcontentlength>${node.size}</D:getcontentlength>` : "";
  const contentType = node.mime_type ? `<D:getcontenttype>${escapeXml(node.mime_type)}</D:getcontenttype>` : "";
  const etag = node.etag ? `<D:getetag>${escapeXml(node.etag)}</D:getetag>` : "";

  return `<D:response>` +
    `<D:href>${escapeXml(href)}</D:href>` +
    `<D:propstat><D:prop>` +
    resourceType +
    `<D:displayname>${escapeXml(displayName(node.path))}</D:displayname>` +
    `<D:getlastmodified>${new Date(node.updated_at).toUTCString()}</D:getlastmodified>` +
    length +
    contentType +
    etag +
    `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>` +
    `</D:response>`;
}

function hrefFor(originPath: string, nodePath: string): string {
  const cleanOrigin = originPath.endsWith("/") ? originPath.slice(0, -1) : originPath;
  if (nodePath === "/") return `${cleanOrigin}/`;
  return `${cleanOrigin}${nodePath}`;
}

function displayName(path: string): string {
  if (path === "/") return "";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 8: WebDAV Handler

**Files:**
- Create: `cloudflare-webdav/src/webdav/handler.ts`
- Modify: `cloudflare-webdav/src/index.ts`
- Create: `cloudflare-webdav/test/webdav.test.ts`

- [ ] **Step 1: Implement WebDAV handler**

Create `cloudflare-webdav/src/webdav/handler.ts`:

```ts
import type { Env } from "../env";
import { methodNotAllowed, noContent, textResponse } from "../http";
import { parseBasicAuth, verifyPasswordHash } from "../auth";
import { normalizeDavPath, parentPath } from "../path";
import { findUserByUsername } from "../repositories/users";
import {
  createDirectory,
  deleteNode,
  ensureRootDirectory,
  getNode,
  hasChildren,
  listChildren,
  upsertFile,
} from "../repositories/nodes";
import { deleteFile, getFile, kvKeyFor, putFile } from "../storage/kv-files";
import { propfindResponse } from "./xml";

const SUPPORTED = ["OPTIONS", "PROPFIND", "GET", "HEAD", "PUT", "DELETE", "MKCOL"];

export async function handleWebDav(request: Request, env: Env): Promise<Response> {
  const auth = parseBasicAuth(request.headers.get("authorization"));
  if (!auth.ok) return unauthorized();

  const user = await findUserByUsername(env.DB, auth.username);
  if (!user || user.enabled !== 1 || !(await verifyPasswordHash(auth.password, user.password_hash))) {
    return unauthorized();
  }

  await ensureRootDirectory(env.DB, user.id);

  const url = new URL(request.url);
  const normalized = normalizeDavPath(url.pathname);
  if (!normalized.ok) return textResponse(normalized.message, normalized.status);

  switch (request.method) {
    case "OPTIONS":
      return noContent(204, {
        allow: SUPPORTED.join(", "),
        dav: "1",
      });
    case "PROPFIND":
      return handlePropfind(request, env, user.id, normalized.path);
    case "GET":
      return handleGet(env, user.id, normalized.path, false);
    case "HEAD":
      return handleGet(env, user.id, normalized.path, true);
    case "PUT":
      return handlePut(request, env, user.id, normalized.path);
    case "DELETE":
      return handleDelete(env, user.id, normalized.path);
    case "MKCOL":
      return handleMkcol(env, user.id, normalized.path);
    case "LOCK":
    case "UNLOCK":
    case "COPY":
    case "MOVE":
    case "PROPPATCH":
      return textResponse("Not Implemented", 501);
    default:
      return methodNotAllowed(SUPPORTED);
  }
}

async function handlePropfind(request: Request, env: Env, userId: string, path: string): Promise<Response> {
  const node = await getNode(env.DB, userId, path);
  if (!node) return textResponse("Not Found", 404);
  const depth = request.headers.get("depth") ?? "1";
  const nodes = depth === "0" ? [node] : [node, ...await listChildren(env.DB, userId, path)];
  return new Response(propfindResponse("/dav", nodes), {
    status: 207,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

async function handleGet(env: Env, userId: string, path: string, headOnly: boolean): Promise<Response> {
  const node = await getNode(env.DB, userId, path);
  if (!node || node.kind !== "file" || !node.kv_key) return textResponse("Not Found", 404);
  const file = await getFile(env.FILES, node.kv_key);
  if (!file) return textResponse("Not Found", 404);
  return new Response(headOnly ? null : file.body, {
    status: 200,
    headers: {
      "content-type": node.mime_type ?? "application/octet-stream",
      "content-length": String(node.size),
      etag: node.etag ?? file.etag,
      "last-modified": new Date(node.updated_at).toUTCString(),
    },
  });
}

async function handlePut(request: Request, env: Env, userId: string, path: string): Promise<Response> {
  if (path === "/" || path.endsWith("/")) return textResponse("Conflict", 409);
  const maxBytes = Number(env.MAX_FILE_BYTES || "20971520");
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) return textResponse("Payload Too Large", 413);

  const parent = await getNode(env.DB, userId, parentPath(path));
  if (!parent || parent.kind !== "directory") return textResponse("Conflict", 409);

  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) return textResponse("Payload Too Large", 413);

  const key = kvKeyFor(userId, path);
  const etag = await putFile(env.FILES, key, body);
  await upsertFile(env.DB, {
    ownerUserId: userId,
    path,
    kvKey: key,
    mimeType: request.headers.get("content-type") ?? "application/octet-stream",
    size: body.byteLength,
    etag,
  });
  return noContent(201, { etag });
}

async function handleDelete(env: Env, userId: string, path: string): Promise<Response> {
  if (path === "/") return textResponse("Conflict", 409);
  const node = await getNode(env.DB, userId, path);
  if (!node) return textResponse("Not Found", 404);
  if (node.kind === "directory" && await hasChildren(env.DB, userId, path)) {
    return textResponse("Directory Not Empty", 409);
  }
  if (node.kind === "file" && node.kv_key) {
    await deleteFile(env.FILES, node.kv_key);
  }
  await deleteNode(env.DB, userId, path);
  return noContent();
}

async function handleMkcol(env: Env, userId: string, path: string): Promise<Response> {
  const directoryPath = path.endsWith("/") ? path : `${path}/`;
  if (directoryPath === "/") return methodNotAllowed(SUPPORTED);
  const parent = await getNode(env.DB, userId, parentPath(directoryPath));
  if (!parent || parent.kind !== "directory") return textResponse("Conflict", 409);
  if (await getNode(env.DB, userId, directoryPath)) return textResponse("Method Not Allowed", 405);
  await createDirectory(env.DB, userId, directoryPath);
  return noContent(201);
}

function unauthorized(): Response {
  return textResponse("Unauthorized", 401, { "www-authenticate": 'Basic realm="Cloudflare WebDAV"' });
}
```

- [ ] **Step 2: Wire WebDAV entrypoint**

Modify `cloudflare-webdav/src/index.ts`:

```ts
import type { Env } from "./env";
import { jsonResponse, textResponse } from "./http";
import { handleWebDav } from "./webdav/handler";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname.startsWith("/dav")) {
      return handleWebDav(request, env);
    }

    if (url.pathname.startsWith("/api/admin")) {
      return jsonResponse({ error: "Admin API is not implemented yet" }, 501);
    }

    return textResponse("Not Found", 404);
  },
};
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 9: Admin API

**Files:**
- Create: `cloudflare-webdav/src/admin/handler.ts`
- Modify: `cloudflare-webdav/src/index.ts`

- [ ] **Step 1: Implement admin handler**

Create `cloudflare-webdav/src/admin/handler.ts`:

```ts
import type { Env } from "../env";
import { createPasswordHash, createSessionToken, sha256Hex, verifyPasswordHash } from "../auth";
import { jsonResponse, methodNotAllowed } from "../http";
import {
  createAdminSession,
  createUser,
  findAdminSessionUser,
  findUserByUsername,
  listUsers,
  setUserEnabled,
  updateUserPassword,
} from "../repositories/users";

const ADMIN_ALLOWED = ["POST", "GET", "PATCH"];

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin/, "") || "/";

  if (request.method === "POST" && path === "/login") {
    return login(request, env);
  }

  const admin = await requireAdmin(request, env);
  if (!admin.ok) return admin.response;

  if (request.method === "GET" && path === "/users") {
    const users = await listUsers(env.DB);
    return jsonResponse({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        enabled: user.enabled === 1,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      })),
    });
  }

  if (request.method === "POST" && path === "/users") {
    const body = await request.json<CreateUserBody>();
    if (!isValidUsername(body.username) || body.password.length < 8) {
      return jsonResponse({ error: "Invalid username or password" }, 400);
    }
    const passwordHash = await createPasswordHash(body.password);
    const user = await createUser(env.DB, {
      username: body.username,
      passwordHash,
      role: body.role === "admin" ? "admin" : "user",
    });
    return jsonResponse({ id: user.id, username: user.username, role: user.role, enabled: true }, 201);
  }

  const enableMatch = path.match(/^\/users\/([^/]+)\/enabled$/);
  if (request.method === "PATCH" && enableMatch) {
    const body = await request.json<{ enabled: boolean }>();
    await setUserEnabled(env.DB, enableMatch[1]!, Boolean(body.enabled));
    return jsonResponse({ ok: true });
  }

  const passwordMatch = path.match(/^\/users\/([^/]+)\/password$/);
  if (request.method === "PATCH" && passwordMatch) {
    const body = await request.json<{ password: string }>();
    if (body.password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
    await updateUserPassword(env.DB, passwordMatch[1]!, await createPasswordHash(body.password));
    return jsonResponse({ ok: true });
  }

  return methodNotAllowed(ADMIN_ALLOWED);
}

interface CreateUserBody {
  username: string;
  password: string;
  role?: "admin" | "user";
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ username: string; password: string }>();
  const user = await findUserByUsername(env.DB, body.username);
  if (!user || user.role !== "admin" || user.enabled !== 1) {
    return jsonResponse({ error: "Invalid credentials" }, 401);
  }
  if (!(await verifyPasswordHash(body.password, user.password_hash))) {
    return jsonResponse({ error: "Invalid credentials" }, 401);
  }

  const session = await createSessionToken();
  await createAdminSession(env.DB, session.tokenHash, user.id, Number(env.SESSION_TTL_SECONDS || "43200"));
  return jsonResponse({ token: session.token });
}

async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) };
  }
  const user = await findAdminSessionUser(env.DB, await sha256Hex(header.slice("Bearer ".length)));
  if (!user || user.role !== "admin") {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { ok: true };
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,64}$/.test(username);
}
```

- [ ] **Step 2: Wire admin entrypoint**

Modify `cloudflare-webdav/src/index.ts`:

```ts
import type { Env } from "./env";
import { handleAdmin } from "./admin/handler";
import { jsonResponse, textResponse } from "./http";
import { handleWebDav } from "./webdav/handler";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname.startsWith("/dav")) {
      return handleWebDav(request, env);
    }

    if (url.pathname.startsWith("/api/admin")) {
      return handleAdmin(request, env);
    }

    return textResponse("Not Found", 404);
  },
};
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 10: Pages Admin UI

**Files:**
- Create: `cloudflare-webdav/pages-admin/index.html`
- Create: `cloudflare-webdav/pages-admin/app.js`

- [ ] **Step 1: Create admin HTML**

Create `cloudflare-webdav/pages-admin/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebDAV Admin</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7f9; color: #1f2937; }
      main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
      section { background: #fff; border: 1px solid #d8dee6; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
      label { display: block; font-size: 14px; margin: 12px 0 4px; }
      input, select, button { font: inherit; padding: 9px 10px; border: 1px solid #c8d0da; border-radius: 6px; }
      button { cursor: pointer; background: #1f6feb; color: white; border-color: #1f6feb; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 10px; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
      .hidden { display: none; }
      .muted { color: #6b7280; }
    </style>
  </head>
  <body>
    <main>
      <h1>WebDAV Admin</h1>
      <section id="login">
        <h2>管理员登录</h2>
        <label>用户名</label>
        <input id="login-username" autocomplete="username" />
        <label>密码</label>
        <input id="login-password" type="password" autocomplete="current-password" />
        <p><button id="login-button">登录</button></p>
      </section>

      <section id="users" class="hidden">
        <h2>用户管理</h2>
        <div class="row">
          <label>用户名 <input id="new-username" /></label>
          <label>密码 <input id="new-password" type="password" /></label>
          <label>角色
            <select id="new-role">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <button id="create-user">新增用户</button>
        </div>
        <table>
          <thead><tr><th>用户名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
          <tbody id="user-list"></tbody>
        </table>
      </section>
      <p id="message" class="muted"></p>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create admin JavaScript**

Create `cloudflare-webdav/pages-admin/app.js`:

```js
let token = localStorage.getItem("adminToken") || "";

const loginSection = document.querySelector("#login");
const usersSection = document.querySelector("#users");
const message = document.querySelector("#message");

document.querySelector("#login-button").addEventListener("click", login);
document.querySelector("#create-user").addEventListener("click", createUser);

if (token) showUsers();

async function login() {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: document.querySelector("#login-username").value,
      password: document.querySelector("#login-password").value,
    }),
  });
  const body = await response.json();
  if (!response.ok) return setMessage(body.error || "登录失败");
  token = body.token;
  localStorage.setItem("adminToken", token);
  await showUsers();
}

async function showUsers() {
  loginSection.classList.add("hidden");
  usersSection.classList.remove("hidden");
  await loadUsers();
}

async function loadUsers() {
  const response = await api("/api/admin/users");
  const body = await response.json();
  if (!response.ok) return setMessage(body.error || "加载失败");
  const rows = body.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${user.enabled ? "启用" : "禁用"}</td>
      <td>
        <button data-enable="${user.id}" data-value="${!user.enabled}">${user.enabled ? "禁用" : "启用"}</button>
        <button data-reset="${user.id}">重置密码</button>
      </td>
    </tr>
  `).join("");
  document.querySelector("#user-list").innerHTML = rows;
  document.querySelectorAll("[data-enable]").forEach((button) => button.addEventListener("click", toggleUser));
  document.querySelectorAll("[data-reset]").forEach((button) => button.addEventListener("click", resetPassword));
}

async function createUser() {
  const response = await api("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      username: document.querySelector("#new-username").value,
      password: document.querySelector("#new-password").value,
      role: document.querySelector("#new-role").value,
    }),
  });
  const body = await response.json();
  if (!response.ok) return setMessage(body.error || "创建失败");
  setMessage(`已创建用户 ${body.username}`);
  await loadUsers();
}

async function toggleUser(event) {
  const button = event.currentTarget;
  const response = await api(`/api/admin/users/${button.dataset.enable}/enabled`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: button.dataset.value === "true" }),
  });
  if (!response.ok) return setMessage("更新状态失败");
  await loadUsers();
}

async function resetPassword(event) {
  const password = prompt("输入新密码，至少 8 位");
  if (!password) return;
  const response = await api(`/api/admin/users/${event.currentTarget.dataset.reset}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
  if (!response.ok) return setMessage("重置密码失败");
  setMessage("密码已重置");
}

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function setMessage(value) {
  message.textContent = value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
```

- [ ] **Step 3: Manual UI check**

Run:

```bash
cd cloudflare-webdav
npm run dev
```

Expected: Worker starts locally. Serve `pages-admin` with a static server or deploy it to Pages after Worker deployment.

## Task 11: Bootstrap Admin

**Files:**
- Create: `cloudflare-webdav/src/bootstrap.ts`
- Modify: `cloudflare-webdav/src/index.ts`
- Update: `cloudflare-webdav/src/env.ts`
- Update: `cloudflare-webdav/wrangler.jsonc`
- Update: `cloudflare-webdav/README.md`

- [ ] **Step 1: Add bootstrap env vars**

Modify `cloudflare-webdav/src/env.ts`:

```ts
export interface Env {
  DB: D1Database;
  FILES: KVNamespace;
  MAX_FILE_BYTES: string;
  SESSION_TTL_SECONDS: string;
  BOOTSTRAP_TOKEN?: string;
}
```

Add to `cloudflare-webdav/README.md`:

```md
## Initial Admin

Set a one-time bootstrap token as a Worker secret:

```bash
wrangler secret put BOOTSTRAP_TOKEN
```

Then create the first admin:

```bash
curl -X POST https://your-worker.example.workers.dev/api/bootstrap/admin \
  -H "authorization: Bearer YOUR_BOOTSTRAP_TOKEN" \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"change-this-password"}'
```
```

- [ ] **Step 2: Implement bootstrap endpoint**

Create `cloudflare-webdav/src/bootstrap.ts`:

```ts
import type { Env } from "./env";
import { createPasswordHash } from "./auth";
import { jsonResponse } from "./http";
import { createUser, findUserByUsername, listUsers } from "./repositories/users";

export async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
  const header = request.headers.get("authorization");
  const expected = env.BOOTSTRAP_TOKEN;
  if (!expected || header !== `Bearer ${expected}`) return jsonResponse({ error: "Unauthorized" }, 401);

  const existingUsers = await listUsers(env.DB);
  if (existingUsers.some((user) => user.role === "admin")) {
    return jsonResponse({ error: "Admin already exists" }, 409);
  }

  const body = await request.json<{ username: string; password: string }>();
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(body.username) || body.password.length < 8) {
    return jsonResponse({ error: "Invalid username or password" }, 400);
  }
  if (await findUserByUsername(env.DB, body.username)) {
    return jsonResponse({ error: "Username already exists" }, 409);
  }
  const user = await createUser(env.DB, {
    username: body.username,
    passwordHash: await createPasswordHash(body.password),
    role: "admin",
  });
  return jsonResponse({ id: user.id, username: user.username, role: user.role }, 201);
}
```

- [ ] **Step 3: Wire bootstrap endpoint**

Modify `cloudflare-webdav/src/index.ts`:

```ts
import type { Env } from "./env";
import { handleAdmin } from "./admin/handler";
import { handleBootstrap } from "./bootstrap";
import { jsonResponse, textResponse } from "./http";
import { handleWebDav } from "./webdav/handler";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/bootstrap/admin") {
      return handleBootstrap(request, env);
    }

    if (url.pathname.startsWith("/dav")) {
      return handleWebDav(request, env);
    }

    if (url.pathname.startsWith("/api/admin")) {
      return handleAdmin(request, env);
    }

    return textResponse("Not Found", 404);
  },
};
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
```

Expected: PASS.

## Task 12: Verification And Docs

**Files:**
- Update: `cloudflare-webdav/README.md`

- [ ] **Step 1: Add curl WebDAV examples**

Append to `cloudflare-webdav/README.md`:

```md
## WebDAV Smoke Test

```bash
BASE="http://localhost:8787"
AUTH="alice:password123"

curl -i -u "$AUTH" -X MKCOL "$BASE/dav/app/"
curl -i -u "$AUTH" -X PUT "$BASE/dav/app/config.json" \
  -H "content-type: application/json" \
  --data '{"ok":true}'
curl -i -u "$AUTH" -X PROPFIND "$BASE/dav/" -H "Depth: 1"
curl -i -u "$AUTH" "$BASE/dav/app/config.json"
curl -i -u "$AUTH" -X DELETE "$BASE/dav/app/config.json"
```
```

- [ ] **Step 2: Run full checks**

Run:

```bash
cd cloudflare-webdav
npm run typecheck
npm test
```

Expected: TypeScript and Vitest pass.

- [ ] **Step 3: Run Wrangler validation**

Run:

```bash
cd cloudflare-webdav
npx wrangler check
```

Expected: Wrangler validates the configuration after real D1 and KV IDs replace placeholders.

- [ ] **Step 4: Manual WebDAV smoke test**

Run:

```bash
cd cloudflare-webdav
npm run dev
```

In another terminal, create an admin through bootstrap, create a normal user through `/api/admin/users`, then run the README WebDAV smoke test.

Expected: `MKCOL` returns `201`, `PUT` returns `201`, `PROPFIND` returns `207`, `GET` returns file content, and `DELETE` returns `204`.

## Self-Review

- Spec coverage: The plan covers D1 users/sessions/metadata, KV file bodies, admin user creation, WebDAV Basic Auth, supported WebDAV methods, 20 MB upload rejection, bootstrap admin creation, and deployment docs.
- Unsupported WebDAV methods are explicitly handled as `501` in Task 8.
- D1-only storage is avoided; R2 is not required.
- The admin UI is intentionally scoped to user management, matching the first-version design.
- Current workspace is not a git repository, so commit steps are omitted from task checklists even though the writing-plans skill normally recommends frequent commits.

