import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("admin can list only the admin account's file children", async () => {
  const env = createTestEnv();
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files?path=%2FDouyinBackup%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.user, { id: "admin-user", username: "admin" });
  assert.equal(body.path, "/DouyinBackup/");
  assert.deepEqual(body.files.map((file) => ({
    name: file.name,
    path: file.path,
    type: file.type,
    size: file.size,
  })), [
    { name: "SubFolder", path: "/DouyinBackup/SubFolder/", type: "directory", size: 0 },
    { name: "config_backup.json", path: "/DouyinBackup/config_backup.json", type: "file", size: 18 },
  ]);
});

test("admin can download only the admin account's file from KV", async () => {
  const env = createTestEnv();
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files/download?path=%2FDouyinBackup%2Fconfig_backup.json", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("content-length"), "18");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="config_backup.json"');
  assert.equal(await response.text(), '{"ok":true}');
});

test("admin file API rejects userId override", async () => {
  const env = createTestEnv();
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files?userId=user-1&path=%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 400);
});

test("admin file API creates the admin account file space when missing", async () => {
  const env = createTestEnv({ includeAdminUser: false, includeAdminFiles: false });
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files?path=%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.username, "admin");
  assert.equal(body.path, "/");
  assert.deepEqual(body.files, []);
});

test("admin file API uses the configured admin username as the owner", async () => {
  const env = createTestEnv({ adminUsername: "owner-admin", includeAdminUser: false, includeAdminFiles: false });
  const token = await adminToken(env, { username: "owner-admin" });

  const response = await worker.fetch(new Request("https://example.test/api/admin/files?path=%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.username, "owner-admin");
});

test("admin can create a folder in the admin account's file space", async () => {
  const env = createTestEnv({ includeAdminFiles: false });
  const token = await adminToken(env);

  const createResponse = await worker.fetch(new Request("https://example.test/api/admin/files/folders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ path: "/AdminFolder/" }),
  }), env);

  assert.equal(createResponse.status, 201);
  const createBody = await createResponse.json();
  assert.equal(createBody.path, "/AdminFolder/");

  const listResponse = await worker.fetch(new Request("https://example.test/api/admin/files?path=%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);
  assert.equal(listResponse.status, 200);

  const listBody = await listResponse.json();
  assert.deepEqual(listBody.files.map((file) => ({
    name: file.name,
    path: file.path,
    type: file.type,
  })), [
    { name: "AdminFolder", path: "/AdminFolder/", type: "directory" },
  ]);
});

async function adminToken(env, { username = "admin", password = "password" } = {}) {
  const response = await worker.fetch(new Request("https://example.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  }), env);
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function createTestEnv({ adminUsername = "admin", includeAdminUser = true, includeAdminFiles = true } = {}) {
  const users = [
    ...(includeAdminUser ? [{
      id: "admin-user",
      username: adminUsername,
      password_hash: "unused",
      role: "admin",
      enabled: 1,
      created_at: "2026-06-14T01:00:00.000Z",
      updated_at: "2026-06-14T01:59:00.000Z",
    }] : []),
    {
      id: "user-1",
      username: "123456",
      password_hash: "unused",
      role: "user",
      enabled: 1,
      created_at: "2026-06-14T01:00:00.000Z",
      updated_at: "2026-06-14T01:59:00.000Z",
    },
  ];
  const nodes = includeAdminFiles ? [
    node("/", "directory"),
    node("/DouyinBackup/", "directory"),
    node("/DouyinBackup/config_backup.json", "file", {
      kv_key: "users/admin-user/DouyinBackup/config_backup.json",
      mime_type: "application/json",
      size: 18,
      etag: '"test"',
    }),
    node("/DouyinBackup/SubFolder/", "directory"),
    node("/DouyinBackup/SubFolder/nested.json", "file", {
      kv_key: "users/admin-user/DouyinBackup/SubFolder/nested.json",
      mime_type: "application/json",
      size: 2,
    }),
    node("/OtherUserOnly/", "directory", { owner_user_id: "user-1" }),
  ] : [];

  return {
    ADMIN_USERNAME: adminUsername,
    ADMIN_PASSWORD: "password",
    JWT_SECRET: "test-secret",
    SESSION_TTL_SECONDS: "43200",
    DB: new FakeD1({ users, nodes }),
    KV: {
      async get(key, type) {
        assert.equal(type, "arrayBuffer");
        if (key !== "users/admin-user/DouyinBackup/config_backup.json") return null;
        return new TextEncoder().encode('{"ok":true}').buffer;
      },
    },
    ASSETS: { fetch: () => new Response("Not Found", { status: 404 }) },
  };
}

function node(path, kind, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    owner_user_id: "admin-user",
    path,
    kind,
    kv_key: null,
    mime_type: null,
    size: 0,
    etag: null,
    created_at: "2026-06-14T01:00:00.000Z",
    updated_at: "2026-06-14T02:12:00.000Z",
    ...overrides,
  };
}

class FakeD1 {
  constructor(data) {
    this.data = data;
  }

  prepare(sql) {
    return new FakeStatement(this.data, sql);
  }
}

class FakeStatement {
  constructor(data, sql) {
    this.data = data;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    if (this.sql.includes("SELECT * FROM users WHERE username = ?")) {
      return this.data.users.find((user) => user.username === this.params[0] && user.enabled === 1) || null;
    }
    if (this.sql.includes("SELECT id, username FROM users WHERE id = ?")) {
      const user = this.data.users.find((item) => item.id === this.params[0]);
      return user ? { id: user.id, username: user.username } : null;
    }
    if (this.sql.includes("SELECT id, username FROM users WHERE username = ?")) {
      const user = this.data.users.find((item) => item.username === this.params[0]);
      return user ? { id: user.id, username: user.username } : null;
    }
    if (this.sql.includes("SELECT * FROM nodes WHERE owner_user_id = ? AND path = ?")) {
      return this.data.nodes.find((node) => node.owner_user_id === this.params[0] && node.path === this.params[1]) || null;
    }
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.includes("SELECT * FROM nodes")) {
      return {
        results: this.data.nodes
          .filter((node) => node.owner_user_id === this.params[0] && node.path !== this.params[1])
          .sort((a, b) => a.path.localeCompare(b.path)),
      };
    }
    throw new Error(`Unhandled all SQL: ${this.sql}`);
  }

  async run() {
    if (this.sql.includes("INSERT INTO users")) {
      const role = this.sql.includes("'admin'") ? "admin" : this.params[3];
      const createdAt = this.sql.includes("'admin'") ? this.params[3] : this.params[4];
      const updatedAt = this.sql.includes("'admin'") ? this.params[4] : this.params[5];
      this.data.users.push({
        id: this.params[0],
        username: this.params[1],
        password_hash: this.params[2],
        role,
        enabled: 1,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return {};
    }
    if (this.sql.includes("INSERT INTO nodes")) {
      this.data.nodes.push({
        id: this.params[0],
        owner_user_id: this.params[1],
        path: this.params[2],
        kind: "directory",
        kv_key: null,
        mime_type: null,
        size: 0,
        etag: null,
        created_at: this.params[3],
        updated_at: this.params[4],
      });
      return {};
    }
    return {};
  }
}
