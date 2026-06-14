const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && !url.pathname.startsWith("/dav")) {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 500, request);
      if (!env.KV) return json({ error: "KV binding KV is not configured" }, 500, request);

      if (url.pathname === "/health") {
        return json({ ok: true }, 200, request);
      }

      if (url.pathname.startsWith("/api/admin")) {
        return withCors(await handleAdmin(request, env, url), request);
      }

      if (url.pathname.startsWith("/dav")) {
        return withCors(await handleWebDav(request, env, url), request);
      }

      if (request.method === "GET" || request.method === "HEAD") {
        return env.ASSETS.fetch(request);
      }

      return withCors(text("Not Found", 404), request);
    } catch (error) {
      console.error(error);
      return json({ error: "Internal Error" }, 500, request);
    }
  },
};

async function handleAdmin(request, env, url) {
  const path = url.pathname.replace(/^\/api\/admin/, "") || "/";

  if (request.method === "POST" && path === "/login") {
    const body = await readJson(request);
    const rateLimit = await checkLoginRateLimit(env, request, String(body.username || ""));
    if (!rateLimit.ok) return json({ error: "Too many login attempts" }, 429, request);

    if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
      await recordFailedLogin(env, request, String(body.username || ""));
      return json({ error: "Invalid credentials" }, 401, request);
    }
    await clearFailedLogin(env, request, String(body.username || ""));
    const token = await signJwt({ sub: body.username, role: "admin" }, env.JWT_SECRET, Number(env.SESSION_TTL_SECONDS || "43200"));
    return json({ token }, 200, request);
  }

  const admin = await requireAdmin(request, env);
  if (!admin.ok) return json({ error: admin.error }, admin.status, request);

  if (request.method === "GET" && path === "/users") {
    const result = await env.DB.prepare(
      "SELECT id, username, role, enabled, created_at, updated_at FROM users ORDER BY username ASC",
    ).all();
    return json({
      users: result.results
        .filter((user) => !isInternalAdminFileUsername(user.username))
        .map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          enabled: user.enabled === 1,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        })),
    }, 200, request);
  }

  if (request.method === "GET" && path === "/files") {
    return adminListFiles(env, url, request, admin.username);
  }

  if (request.method === "DELETE" && path === "/files") {
    return adminDeleteEntry(env, url, request, admin.username);
  }

  if (request.method === "GET" && path === "/files/download") {
    return adminDownloadFile(env, url, admin.username);
  }

  if (request.method === "POST" && path === "/files/folders") {
    return adminCreateFolder(request, env, admin.username);
  }

  if (request.method === "POST" && path === "/users") {
    const body = await readJson(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = body.role === "admin" ? "admin" : "user";

    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
      return json({ error: "Invalid username" }, 400, request);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400, request);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    ).bind(id, username, await hashPassword(password), role, now, now).run();

    return json({ id, username, role, enabled: true, createdAt: now, updatedAt: now }, 201, request);
  }

  const enabledMatch = path.match(/^\/users\/([^/]+)\/enabled$/);
  if (request.method === "PATCH" && enabledMatch) {
    const body = await readJson(request);
    await env.DB.prepare("UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?")
      .bind(body.enabled ? 1 : 0, new Date().toISOString(), enabledMatch[1])
      .run();
    return json({ ok: true }, 200, request);
  }

  const passwordMatch = path.match(/^\/users\/([^/]+)\/password$/);
  if (request.method === "PATCH" && passwordMatch) {
    const body = await readJson(request);
    const password = String(body.password || "");
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400, request);
    }
    await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(password), new Date().toISOString(), passwordMatch[1])
      .run();
    return json({ ok: true }, 200, request);
  }

  return text("Method Not Allowed", 405, { allow: "GET, POST, PATCH" });
}

async function adminListFiles(env, url, request, adminUsername) {
  if (url.searchParams.has("userId")) return json({ error: "Admin can only access own files" }, 400, request);
  const path = normalizeAdminFilePath(url.searchParams.get("path") || "/");
  if (!path.ok) return json({ error: path.message }, path.status, request);

  const user = await ensureAdminFileUser(env.DB, adminUsername);

  await ensureRoot(env.DB, user.id);
  const node = await getNode(env.DB, user.id, path.path);
  if (!node || node.kind !== "directory") return json({ error: "Directory not found" }, 404, request);

  const result = await env.DB.prepare(
    `SELECT * FROM nodes
     WHERE owner_user_id = ?
       AND path != ?
     ORDER BY kind ASC, path ASC`,
  ).bind(user.id, path.path).all();

  const files = result.results
    .filter((item) => isDirectChild(path.path, item.path))
    .sort(sortNodes)
    .map(fileSummary);

  return json({ user, path: path.path, files }, 200, request);
}

async function adminDownloadFile(env, url, adminUsername) {
  if (url.searchParams.has("userId")) return json({ error: "Admin can only access own files" }, 400);
  const path = normalizeAdminFilePath(url.searchParams.get("path") || "/");
  if (!path.ok) return json({ error: path.message }, path.status);

  const user = await ensureAdminFileUser(env.DB, adminUsername);

  const node = await getNode(env.DB, user.id, path.path);
  if (!node || node.kind !== "file" || !node.kv_key) return text("Not Found", 404);

  const file = await env.KV.get(node.kv_key, "arrayBuffer");
  if (!file) return text("Not Found", 404);

  return new Response(file, {
    headers: {
      "content-type": node.mime_type || "application/octet-stream",
      "content-length": String(node.size || file.byteLength),
      "content-disposition": `attachment; filename="${contentDispositionFilename(nameFromPath(node.path))}"`,
      etag: node.etag || "",
    },
  });
}

async function adminDeleteEntry(env, url, request, adminUsername) {
  if (url.searchParams.has("userId")) return json({ error: "Admin can only access own files" }, 400, request);
  const path = normalizeAdminFilePath(url.searchParams.get("path") || "/");
  if (!path.ok) return json({ error: path.message }, path.status, request);

  const user = await ensureAdminFileUser(env.DB, adminUsername);
  return deleteEntry(env, user.id, path.path);
}

async function adminCreateFolder(request, env, adminUsername) {
  const body = await readJson(request);
  const path = normalizeAdminFilePath(body.path || "/");
  if (!path.ok) return json({ error: path.message }, path.status, request);
  if (path.path === "/" || !path.path.endsWith("/")) return json({ error: "Invalid folder path" }, 400, request);

  const user = await ensureAdminFileUser(env.DB, adminUsername);
  await ensureRoot(env.DB, user.id);

  const parent = await getNode(env.DB, user.id, parentPath(path.path));
  if (!parent || parent.kind !== "directory") return json({ error: "Parent directory not found" }, 409, request);
  if (await getNode(env.DB, user.id, path.path)) return json({ error: "Folder already exists" }, 409, request);

  await createDirectory(env.DB, user.id, path.path);
  return json({
    path: path.path,
    file: {
      name: nameFromPath(path.path),
      path: path.path,
      type: "directory",
      size: 0,
      modified: new Date().toISOString(),
    },
  }, 201, request);
}

async function handleWebDav(request, env, url) {
  if (request.method === "OPTIONS") {
    return webDavOptions(request);
  }

  const auth = parseBasicAuth(request.headers.get("authorization"));
  if (!auth) return unauthorized(request);

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND enabled = 1")
    .bind(auth.username)
    .first();
  if (!user || !(await verifyPassword(auth.password, user.password_hash))) {
    return unauthorized(request);
  }

  await ensureRoot(env.DB, user.id);
  const path = normalizeDavPath(url.pathname);
  if (!path.ok) return text(path.message, path.status);

  if (request.method === "PROPFIND") {
    return propfind(env, user.id, path.path, request.headers.get("depth") || "1", url.origin);
  }
  if (request.method === "GET" || request.method === "HEAD") {
    return getFile(env, user.id, path.path, request.method === "HEAD", url.origin);
  }
  if (request.method === "PUT") {
    return putFile(request, env, user.id, path.path);
  }
  if (request.method === "MKCOL") {
    return makeCollection(env, user.id, path.path);
  }
  if (request.method === "DELETE") {
    return deleteEntry(env, user.id, path.path);
  }

  return text("Not Implemented", 501);
}

function webDavOptions(request) {
  return withCors(new Response(null, {
    status: 204,
    headers: {
      allow: "OPTIONS, PROPFIND, GET, HEAD, PUT, MKCOL, DELETE",
      dav: "1",
    },
  }), request);
}

async function propfind(env, userId, path, depth, origin) {
  const node = await getNode(env.DB, userId, path);
  if (!node) return text("Not Found", 404);

  const nodes = [node];
  if (depth !== "0" && node.kind === "directory") {
    const result = await env.DB.prepare(
      `SELECT * FROM nodes
       WHERE owner_user_id = ?
         AND path != ?
       ORDER BY kind ASC, path ASC`,
    ).bind(userId, path).all();
    nodes.push(...result.results.filter((item) => isDirectChild(path, item.path)));
  }

  return new Response(davMultistatus(nodes, origin), {
    status: 207,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      dav: "1",
    },
  });
}

async function getFile(env, userId, path, headOnly, origin = "") {
  const node = await getNode(env.DB, userId, path);
  if (node?.kind === "directory") return redirectToDirectoryPath(path, origin);
  if (!node || node.kind !== "file" || !node.kv_key) return text("Not Found", 404);
  const file = await env.KV.get(node.kv_key, "arrayBuffer");
  if (!file) return text("Not Found", 404);
  return new Response(headOnly ? null : file, {
    headers: {
      "content-type": node.mime_type || "application/octet-stream",
      "content-length": String(node.size || file.byteLength),
      etag: node.etag || "",
    },
  });
}

function redirectToDirectoryPath(path, origin) {
  const href = `${origin}/dav${path === "/" ? "/" : path}`;
  return new Response(null, {
    status: 301,
    headers: { location: href },
  });
}

async function putFile(request, env, userId, path) {
  if (path === "/" || path.endsWith("/")) return text("Conflict", 409);
  const maxBytes = Number(env.MAX_FILE_BYTES || "20971520");
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);
  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength < 0) {
    return text("Length Required", 411);
  }
  if (contentLength > maxBytes) return text("File too large", 413);

  await ensureParentDirectories(env.DB, userId, path);

  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) return text("File too large", 413);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const key = `users/${userId}${path}`;
  const etag = `"${await sha256HexBytes(new Uint8Array(body))}"`;
  await env.KV.put(key, body);
  await env.DB.prepare(
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
    id,
    userId,
    path,
    key,
    request.headers.get("content-type") || "application/octet-stream",
    body.byteLength,
    etag,
    now,
    now,
  ).run();

  return text("Created", 201, { etag });
}

async function makeCollection(env, userId, path) {
  const dir = path.endsWith("/") ? path : `${path}/`;
  if (dir === "/") return text("Method Not Allowed", 405);
  const parent = await getNode(env.DB, userId, parentPath(dir));
  if (!parent || parent.kind !== "directory") return text("Conflict", 409);
  if (await getNode(env.DB, userId, dir)) return text("Method Not Allowed", 405);
  await createDirectory(env.DB, userId, dir);
  return text("Created", 201);
}

async function deleteEntry(env, userId, path) {
  if (path === "/") return text("Method Not Allowed", 405);
  const node = await getNode(env.DB, userId, path);
  if (!node) return text("Not Found", 404);

  if (node.kind === "directory") {
    const result = await env.DB.prepare("SELECT id, path FROM nodes WHERE owner_user_id = ? AND path != ?")
      .bind(userId, path)
      .all();
    const descendantPaths = result.results
      .filter((item) => isDescendant(path, item.path))
      .map((item) => item.path);
    for (const childPath of descendantPaths) {
      const child = await getNode(env.DB, userId, childPath);
      if (child?.kind === "file" && child.kv_key) await env.KV.delete(child.kv_key);
      await env.DB.prepare("DELETE FROM nodes WHERE owner_user_id = ? AND path = ?").bind(userId, childPath).run();
    }
  }

  if (node.kind === "file" && node.kv_key) {
    await env.KV.delete(node.kv_key);
  }
  await env.DB.prepare("DELETE FROM nodes WHERE owner_user_id = ? AND path = ?").bind(userId, path).run();
  return new Response(null, { status: 204 });
}

async function ensureRoot(db, userId) {
  if (!(await getNode(db, userId, "/"))) {
    await createDirectory(db, userId, "/");
  }
}

async function ensureParentDirectories(db, userId, path) {
  await ensureRoot(db, userId);
  const parts = parentPath(path).split("/").filter(Boolean);
  let current = "/";
  for (const part of parts) {
    current = `${current}${part}/`;
    if (!(await getNode(db, userId, current))) {
      await createDirectory(db, userId, current);
    }
  }
}

async function createDirectory(db, userId, path) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO nodes (id, owner_user_id, path, kind, size, created_at, updated_at)
     VALUES (?, ?, ?, 'directory', 0, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, path, now, now).run();
}

function getNode(db, userId, path) {
  return db.prepare("SELECT * FROM nodes WHERE owner_user_id = ? AND path = ?").bind(userId, path).first();
}

function getUserSummary(db, userId) {
  return db.prepare("SELECT id, username FROM users WHERE id = ?").bind(userId).first();
}

function getUserSummaryByUsername(db, username) {
  return db.prepare("SELECT id, username, role FROM users WHERE username = ?").bind(username).first();
}

async function ensureAdminFileUser(db, username) {
  const existingAdmin = await getUserSummaryByUsername(db, username);
  if (existingAdmin?.role === "admin") return { id: existingAdmin.id, username };

  const internalUsername = adminFileUsername(username);
  let user = await getUserSummaryByUsername(db, internalUsername);
  if (user) return { id: user.id, username };

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO users (id, username, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?)",
  ).bind(id, internalUsername, "external-admin-file-owner", now, now).run();
  user = { id, username };
  await ensureRoot(db, id);
  return user;
}

async function requireAdmin(request, env) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return { ok: false, status: 401, error: "Unauthorized" };
  const payload = await verifyJwt(header.slice("Bearer ".length), env.JWT_SECRET);
  if (!payload || payload.role !== "admin") return { ok: false, status: 403, error: "Forbidden" };
  if (!env.ADMIN_USERNAME || payload.sub !== env.ADMIN_USERNAME) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, username: String(payload.sub || "") };
}

async function checkLoginRateLimit(env, request, username) {
  const key = loginRateLimitKey(request, username);
  const attempts = Number(await env.KV.get(key)) || 0;
  return { ok: attempts < 5 };
}

async function recordFailedLogin(env, request, username) {
  const key = loginRateLimitKey(request, username);
  const attempts = (Number(await env.KV.get(key)) || 0) + 1;
  await env.KV.put(key, String(attempts), { expirationTtl: 600 });
}

async function clearFailedLogin(env, request, username) {
  await env.KV.delete(loginRateLimitKey(request, username));
}

function loginRateLimitKey(request, username) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  return `rate-limit/admin-login/${ip}/${String(username || "").slice(0, 128)}`;
}

function parseBasicAuth(header) {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivePassword(password, salt);
  return `pbkdf2-sha256:100000:${toBase64(salt)}:${toBase64(bits)}`;
}

async function verifyPassword(password, hash) {
  const parts = String(hash || "").split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") return false;
  const actual = await derivePassword(password, fromBase64(parts[2]), Number(parts[1]));
  return timingSafeEqual(actual, fromBase64(parts[3]));
}

async function derivePassword(password, salt, iterations = 100000) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function signJwt(payload, secret, ttlSeconds) {
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const data = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(data);
  const signature = await hmacSha256(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

async function verifyJwt(token, secret) {
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = await hmacSha256(`${parts[0]}.${parts[1]}`, secret);
  if (!timingSafeEqual(encoder.encode(expected), encoder.encode(parts[2]))) return null;
  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(parts[1])));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hmacSha256(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

async function sha256HexBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeDavPath(pathname) {
  const raw = pathname.replace(/^\/dav/, "") || "/";
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { ok: false, status: 400, message: "Invalid path" };
  }
  return normalizePathValue(decoded);
}

function normalizeAdminFilePath(value) {
  return normalizePathValue(String(value || "/"));
}

function normalizePathValue(decoded) {
  if (!decoded.startsWith("/")) decoded = `/${decoded}`;
  if (/[\u0000-\u001F\u007F]/u.test(decoded)) return { ok: false, status: 400, message: "Invalid path" };
  const trailing = decoded.endsWith("/");
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    return { ok: false, status: 400, message: "Invalid path" };
  }
  const normalized = `/${parts.join("/")}`;
  if (normalized === "/") return { ok: true, path: "/" };
  return { ok: true, path: trailing ? `${normalized}/` : normalized };
}

function parentPath(path) {
  if (path === "/") return "/";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const index = trimmed.lastIndexOf("/");
  return index <= 0 ? "/" : `${trimmed.slice(0, index)}/`;
}

function isDirectChild(parent, child) {
  if (child === parent || !child.startsWith(parent)) return false;
  const rest = parent === "/" ? child.slice(1) : child.slice(parent.length);
  const trimmed = rest.endsWith("/") ? rest.slice(0, -1) : rest;
  return trimmed.length > 0 && !trimmed.includes("/");
}

function isDescendant(parent, child) {
  return parent !== "/" && child.startsWith(parent);
}

function adminFileUsername(username) {
  const safe = String(username || "admin").replaceAll(":", "_");
  return `__cloudflare_webdav_admin__:${safe}`;
}

function isInternalAdminFileUsername(username) {
  return String(username || "").startsWith("__cloudflare_webdav_admin__:");
}

function fileSummary(node) {
  return {
    name: nameFromPath(node.path),
    path: node.kind === "directory" ? ensureDirectoryPath(node.path) : node.path,
    type: node.kind,
    size: Number(node.size || 0),
    modified: node.updated_at,
  };
}

function sortNodes(left, right) {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.path.localeCompare(right.path);
}

function nameFromPath(path) {
  if (path === "/") return "";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function ensureDirectoryPath(path) {
  if (path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function contentDispositionFilename(value) {
  return String(value || "download").replace(/[\\"]/g, "_");
}

function davMultistatus(nodes, origin) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${nodes.map((node) => davResponse(node, origin)).join("")}</D:multistatus>`;
}

function davResponse(node, origin) {
  const href = `${origin}/dav${node.path === "/" ? "/" : encodeURI(node.path)}`;
  const collection = node.kind === "directory" ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>";
  return `<D:response><D:href>${escapeXml(href)}</D:href><D:propstat><D:prop>${collection}<D:getcontentlength>${node.size || 0}</D:getcontentlength><D:getlastmodified>${new Date(node.updated_at).toUTCString()}</D:getlastmodified></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
}

function unauthorized(request) {
  if (request.headers.get("x-webdav-web") === "1") {
    return text("Unauthorized", 401);
  }
  return text("Unauthorized", 401, { "www-authenticate": 'Basic realm="Cloudflare WebDAV"' });
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 65536) throw new Error("JSON request body is too large");
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function json(body, status = 200, request) {
  return withCors(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  }), request);
}

function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}

function withCors(response, request) {
  if (!request) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return {};
  const allowOrigin = origin || requestOrigin;
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, HEAD, POST, PATCH, PUT, DELETE, MKCOL, PROPFIND, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, depth, x-webdav-web",
    "access-control-expose-headers": "etag, dav, content-length",
    vary: "Origin",
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function base64UrlJson(value) {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(bytes) {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64(value) {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return fromBase64(padded);
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[char]);
}
