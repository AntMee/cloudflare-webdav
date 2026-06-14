const state = {
  adminToken: sessionStorage.getItem("webdavAdminToken") || "",
  userAuth: sessionStorage.getItem("webdavUserAuth") || "",
  username: sessionStorage.getItem("webdavUsername") || "",
  currentPath: "/",
  adminCurrentPath: "/",
  adminPanel: "users",
  files: [],
  adminFiles: [],
  users: [],
};

const elements = {
  loginView: document.querySelector("#login-view"),
  loginForm: document.querySelector("#login-form"),
  adminView: document.querySelector("#admin-view"),
  filesView: document.querySelector("#files-view"),
  adminUsersTab: document.querySelector("#admin-users-tab"),
  adminFilesTab: document.querySelector("#admin-files-tab"),
  adminUsersPanel: document.querySelector("#admin-users-panel"),
  adminFilesPanel: document.querySelector("#admin-files-panel"),
  createUserForm: document.querySelector("#create-user-form"),
  refreshUsers: document.querySelector("#refresh-users"),
  adminLogoutButton: document.querySelector("#admin-logout-button"),
  userSearch: document.querySelector("#user-search"),
  userList: document.querySelector("#user-list"),
  userEmptyState: document.querySelector("#user-empty-state"),
  adminBackFolder: document.querySelector("#admin-back-folder"),
  adminRefreshFiles: document.querySelector("#admin-refresh-files"),
  adminFileBreadcrumbs: document.querySelector("#admin-file-breadcrumbs"),
  adminFileSearch: document.querySelector("#admin-file-search"),
  adminFileList: document.querySelector("#admin-file-list"),
  adminFileEmptyState: document.querySelector("#admin-file-empty-state"),
  refreshFiles: document.querySelector("#refresh-files"),
  backFolder: document.querySelector("#back-folder"),
  userLogoutButton: document.querySelector("#user-logout-button"),
  fileInput: document.querySelector("#file-input"),
  folderForm: document.querySelector("#folder-form"),
  folderName: document.querySelector("#folder-name"),
  createFolderButton: document.querySelector("#create-folder-button"),
  fileSearch: document.querySelector("#file-search"),
  fileList: document.querySelector("#file-list"),
  emptyState: document.querySelector("#empty-state"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  toast: document.querySelector("#toast"),
};

elements.loginForm.addEventListener("submit", handleLogin);
elements.createUserForm.addEventListener("submit", handleCreateUser);
elements.refreshUsers.addEventListener("click", refreshAdminView);
elements.adminLogoutButton.addEventListener("click", logout);
elements.adminUsersTab.addEventListener("click", () => showAdminPanel("users"));
elements.adminFilesTab.addEventListener("click", () => showAdminPanel("files"));
elements.userSearch.addEventListener("input", renderUsers);
elements.adminBackFolder.addEventListener("click", goBackAdminFolder);
elements.adminRefreshFiles.addEventListener("click", () => loadAdminDirectory(state.adminCurrentPath));
elements.adminFileSearch.addEventListener("input", renderAdminFiles);
elements.refreshFiles.addEventListener("click", () => loadDirectory(state.currentPath));
elements.backFolder.addEventListener("click", goBackFolder);
elements.userLogoutButton.addEventListener("click", logout);
elements.fileInput.addEventListener("change", handleUpload);
elements.folderForm.addEventListener("submit", handleCreateFolder);
elements.folderName.addEventListener("invalid", () => showToast("请输入文件夹名称", true));
elements.fileSearch.addEventListener("input", renderFiles);

if (state.adminToken) {
  showAdminView();
  loadUsers();
} else if (state.userAuth) {
  showFilesView();
  loadDirectory("/");
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(elements.loginForm);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");

  if (!username || !password) {
    showToast("请输入用户名和密码", true);
    return;
  }

  const adminLoggedIn = await tryAdminLogin(username, password);
  if (adminLoggedIn) return;

  await tryUserLogin(username, password);
}

async function tryAdminLogin(username, password) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) return false;

  const body = await response.json();
  state.adminToken = body.token;
  sessionStorage.setItem("webdavAdminToken", state.adminToken);
  sessionStorage.removeItem("webdavUserAuth");
  sessionStorage.removeItem("webdavUsername");
  elements.loginForm.reset();
  showAdminView();
  await loadUsers();
  showToast("管理员登录成功");
  return true;
}

async function tryUserLogin(username, password) {
  state.userAuth = `Basic ${btoa(`${username}:${password}`)}`;
  state.username = username;

  try {
    await propfind("/", 0);
    sessionStorage.setItem("webdavUserAuth", state.userAuth);
    sessionStorage.setItem("webdavUsername", state.username);
    sessionStorage.removeItem("webdavAdminToken");
    elements.loginForm.reset();
    showFilesView();
    await loadDirectory("/");
    showToast("登录成功");
  } catch (error) {
    state.userAuth = "";
    state.username = "";
    showToast("用户名或密码无效", true);
  }
}

async function loadUsers() {
  try {
    const body = await adminApi("/api/admin/users");
    state.users = Array.isArray(body.users) ? body.users : [];
    renderUsers();
  } catch (error) {
    if (error.status === 401 || error.status === 403) logout();
    showToast(error.message, true);
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  const form = new FormData(elements.createUserForm);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const role = String(form.get("role") || "user");

  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
    showToast("用户名只能包含字母、数字、下划线、点和短横线，长度 3-64 位", true);
    return;
  }

  if (password.length < 8) {
    showToast("密码至少需要 8 位", true);
    return;
  }

  try {
    await adminApi("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    elements.createUserForm.reset();
    await loadUsers();
    showToast("用户已创建");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadAdminDirectory(path) {
  state.adminCurrentPath = ensureDirectory(path);
  try {
    const query = new URLSearchParams({
      path: state.adminCurrentPath,
    });
    const body = await adminApi(`/api/admin/files?${query.toString()}`);
    state.adminFiles = Array.isArray(body.files) ? body.files : [];
    state.adminCurrentPath = ensureDirectory(body.path || state.adminCurrentPath);
    renderAdminFiles();
  } catch (error) {
    if (error.status === 401 || error.status === 403) logout();
    showToast(error.message, true);
  }
}

function goBackAdminFolder() {
  if (state.adminCurrentPath === "/") return;
  loadAdminDirectory(parentDirectory(state.adminCurrentPath));
}

async function toggleUser(userId, enabled) {
  try {
    await adminApi(`/api/admin/users/${encodeURIComponent(userId)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await loadUsers();
    showToast(enabled ? "用户已启用" : "用户已禁用");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function resetPassword(userId) {
  const password = window.prompt("请输入新密码，至少 8 位");
  if (!password) return;
  if (password.length < 8) {
    showToast("密码至少需要 8 位", true);
    return;
  }

  try {
    await adminApi(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
    showToast("密码已重置");
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderUsers() {
  const query = elements.userSearch.value.trim().toLowerCase();
  const filtered = state.users.filter((user) => user.username.toLowerCase().includes(query));

  elements.userList.innerHTML = filtered.map(userRow).join("");
  elements.userEmptyState.classList.toggle("hidden", filtered.length > 0);

  elements.userList.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => toggleUser(button.dataset.toggleUser, button.dataset.enabled === "true"));
  });
  elements.userList.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", () => resetPassword(button.dataset.resetUser));
  });
}

function userRow(user) {
  const enabled = Boolean(user.enabled);
  const role = user.role === "admin" ? "管理员" : "普通用户";
  const updatedAt = user.updatedAt || user.updated_at || user.createdAt || user.created_at;

  return `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td><span class="badge">${role}</span></td>
      <td><span class="badge">${enabled ? "启用" : "禁用"}</span></td>
      <td>${escapeHtml(formatDate(updatedAt))}</td>
      <td>
        <div class="row-actions">
          <button class="table-action ${enabled ? "danger" : ""}" type="button" data-toggle-user="${escapeHtml(user.id)}" data-enabled="${String(!enabled)}">
            ${enabled ? "禁用" : "启用"}
          </button>
          <button class="table-action" type="button" data-reset-user="${escapeHtml(user.id)}">重置密码</button>
        </div>
      </td>
    </tr>
  `;
}

function showAdminPanel(panel) {
  const showFiles = panel === "files";
  state.adminPanel = panel;
  elements.adminUsersPanel.classList.toggle("hidden", showFiles);
  elements.adminFilesPanel.classList.toggle("hidden", !showFiles);
  elements.adminUsersTab.classList.toggle("active", !showFiles);
  elements.adminFilesTab.classList.toggle("active", showFiles);

  if (showFiles && state.adminFiles.length === 0) {
    loadAdminDirectory(state.adminCurrentPath);
  }
}

async function refreshAdminView() {
  if (state.adminPanel === "files") {
    await loadAdminDirectory(state.adminCurrentPath);
    return;
  }
  await loadUsers();
}

async function loadDirectory(path) {
  state.currentPath = ensureDirectory(path);

  try {
    state.files = await propfind(state.currentPath, 1);
    renderFiles();
  } catch (error) {
    showToast(error.message, true);
  }
}

function goBackFolder() {
  if (state.currentPath === "/") return;
  loadDirectory(parentDirectory(state.currentPath));
}

async function handleUpload() {
  const files = [...elements.fileInput.files];
  elements.fileInput.value = "";
  if (files.length === 0) return;

  try {
    for (const file of files) {
      const target = joinPath(state.currentPath, file.name);
      const response = await fetch(davUrl(target), {
        method: "PUT",
        headers: {
          authorization: state.userAuth,
          "content-type": file.type || "application/octet-stream",
          "x-webdav-web": "1",
        },
        body: file,
      });
      if (!response.ok) throw new Error(`上传失败：${file.name}`);
    }
    await loadDirectory(state.currentPath);
    showToast(`已上传 ${files.length} 个文件`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleCreateFolder(event) {
  event.preventDefault();
  const name = elements.folderName.value.trim();
  if (!/^[^\\/:*?"<>|]{1,80}$/.test(name)) {
    showToast(name ? "文件夹名称无效" : "请输入文件夹名称", true);
    return;
  }

  elements.createFolderButton.disabled = true;
  try {
    const response = await fetch(davUrl(ensureDirectory(joinPath(state.currentPath, name))), {
      method: "MKCOL",
      headers: { authorization: state.userAuth, "x-webdav-web": "1" },
    });
    if (!response.ok) throw new Error(`创建文件夹失败：${response.status}`);
    elements.folderForm.reset();
    await loadDirectory(state.currentPath);
    showToast("文件夹已创建");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.createFolderButton.disabled = false;
  }
}

async function downloadFile(file) {
  try {
    const response = await fetch(davUrl(file.path), {
      headers: { authorization: state.userAuth, "x-webdav-web": "1" },
    });
    if (!response.ok) throw new Error(`下载失败：${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteEntry(file) {
  if (!window.confirm(`确定删除 ${file.name}？`)) return;

  try {
    const response = await fetch(davUrl(file.path), {
      method: "DELETE",
      headers: { authorization: state.userAuth, "x-webdav-web": "1" },
    });
    if (!response.ok) throw new Error(`删除失败：${response.status}`);
    await loadDirectory(state.currentPath);
    showToast("已删除");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function adminDownloadFile(file) {
  try {
    const query = new URLSearchParams({
      path: file.path,
    });
    const response = await fetch(`/api/admin/files/download?${query.toString()}`, {
      headers: { authorization: `Bearer ${state.adminToken}` },
    });
    if (!response.ok) throw new Error(`下载失败：${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function propfind(path, depth) {
  const response = await fetch(davUrl(path), {
    method: "PROPFIND",
    headers: {
      authorization: state.userAuth,
      depth: String(depth),
      "x-webdav-web": "1",
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("用户名或密码无效");
  }
  if (!response.ok && response.status !== 207) {
    throw new Error(`读取目录失败：${response.status}`);
  }

  const xml = await response.text();
  return parseDavXml(xml, path);
}

function parseDavXml(xml, currentPath) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const responses = [...doc.getElementsByTagNameNS("DAV:", "response")];
  const fallbackResponses = responses.length ? responses : [...doc.getElementsByTagName("D:response")];

  return fallbackResponses
    .map((node) => {
      const href = textFrom(node, "href");
      const decoded = decodeDavHref(href);
      const type = node.getElementsByTagNameNS("DAV:", "collection").length ||
        node.getElementsByTagName("D:collection").length
        ? "directory"
        : "file";
      return {
        name: nameFromPath(decoded),
        path: type === "directory" ? ensureDirectory(decoded) : decoded,
        type,
        size: Number(textFrom(node, "getcontentlength") || "0"),
        modified: textFrom(node, "getlastmodified"),
      };
    })
    .filter((item) => item.path !== ensureDirectory(currentPath) && item.name);
}

function renderFiles() {
  renderBreadcrumbs();
  const query = elements.fileSearch.value.trim().toLowerCase();
  const filtered = state.files.filter((file) => file.name.toLowerCase().includes(query));
  filtered.sort(sortFiles);

  elements.fileList.innerHTML = filtered.map(fileRow).join("");
  elements.emptyState.classList.toggle("hidden", filtered.length > 0);

  elements.fileList.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.files.find((item) => item.path === button.dataset.open);
      if (!file) return;
      if (file.type === "directory") loadDirectory(file.path);
      else downloadFile(file);
    });
  });

  elements.fileList.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.files.find((item) => item.path === button.dataset.download);
      if (file) downloadFile(file);
    });
  });

  elements.fileList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.files.find((item) => item.path === button.dataset.delete);
      if (file) deleteEntry(file);
    });
  });
}

function renderAdminFiles() {
  renderAdminBreadcrumbs();
  const query = elements.adminFileSearch.value.trim().toLowerCase();
  const filtered = state.adminFiles.filter((file) => file.name.toLowerCase().includes(query));
  filtered.sort(sortFiles);

  elements.adminFileList.innerHTML = filtered.map((file) => fileRow(file, { admin: true })).join("");
  const isEmpty = filtered.length === 0;
  elements.adminFileEmptyState.classList.toggle("hidden", !isEmpty);
  elements.adminFileEmptyState.querySelector("p").textContent = "当前目录为空";

  elements.adminFileList.querySelectorAll("[data-admin-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.adminFiles.find((item) => item.path === button.dataset.adminOpen);
      if (!file) return;
      if (file.type === "directory") loadAdminDirectory(file.path);
      else adminDownloadFile(file);
    });
  });

  elements.adminFileList.querySelectorAll("[data-admin-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.adminFiles.find((item) => item.path === button.dataset.adminDownload);
      if (file) adminDownloadFile(file);
    });
  });
}

function fileRow(file, options = {}) {
  const isDirectory = file.type === "directory";
  const openAttr = options.admin ? "data-admin-open" : "data-open";
  const downloadAttr = options.admin ? "data-admin-download" : "data-download";
  return `
    <tr>
      <td>
        <button class="file-name" type="button" ${openAttr}="${escapeHtml(file.path)}">
          <span class="file-icon ${isDirectory ? "folder" : ""}">
            ${isDirectory ? folderIcon() : fileIcon()}
          </span>
          <span>${escapeHtml(file.name)}</span>
        </button>
      </td>
      <td><span class="badge">${isDirectory ? "文件夹" : "文件"}</span></td>
      <td>${isDirectory ? "-" : formatBytes(file.size)}</td>
      <td>${escapeHtml(formatDate(file.modified))}</td>
      <td>
        <div class="row-actions">
          ${isDirectory ? "" : `<button class="table-action" type="button" ${downloadAttr}="${escapeHtml(file.path)}">下载</button>`}
          ${options.admin ? "" : `<button class="table-action danger" type="button" data-delete="${escapeHtml(file.path)}">删除</button>`}
        </div>
      </td>
    </tr>
  `;
}

function renderBreadcrumbs() {
  const parts = state.currentPath.split("/").filter(Boolean);
  const crumbs = [{ label: "根目录", path: "/" }];
  let next = "/";
  for (const part of parts) {
    next = ensureDirectory(joinPath(next, part));
    crumbs.push({ label: part, path: next });
  }

  elements.breadcrumbs.innerHTML = crumbs.map((crumb) => (
    `<button class="breadcrumb" type="button" data-path="${escapeHtml(crumb.path)}">${escapeHtml(crumb.label)}</button>`
  )).join("");

  elements.breadcrumbs.querySelectorAll("[data-path]").forEach((button) => {
    button.addEventListener("click", () => loadDirectory(button.dataset.path));
  });

  elements.backFolder.disabled = state.currentPath === "/";
}

function renderAdminBreadcrumbs() {
  const parts = state.adminCurrentPath.split("/").filter(Boolean);
  const crumbs = [{ label: "根目录", path: "/" }];
  let next = "/";
  for (const part of parts) {
    next = ensureDirectory(joinPath(next, part));
    crumbs.push({ label: part, path: next });
  }

  elements.adminFileBreadcrumbs.innerHTML = crumbs.map((crumb) => (
    `<button class="breadcrumb" type="button" data-admin-path="${escapeHtml(crumb.path)}">${escapeHtml(crumb.label)}</button>`
  )).join("");

  elements.adminFileBreadcrumbs.querySelectorAll("[data-admin-path]").forEach((button) => {
    button.addEventListener("click", () => loadAdminDirectory(button.dataset.adminPath));
  });

  elements.adminBackFolder.disabled = state.adminCurrentPath === "/";
}

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${state.adminToken}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  const body = text ? safeJson(text) : {};
  if (!response.ok) {
    const error = new Error(body.error || body.message || `请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function showAdminView() {
  elements.loginView.classList.add("hidden");
  elements.filesView.classList.add("hidden");
  elements.adminView.classList.remove("hidden");
}

function showFilesView() {
  elements.loginView.classList.add("hidden");
  elements.adminView.classList.add("hidden");
  elements.filesView.classList.remove("hidden");
}

function logout() {
  state.adminToken = "";
  state.userAuth = "";
  state.username = "";
  state.currentPath = "/";
  state.adminCurrentPath = "/";
  state.files = [];
  state.adminFiles = [];
  state.users = [];
  sessionStorage.removeItem("webdavAdminToken");
  sessionStorage.removeItem("webdavUserAuth");
  sessionStorage.removeItem("webdavUsername");
  elements.adminView.classList.add("hidden");
  elements.filesView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
}

function davUrl(path) {
  return `/dav${path.startsWith("/") ? path : `/${path}`}`;
}

function joinPath(base, name) {
  const cleanBase = ensureDirectory(base);
  return `${cleanBase}${encodePathPart(name)}`;
}

function ensureDirectory(path) {
  if (path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function parentDirectory(path) {
  const clean = path.endsWith("/") ? path.slice(0, -1) : path;
  const index = clean.lastIndexOf("/");
  return index <= 0 ? "/" : `${clean.slice(0, index)}/`;
}

function sortFiles(left, right) {
  if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
  return left.name.localeCompare(right.name);
}

function encodePathPart(value) {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function decodeDavHref(href) {
  const url = new URL(href, window.location.origin);
  const path = decodeURIComponent(url.pathname.replace(/^\/dav/, "")) || "/";
  return path;
}

function nameFromPath(path) {
  if (path === "/") return "";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function textFrom(node, localName) {
  const ns = node.getElementsByTagNameNS("DAV:", localName)[0];
  const prefixed = node.getElementsByTagName(`D:${localName}`)[0];
  const plain = node.getElementsByTagName(localName)[0];
  return (ns || prefixed || plain)?.textContent || "";
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 4200);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function folderIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4.2l2 2H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /></svg>`;
}

function fileIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7V3Z" /><path d="M14 3v5h5" /></svg>`;
}
