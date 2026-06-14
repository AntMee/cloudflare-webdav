import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("admin can list a user's direct file children", async () => {
  const env = createTestEnv();
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files?userId=user-1&path=%2FDouyinBackup%2F", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.user, { id: "user-1", username: "123456" });
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

test("admin can download a user's file from KV", async () => {
  const env = createTestEnv();
  const token = await adminToken(env);

  const response = await worker.fetch(new Request("https://example.test/api/admin/files/download?userId=user-1&path=%2FDouyinBackup%2Fconfig_backup.json", {
    headers: { authorization: `Bearer ${token}` },
  }), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(response.headers.get("content-length"), "18");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="config_backup.json"');
  assert.equal(await response.text(), '{"ok":true}');
});

async function adminToken(env) {
  const response = await worker.fetch(new Request("https://example.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "password" }),
  }), env);
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function createTestEnv() {
  const users = [
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
  const nodes = [
    node("/", "directory"),
    node("/DouyinBackup/", "directory"),
    node("/DouyinBackup/config_backup.json", "file", {
      kv_key: "users/user-1/DouyinBackup/config_backup.json",
      mime_type: "application/json",
      size: 18,
      etag: '"test"',
    }),
    node("/DouyinBackup/SubFolder/", "directory"),
    node("/DouyinBackup/SubFolder/nested.json", "file", {
      kv_key: "users/user-1/DouyinBackup/SubFolder/nested.json",
      mime_type: "application/json",
      size: 2,
    }),
  ];

  return {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "password",
    JWT_SECRET: "test-secret",
    SESSION_TTL_SECONDS: "43200",
    DB: new FakeD1({ users, nodes }),
    KV: {
      async get(key, type) {
        assert.equal(type, "arrayBuffer");
        if (key !== "users/user-1/DouyinBackup/config_backup.json") return null;
        return new TextEncoder().encode('{"ok":true}').buffer;
      },
    },
    ASSETS: { fetch: () => new Response("Not Found", { status: 404 }) },
  };
}

function node(path, kind, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    owner_user_id: "user-1",
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
    return {};
  }
}
