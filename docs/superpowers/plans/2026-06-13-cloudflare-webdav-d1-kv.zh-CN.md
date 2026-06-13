# Cloudflare WebDAV D1 + KV 中文实现计划

> 对应英文完整计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.md`
>
> 注意：英文完整计划中的 bootstrap 管理员任务已废弃。实际实现以本文档和设计文档为准：管理员由用户在 Cloudflare Worker 的变量与密钥中自行配置。

## 目标

构建一个基于 Cloudflare Workers + Pages 的 WebDAV 服务：

- D1 存储普通用户、管理员会话、目录和文件元数据。
- Workers KV 存储文件正文。
- 管理员账号和 `JWT_SECRET` 由 Cloudflare 变量与密钥配置，不写入 D1，不提交到 GitHub。
- 管理员登录后台后可以新增用户、禁用用户、重置密码。
- 普通用户通过 WebDAV 客户端访问自己的独立文件空间。
- 单文件大小限制为 20 MB。

## 管理员配置

管理员不通过 bootstrap 接口创建。

Cloudflare Worker 需要配置：

- `ADMIN_USERNAME`：管理员用户名，作为普通变量保存。
- `ADMIN_PASSWORD`：管理员密码，作为 Secret 保存。
- `JWT_SECRET`：JWT 会话签名密钥，作为 Secret 保存。

管理员登录流程：

1. 管理员在 Pages 后台输入用户名和密码。
2. Worker 读取 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。
3. 校验成功后使用 `JWT_SECRET` 签发管理员 JWT。
4. D1 可选保存 JWT 哈希和过期时间，用于会话撤销。
5. 管理员通过后台创建普通 WebDAV 用户。

## 技术栈

- TypeScript
- Cloudflare Workers
- Wrangler
- Cloudflare D1
- Workers KV
- Cloudflare Pages
- Vitest

## 文件结构

计划创建这些核心文件：

- `package.json`：项目脚本和依赖。
- `tsconfig.json`：TypeScript 配置。
- `wrangler.jsonc`：Worker、D1、KV 和可观测性配置。
- `migrations/0001_initial.sql`：D1 初始数据库结构。
- `src/index.ts`：Worker 入口和路由分发。
- `src/env.ts`：Cloudflare 绑定类型，包含 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。
- `src/http.ts`：响应工具函数。
- `src/path.ts`：WebDAV 路径规范化。
- `src/auth.ts`：Basic Auth、密码哈希、管理员会话 token。
- `src/repositories/users.ts`：普通用户和管理员会话的 D1 操作。
- `src/repositories/nodes.ts`：目录和文件元数据的 D1 操作。
- `src/storage/kv-files.ts`：KV 文件内容读写。
- `src/webdav/xml.ts`：WebDAV XML 响应生成。
- `src/webdav/handler.ts`：WebDAV 方法处理。
- `src/admin/handler.ts`：管理员 API。
- `pages-admin/index.html`：管理员后台页面。
- `pages-admin/app.js`：管理员后台交互逻辑。
- `scripts/deploy.ps1`：Windows 一键部署脚本。
- `scripts/deploy.sh`：Linux/macOS 一键部署脚本。
- `.github/workflows/deploy.yml`：GitHub Actions 自动部署。

## 任务拆分

### 任务 1：创建项目骨架

创建 TypeScript Worker 项目基础文件，并确保 `npm run typecheck` 可运行。

### 任务 2：创建 D1 数据库结构

创建 `users`、`admin_sessions`、`nodes` 三张表。

说明：`users` 只保存普通 WebDAV 用户，也可以保存后台创建的额外管理用户；首个管理员不放在 D1，而是从 Cloudflare 变量与密钥读取。

### 任务 3：实现路径规范化

实现 `/dav/*` 路径解析，拒绝路径穿越、控制字符和非法路径。

### 任务 4：实现认证能力

实现：

- WebDAV Basic Auth。
- 普通用户密码哈希与校验。
- 管理员变量与密钥校验。
- 管理员 JWT 生成、签名、校验和可选哈希。

### 任务 5：实现 D1 仓储层

实现普通用户、管理员 session、文件节点的 D1 操作。

### 任务 6：实现 KV 文件存储

实现文件正文写入、读取、删除和 ETag 生成。

### 任务 7：实现 WebDAV XML

实现 `PROPFIND` 返回的 WebDAV XML。

### 任务 8：实现 WebDAV Handler

支持：

- `OPTIONS`
- `PROPFIND`
- `GET`
- `HEAD`
- `PUT`
- `DELETE`
- `MKCOL`

暂不支持：

- `LOCK`
- `UNLOCK`
- `COPY`
- `MOVE`
- `PROPPATCH`

### 任务 9：实现管理员 API

支持：

- `POST /api/admin/login`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id/enabled`
- `PATCH /api/admin/users/:id/password`

管理员登录直接校验 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，登录成功后使用 `JWT_SECRET` 签发 JWT。

### 任务 10：实现 Pages 管理后台

提供管理员登录、用户列表、新增用户、启用/禁用用户、重置密码。

### 任务 11：实现一键部署

新增：

- `scripts/deploy.ps1`
- `scripts/deploy.sh`

脚本负责：

- 检查 Wrangler 登录状态。
- 创建 D1 数据库。
- 创建 KV 命名空间。
- 写入 `wrangler.jsonc`。
- 应用 D1 迁移。
- 引导用户设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。
- 部署 Worker。

### 任务 12：实现 GitHub Actions 自动部署

新增 `.github/workflows/deploy.yml`。

GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

管理员账号和 `JWT_SECRET` 不放在 GitHub Secrets 中，仍在 Cloudflare Worker 的变量与密钥里配置。

### 任务 13：验证和文档

最终检查：

```bash
npm run typecheck
npm test
npx wrangler check
```

手动验证：

1. 启动 `wrangler dev`。
2. 配置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。
3. 管理员登录后台。
4. 创建普通用户。
5. 使用 WebDAV `MKCOL` 创建目录。
6. 使用 WebDAV `PUT` 上传文件。
7. 使用 `PROPFIND` 查看目录。
8. 使用 `GET` 下载文件。
9. 使用 `DELETE` 删除文件。

## 注意事项

- 当前账户未开通 R2，所以首版使用 KV 存文件正文。
- KV 适合低频更新配置文件，不适合同一个文件高频并发写入。
- D1 只存结构化数据和元数据，不直接存 20 MB 文件正文。
- 管理员密码和 `JWT_SECRET` 必须作为 Cloudflare Secret 保存。
- 密码、JWT 和 session token 不能写入日志。
- Cloudflare 资源 ID 和 Secret 不能提交到 GitHub。
