const state = {
  adminToken: sessionStorage.getItem("webdavAdminToken") || "",
  adminUsername: sessionStorage.getItem("webdavAdminUsername") || "",
  userAuth: sessionStorage.getItem("webdavUserAuth") || "",
  username: sessionStorage.getItem("webdavUsername") || "",
  currentPath: "/",
  adminCurrentPath: "/",
  adminPanel: "users",
  files: [],
  adminFiles: [],
  users: [],
  selectedFiles: new Set(),
  selectedAdminFiles: new Set(),
  filePage: 1,
  adminFilePage: 1,
  pageSize: Number(sessionStorage.getItem("webdavPageSize")) || 20,
  language: sessionStorage.getItem("webdavLanguage") || "zh",
};

const PAGE_SIZES = [10, 20, 50];
if (!PAGE_SIZES.includes(state.pageSize)) state.pageSize = 20;

const I18N = {
  zh: {
    languageToggle: "EN",
    selectColumn: "\u9009\u62e9",
    selectPage: "\u9009\u62e9\u672c\u9875",
    selected: ({ count }) => `\u5df2\u9009 ${count} \u9879`,
    bulkDelete: "\u6279\u91cf\u5220\u9664",
    pageSize: "\u6bcf\u9875",
    pageSizeOption: ({ count }) => `${count} \u6761/\u9875`,
    prevPage: "\u4e0a\u4e00\u9875",
    nextPage: "\u4e0b\u4e00\u9875",
    total: ({ total }) => `\u5171 ${total} \u9879`,
    pageRange: ({ start, end, total }) => `${start}-${end} / ${total}`,
    folder: "\u6587\u4ef6\u5939",
    file: "\u6587\u4ef6",
    download: "\u4e0b\u8f7d",
    delete: "\u5220\u9664",
    selectFile: ({ name }) => `\u9009\u62e9 ${name}`,
    emptyDirectory: "\u5f53\u524d\u76ee\u5f55\u4e3a\u7a7a",
    uploaded: ({ count }) => `\u5df2\u4e0a\u4f20 ${count} \u4e2a\u6587\u4ef6`,
    deleted: ({ count }) => `\u5df2\u5220\u9664 ${count} \u9879`,
    deleteFailed: ({ name }) => `\u5220\u9664\u5931\u8d25\uff1a${name}`,
    confirmDelete: ({ type }) => `\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a${type}\uff1f\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002`,
    confirmBulkDelete: ({ count }) => `\u786e\u5b9a\u5220\u9664\u9009\u4e2d\u7684 ${count} \u9879\uff1f\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\u3002`,
    moreItems: "\u7b49",
  },
  en: {
    languageToggle: "\u4e2d\u6587",
    selectColumn: "Select",
    selectPage: "Select page",
    selected: ({ count }) => `Selected ${count}`,
    bulkDelete: "Delete selected",
    pageSize: "Per page",
    pageSizeOption: ({ count }) => `${count} / page`,
    prevPage: "Previous",
    nextPage: "Next",
    total: ({ total }) => `Total ${total}`,
    pageRange: ({ start, end, total }) => `${start}-${end} / ${total}`,
    folder: "Folder",
    file: "File",
    download: "Download",
    delete: "Delete",
    selectFile: ({ name }) => `Select ${name}`,
    emptyDirectory: "Empty directory",
    uploaded: ({ count }) => `Uploaded ${count} files`,
    deleted: ({ count }) => `Deleted ${count} items`,
    deleteFailed: ({ name }) => `Delete failed: ${name}`,
    confirmDelete: ({ type }) => `Delete this ${type}? This cannot be undone.`,
    confirmBulkDelete: ({ count }) => `Delete ${count} selected items? This cannot be undone.`,
    moreItems: "...",
  },
};

const elements = {
  loginView: document.querySelector("#login-view"),
  loginForm: document.querySelector("#login-form"),
  adminView: document.querySelector("#admin-view"),
  filesView: document.querySelector("#files-view"),
  adminAccountLabel: document.querySelector("#admin-account-label"),
  currentUserLabel: document.querySelector("#current-user-label"),
  userCount: document.querySelector("#user-count"),
  enabledUserCount: document.querySelector("#enabled-user-count"),
  fileCount: document.querySelector("#file-count"),
  currentPathLabel: document.querySelector("#current-path-label"),
  adminFileCount: document.querySelector("#admin-file-count"),
  adminCurrentPath: document.querySelector("#admin-current-path"),
  adminUsersTab: document.querySelector("#admin-users-tab"),
  adminFilesTab: document.querySelector("#admin-files-tab"),
  adminUsersPanel: document.querySelector("#admin-users-panel"),
  adminFilesPanel: document.querySelector("#admin-files-panel"),
  createUserForm: document.querySelector("#create-user-form"),
  refreshUsers: document.querySelector("#refresh-users"),
  adminLogoutButton: document.querySelector("#admin-logout-button"),
  adminLanguageToggle: document.querySelector("#admin-language-toggle"),
  userSearch: document.querySelector("#user-search"),
  userList: document.querySelector("#user-list"),
  userEmptyState: document.querySelector("#user-empty-state"),
  adminBackFolder: document.querySelector("#admin-back-folder"),
  adminRefreshFiles: document.querySelector("#admin-refresh-files"),
  adminShowFolderForm: document.querySelector("#admin-show-folder-form"),
  adminFolderForm: document.querySelector("#admin-folder-form"),
  adminFolderName: document.querySelector("#admin-folder-name"),
  adminCreateFolderButton: document.querySelector("#admin-create-folder-button"),
  adminFileBreadcrumbs: document.querySelector("#admin-file-breadcrumbs"),
  adminFileSearch: document.querySelector("#admin-file-search"),
  adminBulkBar: document.querySelector("#admin-bulk-bar"),
  adminSelectedCount: document.querySelector("#admin-selected-count"),
  adminSelectAll: document.querySelector("#admin-select-all"),
  adminBulkDelete: document.querySelector("#admin-bulk-delete"),
  adminPagination: document.querySelector("#admin-pagination"),
  adminPageSummary: document.querySelector("#admin-page-summary"),
  adminPrevPage: document.querySelector("#admin-prev-page"),
  adminNextPage: document.querySelector("#admin-next-page"),
  adminPageSize: document.querySelector("#admin-page-size"),
  adminFileList: document.querySelector("#admin-file-list"),
  adminFileEmptyState: document.querySelector("#admin-file-empty-state"),
  refreshFiles: document.querySelector("#refresh-files"),
  backFolder: document.querySelector("#back-folder"),
  showFolderForm: document.querySelector("#show-folder-form"),
  userLogoutButton: document.querySelector("#user-logout-button"),
  languageToggle: document.querySelector("#language-toggle"),
  fileInput: document.querySelector("#file-input"),
  folderForm: document.querySelector("#folder-form"),
  folderName: document.querySelector("#folder-name"),
  createFolderButton: document.querySelector("#create-folder-button"),
  fileSearch: document.querySelector("#file-search"),
  bulkBar: document.querySelector("#bulk-bar"),
  selectedCount: document.querySelector("#selected-count"),
  selectAll: document.querySelector("#select-all"),
  bulkDelete: document.querySelector("#bulk-delete"),
  pagination: document.querySelector("#pagination"),
  pageSummary: document.querySelector("#page-summary"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  pageSize: document.querySelector("#page-size"),
  fileList: document.querySelector("#file-list"),
  emptyState: document.querySelector("#empty-state"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  toast: document.querySelector("#toast"),
  confirmOverlay: document.querySelector("#confirm-overlay"),
  confirmMessage: document.querySelector("#confirm-message"),
  confirmTarget: document.querySelector("#confirm-target"),
  confirmOk: document.querySelector("#confirm-ok"),
  confirmCancel: document.querySelector("#confirm-cancel"),
};

function t(key, params = {}) {
  const dictionary = I18N[state.language] || I18N.zh;
  const value = dictionary[key] ?? I18N.zh[key] ?? key;
  return typeof value === "function" ? value(params) : value;
}

elements.loginForm.addEventListener("submit", handleLogin);
elements.createUserForm.addEventListener("submit", handleCreateUser);
elements.refreshUsers.addEventListener("click", refreshAdminView);
elements.adminLogoutButton.addEventListener("click", logout);
elements.adminLanguageToggle.addEventListener("click", toggleLanguage);
elements.adminUsersTab.addEventListener("click", () => showAdminPanel("users"));
elements.adminFilesTab.addEventListener("click", () => showAdminPanel("files"));
elements.userSearch.addEventListener("input", renderUsers);
elements.adminBackFolder.addEventListener("click", goBackAdminFolder);
elements.adminRefreshFiles.addEventListener("click", () => loadAdminDirectory(state.adminCurrentPath));
elements.adminShowFolderForm.addEventListener("click", () => toggleAdminFolderForm());
elements.adminFolderForm.addEventListener("submit", handleAdminCreateFolder);
elements.adminFolderName.addEventListener("invalid", () => showToast("请输入文件夹名称", true));
elements.adminFileSearch.addEventListener("input", () => {
  state.adminFilePage = 1;
  renderAdminFiles();
});
elements.adminSelectAll.addEventListener("change", toggleAdminSelectAll);
elements.adminBulkDelete.addEventListener("click", handleAdminBulkDelete);
elements.adminPrevPage.addEventListener("click", () => changeAdminFilePage(-1));
elements.adminNextPage.addEventListener("click", () => changeAdminFilePage(1));
elements.adminPageSize.addEventListener("change", handlePageSizeChange);
elements.refreshFiles.addEventListener("click", () => loadDirectory(state.currentPath));
elements.backFolder.addEventListener("click", goBackFolder);
elements.showFolderForm.addEventListener("click", () => toggleFolderForm());
elements.userLogoutButton.addEventListener("click", logout);
elements.languageToggle.addEventListener("click", toggleLanguage);
elements.fileInput.addEventListener("change", handleUpload);
elements.folderForm.addEventListener("submit", handleCreateFolder);
elements.folderName.addEventListener("invalid", () => showToast("请输入文件夹名称", true));
elements.fileSearch.addEventListener("input", () => {
  state.filePage = 1;
  renderFiles();
});
elements.selectAll.addEventListener("change", toggleSelectAll);
elements.bulkDelete.addEventListener("click", handleBulkDelete);
elements.prevPage.addEventListener("click", () => changeFilePage(-1));
elements.nextPage.addEventListener("click", () => changeFilePage(1));
elements.pageSize.addEventListener("change", handlePageSizeChange);
elements.confirmCancel.addEventListener("click", () => closeConfirmDialog(false));
elements.confirmOk.addEventListener("click", () => closeConfirmDialog(true));
elements.confirmOverlay.addEventListener("click", (event) => {
  if (event.target === elements.confirmOverlay) closeConfirmDialog(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.confirmOverlay.classList.contains("hidden")) {
    closeConfirmDialog(false);
  }
});

applyLanguage();

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
  state.adminUsername = username;
  sessionStorage.setItem("webdavAdminToken", state.adminToken);
  sessionStorage.setItem("webdavAdminUsername", state.adminUsername);
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
    sessionStorage.removeItem("webdavAdminUsername");
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
    updateUserStats();
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
  state.selectedAdminFiles.clear();
  state.adminFilePage = 1;
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

function toggleAdminFolderForm(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : elements.adminFolderForm.classList.contains("hidden");
  elements.adminFolderForm.classList.toggle("hidden", !shouldOpen);
  elements.adminShowFolderForm.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) elements.adminFolderName.focus();
}

async function handleAdminCreateFolder(event) {
  event.preventDefault();
  const name = elements.adminFolderName.value.trim();
  if (!isValidFolderName(name)) {
    showToast(name ? "文件夹名称无效" : "请输入文件夹名称", true);
    return;
  }

  elements.adminCreateFolderButton.disabled = true;
  try {
    const target = ensureDirectory(joinPath(state.adminCurrentPath, name));
    await adminApi("/api/admin/files/folders", {
      method: "POST",
      body: JSON.stringify({ path: target }),
    });
    elements.adminFolderForm.reset();
    toggleAdminFolderForm(false);
    await loadAdminDirectory(state.adminCurrentPath);
    showToast("文件夹已创建");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.adminCreateFolderButton.disabled = false;
  }
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
  updateUserStats();

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
      <td><span class="badge ${enabled ? "success" : "danger"}">${enabled ? "启用" : "禁用"}</span></td>
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
  elements.adminUsersTab.setAttribute("aria-selected", String(!showFiles));
  elements.adminFilesTab.setAttribute("aria-selected", String(showFiles));

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
  state.selectedFiles.clear();
  state.filePage = 1;

  try {
    state.files = await propfind(state.currentPath, 1);
    renderFiles();
    updateFileStats();
  } catch (error) {
    showToast(error.message, true);
  }
}

function goBackFolder() {
  if (state.currentPath === "/") return;
  loadDirectory(parentDirectory(state.currentPath));
}

function toggleFolderForm(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : elements.folderForm.classList.contains("hidden");
  elements.folderForm.classList.toggle("hidden", !shouldOpen);
  elements.showFolderForm.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) elements.folderName.focus();
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
    showToast(t("uploaded", { count: files.length }));
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleCreateFolder(event) {
  event.preventDefault();
  const name = elements.folderName.value.trim();
  if (!isValidFolderName(name)) {
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
    toggleFolderForm(false);
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
  if (!(await confirmDelete(file))) return;

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

async function adminDeleteEntry(file) {
  if (!(await confirmDelete(file))) return;

  try {
    const query = new URLSearchParams({
      path: file.path,
    });
    const response = await fetch(`/api/admin/files?${query.toString()}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${state.adminToken}` },
    });
    if (!response.ok) throw new Error(`删除失败：${response.status}`);
    await loadAdminDirectory(state.adminCurrentPath);
    showToast("已删除");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleBulkDelete() {
  const files = state.files.filter((file) => state.selectedFiles.has(file.path));
  if (files.length === 0) return;
  if (!(await confirmBulkDelete(files))) return;

  elements.bulkDelete.disabled = true;
  try {
    for (const file of files) {
      const response = await fetch(davUrl(file.path), {
        method: "DELETE",
        headers: { authorization: state.userAuth, "x-webdav-web": "1" },
      });
      if (!response.ok) throw new Error(`删除失败：${file.name}`);
    }
    state.selectedFiles.clear();
    await loadDirectory(state.currentPath);
    showToast(t("deleted", { count: files.length }));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.bulkDelete.disabled = false;
  }
}

async function handleAdminBulkDelete() {
  const files = state.adminFiles.filter((file) => state.selectedAdminFiles.has(file.path));
  if (files.length === 0) return;
  if (!(await confirmBulkDelete(files))) return;

  elements.adminBulkDelete.disabled = true;
  try {
    for (const file of files) {
      const query = new URLSearchParams({ path: file.path });
      const response = await fetch(`/api/admin/files?${query.toString()}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${state.adminToken}` },
      });
      if (!response.ok) throw new Error(t("deleteFailed", { name: file.name }));
    }
    state.selectedAdminFiles.clear();
    await loadAdminDirectory(state.adminCurrentPath);
    showToast(t("deleted", { count: files.length }));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.adminBulkDelete.disabled = false;
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
  syncSelection(state.selectedFiles, filtered);
  const page = pageItems(filtered, state.filePage);
  state.filePage = page.page;

  elements.fileList.innerHTML = page.items.map(fileRow).join("");
  elements.emptyState.classList.toggle("hidden", filtered.length > 0);
  updateBulkControls({ filtered, pageItems: page.items });
  updatePagination({
    total: filtered.length,
    page: page.page,
    totalPages: page.totalPages,
    summaryElement: elements.pageSummary,
    prevButton: elements.prevPage,
    nextButton: elements.nextPage,
  });
  updateFileStats();

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

  elements.fileList.querySelectorAll("[data-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      setSelection(state.selectedFiles, checkbox.dataset.select, checkbox.checked);
      updateBulkControls({ filtered, pageItems: page.items });
    });
  });
}

function renderAdminFiles() {
  renderAdminBreadcrumbs();
  const query = elements.adminFileSearch.value.trim().toLowerCase();
  const filtered = state.adminFiles.filter((file) => file.name.toLowerCase().includes(query));
  filtered.sort(sortFiles);
  syncSelection(state.selectedAdminFiles, filtered);
  const page = pageItems(filtered, state.adminFilePage);
  state.adminFilePage = page.page;

  elements.adminFileList.innerHTML = page.items.map((file) => fileRow(file, { admin: true })).join("");
  const isEmpty = filtered.length === 0;
  elements.adminFileEmptyState.classList.toggle("hidden", !isEmpty);
  elements.adminFileEmptyState.querySelector("p").textContent = t("emptyDirectory");
  updateAdminBulkControls({ filtered, pageItems: page.items });
  updatePagination({
    total: filtered.length,
    page: page.page,
    totalPages: page.totalPages,
    summaryElement: elements.adminPageSummary,
    prevButton: elements.adminPrevPage,
    nextButton: elements.adminNextPage,
  });
  updateAdminFileStats();

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

  elements.adminFileList.querySelectorAll("[data-admin-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      const file = state.adminFiles.find((item) => item.path === button.dataset.adminDelete);
      if (file) adminDeleteEntry(file);
    });
  });

  elements.adminFileList.querySelectorAll("[data-admin-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      setSelection(state.selectedAdminFiles, checkbox.dataset.adminSelect, checkbox.checked);
      updateAdminBulkControls({ filtered, pageItems: page.items });
    });
  });
}

function fileRow(file, options = {}) {
  const isDirectory = file.type === "directory";
  const openAttr = options.admin ? "data-admin-open" : "data-open";
  const downloadAttr = options.admin ? "data-admin-download" : "data-download";
  const deleteAttr = options.admin ? "data-admin-delete" : "data-delete";
  const selectAttr = options.admin ? "data-admin-select" : "data-select";
  const selected = options.admin ? state.selectedAdminFiles.has(file.path) : state.selectedFiles.has(file.path);
  const checkedAttr = selected ? " checked" : "";
  const downloadButton = isDirectory ? "" : `<button class="table-action" type="button" ${downloadAttr}="${escapeHtml(file.path)}">${escapeHtml(t("download"))}</button>`;
  return `
    <tr>
      <td class="select-cell">
        <input class="row-checkbox" type="checkbox" ${selectAttr}="${escapeHtml(file.path)}"${checkedAttr} aria-label="${escapeHtml(t("selectFile", { name: file.name }))}" />
      </td>
      <td>
        <button class="file-name" type="button" ${openAttr}="${escapeHtml(file.path)}">
          <span class="file-icon ${isDirectory ? "folder" : ""}">
            ${isDirectory ? folderIcon() : fileIcon()}
          </span>
          <span>${escapeHtml(file.name)}</span>
        </button>
      </td>
      <td><span class="badge">${escapeHtml(t(isDirectory ? "folder" : "file"))}</span></td>
      <td>${isDirectory ? "-" : formatBytes(file.size)}</td>
      <td>${escapeHtml(formatDate(file.modified))}</td>
      <td>
        <div class="row-actions">
          ${downloadButton}
          <button class="table-action danger" type="button" ${deleteAttr}="${escapeHtml(file.path)}">${escapeHtml(t("delete"))}</button>
        </div>
      </td>
    </tr>
  `;
}

function pageItems(items, requestedPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
  const page = Math.min(Math.max(Number(requestedPage) || 1, 1), totalPages);
  const start = (page - 1) * state.pageSize;
  return { items: items.slice(start, start + state.pageSize), page, totalPages };
}

function updatePagination({ total, page, totalPages, summaryElement, prevButton, nextButton }) {
  const start = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
  const end = Math.min(page * state.pageSize, total);
  summaryElement.textContent = total > state.pageSize ? t("pageRange", { start, end, total }) : t("total", { total });
  prevButton.disabled = page <= 1;
  nextButton.disabled = page >= totalPages;
}

function handlePageSizeChange(event) {
  const nextSize = Number(event.target.value);
  if (!PAGE_SIZES.includes(nextSize)) return;
  state.pageSize = nextSize;
  sessionStorage.setItem("webdavPageSize", String(nextSize));
  state.filePage = 1;
  state.adminFilePage = 1;
  syncPageSizeControls();
  if (!elements.filesView.classList.contains("hidden")) renderFiles();
  if (!elements.adminView.classList.contains("hidden") && state.adminPanel === "files") renderAdminFiles();
}

function toggleLanguage() {
  state.language = state.language === "zh" ? "en" : "zh";
  sessionStorage.setItem("webdavLanguage", state.language);
  applyLanguage();
  renderFiles();
  if (state.adminPanel === "files") renderAdminFiles();
}

function applyLanguage() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  });
  elements.languageToggle.textContent = t("languageToggle");
  elements.adminLanguageToggle.textContent = t("languageToggle");
  syncPageSizeControls();
}

function syncPageSizeControls() {
  [elements.pageSize, elements.adminPageSize].forEach((select) => {
    if (!select) return;
    select.value = String(state.pageSize);
    [...select.options].forEach((option) => {
      option.textContent = t("pageSizeOption", { count: Number(option.value) });
    });
  });
}

function changeFilePage(delta) {
  state.filePage += delta;
  renderFiles();
}

function changeAdminFilePage(delta) {
  state.adminFilePage += delta;
  renderAdminFiles();
}

function syncSelection(selection, files) {
  const paths = new Set(files.map((file) => file.path));
  for (const path of [...selection]) {
    if (!paths.has(path)) selection.delete(path);
  }
}

function setSelection(selection, path, selected) {
  if (!path) return;
  if (selected) selection.add(path);
  else selection.delete(path);
}

function toggleSelectAll() {
  const pageFiles = currentPageFiles(state.files, elements.fileSearch.value, state.filePage);
  toggleSelectionForPage(state.selectedFiles, pageFiles, elements.selectAll.checked);
  renderFiles();
}

function toggleAdminSelectAll() {
  const pageFiles = currentPageFiles(state.adminFiles, elements.adminFileSearch.value, state.adminFilePage);
  toggleSelectionForPage(state.selectedAdminFiles, pageFiles, elements.adminSelectAll.checked);
  renderAdminFiles();
}

function currentPageFiles(files, queryValue, pageValue) {
  const query = queryValue.trim().toLowerCase();
  const filtered = files.filter((file) => file.name.toLowerCase().includes(query));
  filtered.sort(sortFiles);
  return pageItems(filtered, pageValue).items;
}

function toggleSelectionForPage(selection, files, selected) {
  files.forEach((file) => setSelection(selection, file.path, selected));
}

function updateBulkControls({ filtered, pageItems }) {
  updateSelectionControls({
    selection: state.selectedFiles,
    filtered,
    pageItems,
    selectAll: elements.selectAll,
    bulkBar: elements.bulkBar,
    selectedCount: elements.selectedCount,
    bulkDelete: elements.bulkDelete,
  });
}

function updateAdminBulkControls({ filtered, pageItems }) {
  updateSelectionControls({
    selection: state.selectedAdminFiles,
    filtered,
    pageItems,
    selectAll: elements.adminSelectAll,
    bulkBar: elements.adminBulkBar,
    selectedCount: elements.adminSelectedCount,
    bulkDelete: elements.adminBulkDelete,
  });
}

function updateSelectionControls({ selection, filtered, pageItems, selectAll, bulkBar, selectedCount, bulkDelete }) {
  const selectedOnPage = pageItems.filter((file) => selection.has(file.path)).length;
  selectAll.checked = pageItems.length > 0 && selectedOnPage === pageItems.length;
  selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < pageItems.length;
  selectAll.disabled = pageItems.length === 0;
  bulkBar.classList.toggle("hidden", filtered.length === 0);
  selectedCount.textContent = t("selected", { count: selection.size });
  bulkDelete.disabled = selection.size === 0;
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
  updateFileStats();
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
  updateAdminFileStats();
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
  if (elements.adminAccountLabel) {
    elements.adminAccountLabel.textContent = state.adminUsername ? `管理员：${state.adminUsername}` : "管理员";
  }
  updateUserStats();
  updateAdminFileStats();
}

function showFilesView() {
  elements.loginView.classList.add("hidden");
  elements.adminView.classList.add("hidden");
  elements.filesView.classList.remove("hidden");
  if (elements.currentUserLabel) {
    elements.currentUserLabel.textContent = state.username ? `用户：${state.username}` : "普通用户";
  }
  updateFileStats();
}

function logout() {
  state.adminToken = "";
  state.adminUsername = "";
  state.userAuth = "";
  state.username = "";
  state.currentPath = "/";
  state.adminCurrentPath = "/";
  state.files = [];
  state.adminFiles = [];
  state.users = [];
  sessionStorage.removeItem("webdavAdminToken");
  sessionStorage.removeItem("webdavAdminUsername");
  sessionStorage.removeItem("webdavUserAuth");
  sessionStorage.removeItem("webdavUsername");
  elements.adminView.classList.add("hidden");
  elements.filesView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
}

function updateUserStats() {
  if (elements.userCount) elements.userCount.textContent = String(state.users.length);
  if (elements.enabledUserCount) {
    elements.enabledUserCount.textContent = String(state.users.filter((user) => Boolean(user.enabled)).length);
  }
}

function updateFileStats() {
  if (elements.fileCount) elements.fileCount.textContent = String(state.files.length);
  if (elements.currentPathLabel) elements.currentPathLabel.textContent = state.currentPath;
}

function updateAdminFileStats() {
  if (elements.adminFileCount) elements.adminFileCount.textContent = String(state.adminFiles.length);
  if (elements.adminCurrentPath) elements.adminCurrentPath.textContent = state.adminCurrentPath;
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

function isValidFolderName(name) {
  return /^[^\\/:*?"<>|]{1,80}$/.test(name);
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

function confirmDelete(file) {
  const typeName = t(file.type === "directory" ? "folder" : "file");
  return showConfirmDialog({
    message: t("confirmDelete", { type: typeName }),
    target: file.name,
  });
}

function confirmBulkDelete(files) {
  const separator = state.language === "zh" ? "、" : ", ";
  const suffix = files.length > 3 ? ` ${t("moreItems")}` : "";
  return showConfirmDialog({
    message: t("confirmBulkDelete", { count: files.length }),
    target: files.map((file) => file.name).slice(0, 3).join(separator) + suffix,
  });
}

function showConfirmDialog({ message, target }) {
  if (showConfirmDialog.resolve) closeConfirmDialog(false);
  elements.confirmMessage.textContent = message;
  elements.confirmTarget.textContent = target || "";
  elements.confirmOverlay.classList.remove("hidden");
  elements.confirmOk.focus();
  return new Promise((resolve) => {
    showConfirmDialog.resolve = resolve;
  });
}

function closeConfirmDialog(result) {
  if (elements.confirmOverlay.classList.contains("hidden")) return;
  elements.confirmOverlay.classList.add("hidden");
  const resolve = showConfirmDialog.resolve;
  showConfirmDialog.resolve = null;
  if (resolve) resolve(result);
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
