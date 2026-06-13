# Cloudflare WebDAV

这是一个计划中的 Cloudflare WebDAV 项目，目标是在不使用 R2 的情况下，通过 **Workers + D1 + KV + Pages** 实现一个适合配置文件存储的 WebDAV 服务。

## 设计目标

- 管理员可以新增、禁用用户和重置密码。
- 管理员账号通过 Cloudflare 变量与密钥配置，JWT 会话使用 `JWT_SECRET` 签名。
- 普通用户可以通过 WebDAV 客户端上传、下载、删除配置文件。
- 普通用户也可以通过网页文件管理器管理文件。
- 文件内容存储在 Workers KV，单文件限制为 20 MB。
- 用户、权限、目录和文件元数据存储在 D1。
- 管理后台和用户端文件管理器使用 Cloudflare Pages 托管。

## 文档

- 英文 README：`README.md`
- 英文设计文档：`docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.md`
- 中文设计文档：`docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.zh-CN.md`
- 英文实现计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.md`
- 中文实现计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.zh-CN.md`
- 简化部署方案：`docs/deployment.zh-CN.md`

## 推荐架构

- **Worker**：处理 WebDAV 协议和管理员 API。
- **D1**：保存用户、会话、目录、文件元数据。
- **KV**：保存文件正文。
- **Pages**：提供管理员后台页面和用户端文件管理页面。

## 管理后台前端

静态管理后台位于 `pages-admin/`：

- `pages-admin/index.html`
- `pages-admin/styles.css`
- `pages-admin/app.js`

页面会调用 `/api/admin/login` 和 `/api/admin/users` 等 Worker API。

## 用户端前端

普通用户文件管理页面位于 `pages-user/`：

- `pages-user/index.html`
- `pages-user/styles.css`
- `pages-user/app.js`

用户端页面通过 WebDAV 接口操作 `/dav/`，支持登录、目录浏览、上传、下载、新建文件夹和删除。

## 为什么不用 D1 直接存文件

D1 更适合结构化数据，不适合直接存 20 MB 文件正文。KV 单个 value 最大可覆盖 20 MB 配置文件场景，因此采用 D1 存元数据、KV 存文件内容的方式。