const state = {
  token: localStorage.getItem("webdavAdminToken") || "",
  users: [],
  resetUserId: "",
};

const elements = {
  loginView: document.querySelector("#login-view"),
  dashboardView: document.querySelector("#dashboard-view"),
  loginForm: document.querySelector("#login-form"),
  createUserForm: document.querySelector("#create-user-form"),
  userList: document.querySelector("#user-list"),
  emptyState: document.querySelector("#empty-state"),
  userSearch: document.querySelector("#user-search"),
  refreshUsers: document.querySelector("#refresh-users"),
  logoutButton: document.querySelector("#logout-button"),
  toast: document.querySelector("#toast"),
  metricTotal: document.querySelector("#metric-total"),
  metricEnabled: document.querySelector("#metric-enabled"),
  metricDisabled: document.querySelector("#metric-disabled"),
  passwordDialog: document.querySelector("#password-dialog"),
  passwordForm: document.querySelector("#password-form"),
  passwordDialogUser: document.querySelector("#password-dialog-user"),
  resetPassword: document.querySelector("#reset-password"),
  cancelReset: document.querySelector("#cancel-reset"),
};

elements.loginForm.addEventListener("submit", handleLogin);
elements.createUserForm.addEventListener("submit", handleCreateUser);
elements.refreshUsers.addEventListener("click", loadUsers);
elements.logoutButton.addEventListener("click", logout);
elements.userSearch.addEventListener("input", renderUsers);
elements.passwordForm.addEventListener("submit", handleResetPassword);
elements.cancelReset.addEventListener("click", () => elements.passwordDialog.close());

if (state.token) {
  showDashboard();
  loadUsers();
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(elements.loginForm);

  try {
    const body = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: String(form.get("username") || ""),
        password: String(form.get("password") || ""),
      }),
      skipAuth: true,
    });

    state.token = body.token;
    localStorage.setItem("webdavAdminToken", state.token);
    elements.loginForm.reset();
    showDashboard();
    await loadUsers();
    showToast("登录成功");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadUsers() {
  try {
    const body = await api("/api/admin/users");
    state.users = Array.isArray(body.users) ? body.users : [];
    renderUsers();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      logout();
    }
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
    const body = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    elements.createUserForm.reset();
    showToast(`已创建用户 ${body.username || username}`);
    await loadUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function toggleUser(userId, enabled) {
  try {
    await api(`/api/admin/users/${encodeURIComponent(userId)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    showToast(enabled ? "用户已启用" : "用户已禁用");
    await loadUsers();
  } catch (error) {
    showToast(error.message, true);
  }
}

function openResetDialog(userId) {
  const user = state.users.find((item) => item.id === userId);
  state.resetUserId = userId;
  elements.passwordDialogUser.textContent = user ? `用户：${user.username}` : "";
  elements.resetPassword.value = "";
  elements.passwordDialog.showModal();
  elements.resetPassword.focus();
}

async function handleResetPassword(event) {
  event.preventDefault();
  const password = elements.resetPassword.value;

  if (password.length < 8) {
    showToast("新密码至少需要 8 位", true);
    return;
  }

  try {
    await api(`/api/admin/users/${encodeURIComponent(state.resetUserId)}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
    elements.passwordDialog.close();
    showToast("密码已重置");
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderUsers() {
  const query = elements.userSearch.value.trim().toLowerCase();
  const filtered = state.users.filter((user) => user.username.toLowerCase().includes(query));

  elements.metricTotal.textContent = String(state.users.length);
  elements.metricEnabled.textContent = String(state.users.filter((user) => user.enabled).length);
  elements.metricDisabled.textContent = String(state.users.filter((user) => !user.enabled).length);

  elements.userList.innerHTML = filtered.map(userRow).join("");
  elements.emptyState.classList.toggle("hidden", filtered.length > 0);

  elements.userList.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleUser(button.dataset.toggleUser, button.dataset.enabled === "true");
    });
  });

  elements.userList.querySelectorAll("[data-reset-user]").forEach((button) => {
    button.addEventListener("click", () => openResetDialog(button.dataset.resetUser));
  });
}

function userRow(user) {
  const initials = user.username.slice(0, 2).toUpperCase();
  const enabled = Boolean(user.enabled);
  const role = user.role === "admin" ? "admin" : "user";
  const updatedAt = user.updatedAt || user.updated_at || user.createdAt || user.created_at;

  return `
    <tr>
      <td>
        <div class="user-name">
          <span class="avatar">${escapeHtml(initials)}</span>
          <span>${escapeHtml(user.username)}</span>
        </div>
      </td>
      <td><span class="badge ${role}">${role === "admin" ? "管理员" : "普通用户"}</span></td>
      <td><span class="badge ${enabled ? "enabled" : "disabled"}">${enabled ? "启用" : "禁用"}</span></td>
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(options.skipAuth ? {} : { authorization: `Bearer ${state.token}` }),
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const text = await response.text();
  const body = text ? safeJson(text) : {};

  if (!response.ok) {
    const message = body.error || body.message || `请求失败：${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

function showDashboard() {
  elements.loginView.classList.add("hidden");
  elements.dashboardView.classList.remove("hidden");
}

function logout() {
  state.token = "";
  state.users = [];
  localStorage.removeItem("webdavAdminToken");
  elements.dashboardView.classList.add("hidden");
  elements.loginView.classList.remove("hidden");
  renderUsers();
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
