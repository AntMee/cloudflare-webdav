const state = {
  auth: sessionStorage.getItem("webdavUserAuth") || "",
  username: sessionStorage.getItem("webdavUsername") || "",
  currentPath: "/",
  files: [],
  preview: false,
};

const elements = {
  loginView: document.querySelector("#login-view"),
  filesView: document.querySelector("#files-view"),
  loginForm: document.querySelector("#login-form"),
  previewFiles: document.querySelector("#preview-files"),
  refreshFiles: document.querySelector("#refresh-files"),
  logoutButton: document.querySelector("#logout-button"),
  fileInput: document.querySelector("#file-input"),
  folderForm: document.querySelector("#folder-form"),
  folderName: document.querySelector("#folder-name"),
  fileSearch: document.querySelector("#file-search"),
  fileList: document.querySelector("#file-list"),
  emptyState: document.querySelector("#empty-state"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  toast: document.querySelector("#toast"),
};

elements.loginForm.addEventListener("submit", handleLogin);
elements.previewFiles.addEventListener("click", showPreview);
elements.refreshFiles.addEventListener("click", () => loadDirectory(state.currentPath));
elements.logoutButton.addEventListener("click", logout);
elements.fileInput.addEventListener("change", handleUpload);
elements.folderForm.addEventListener("submit", handleCreateFolder);
elements.fileSearch.addEventListener("input", renderFiles);

if (new URLSearchParams(window.location.search).get("preview") === "1") {
  showPreview();
} else if (state.auth) {
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

  state.auth = `Basic ${btoa(`${username}:${password}`)}`;
  state.username = username;
  state.preview = false;

  try {
    await propfind("/", 0);
    sessionStorage.setItem("webdavUserAuth", state.auth);
    sessionStorage.setItem("webdavUsername", state.username);
    showFilesView();
    await loadDirectory("/");
    showToast("登录成功");
  } catch (error) {
    state.auth = "";
    showToast(error.message, true);
  }
}

function showPreview() {
  state.preview = true;
  state.auth = "preview";
  state.username = "alice";
  state.currentPath = "/";
  showFilesView();
  seedPreviewFiles("/");
  showToast("当前是用户端预览数据，未连接后端 WebDAV");
}

async function loadDirectory(path) {
  state.currentPath = ensureDirectory(path);

  if (state.preview) {
    seedPreviewFiles(state.currentPath);
    return;
  }

  try {
    state.files = await propfind(state.currentPath, 1);
    renderFiles();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleUpload() {
  const files = [...elements.fileInput.files];
  elements.fileInput.value = "";
  if (files.length === 0) return;

  if (state.preview) {
    for (const file of files) {
      state.files.push({
        name: file.name,
        path: joinPath(state.currentPath, file.name),
        type: "file",
        size: file.size,
        modified: new Date().toISOString(),
      });
    }
    renderFiles();
    showToast(`已模拟上传 ${files.length} 个文件`);
    return;
  }

  try {
    for (const file of files) {
      const target = joinPath(state.currentPath, file.name);
      const response = await fetch(davUrl(target), {
        method: "PUT",
        headers: {
          authorization: state.auth,
          "content-type": file.type || "application/octet-stream",
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
    showToast("文件夹名称无效", true);
    return;
  }

  const folderPath = ensureDirectory(joinPath(state.currentPath, name));

  if (state.preview) {
    state.files.push({
      name,
      path: folderPath,
      type: "directory",
      size: 0,
      modified: new Date().toISOString(),
    });
    elements.folderForm.reset();
    renderFiles();
    showToast("已模拟创建文件夹");
    return;
  }

  try {
    const response = await fetch(davUrl(folderPath), {
      method: "MKCOL",
      headers: { authorization: state.auth },
    });
    if (!response.ok) throw new Error(`创建文件夹失败：${response.status}`);
    elements.folderForm.reset();
    await loadDirectory(state.currentPath);
    showToast("文件夹已创建");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function downloadFile(file) {
  if (state.preview) {
    showToast("预览模式不下载真实文件");
    return;
  }

  try {
    const response = await fetch(davUrl(file.path), {
      headers: { authorization: state.auth },
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

  if (state.preview) {
    state.files = state.files.filter((item) => item.path !== file.path);
    renderFiles();
    showToast("已模拟删除");
    return;
  }

  try {
    const response = await fetch(davUrl(file.path), {
      method: "DELETE",
      headers: { authorization: state.auth },
    });
    if (!response.ok) throw new Error(`删除失败：${response.status}`);
    await loadDirectory(state.currentPath);
    showToast("已删除");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function propfind(path, depth) {
  const response = await fetch(davUrl(path), {
    method: "PROPFIND",
    headers: {
      authorization: state.auth,
      depth: String(depth),
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
  filtered.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

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

function fileRow(file) {
  const isDirectory = file.type === "directory";
  return `
    <tr>
      <td>
        <button class="file-name" type="button" data-open="${escapeHtml(file.path)}">
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
          ${isDirectory ? "" : `<button class="table-action" type="button" data-download="${escapeHtml(file.path)}">下载</button>`}
          <button class="table-action danger" type="button" data-delete="${escapeHtml(file.path)}">删除</button>
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
}

function seedPreviewFiles(path) {
  const datasets = {
    "/": [
      { name: "app-config", path: "/app-config/", type: "directory", size: 0, modified: new Date().toISOString() },
      { name: "cloudflare.json", path: "/cloudflare.json", type: "file", size: 1842, modified: new Date().toISOString() },
      { name: "tokens.env", path: "/tokens.env", type: "file", size: 612, modified: new Date(Date.now() - 86400000).toISOString() },
    ],
    "/app-config/": [
      { name: "prod.yaml", path: "/app-config/prod.yaml", type: "file", size: 4096, modified: new Date().toISOString() },
      { name: "staging.yaml", path: "/app-config/staging.yaml", type: "file", size: 3210, modified: new Date(Date.now() - 7200000).toISOString() },
    ],
  };
  state.currentPath = ensureDirectory(path);
  state.files = datasets[state.currentPath] || [];
  renderFiles();
}

function showFilesView() {
  elements.loginView.classList.add("hidden");
  elements.filesView.classList.remove("hidden");
}

function logout() {
  state.auth = "";
  state.username = "";
  state.preview = false;
  state.currentPath = "/";
  state.files = [];
  sessionStorage.removeItem("webdavUserAuth");
  sessionStorage.removeItem("webdavUsername");
  elements.filesView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
  renderFiles();
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
