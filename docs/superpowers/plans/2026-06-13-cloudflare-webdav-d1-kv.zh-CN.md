# Cloudflare WebDAV D1 + KV 中文实现计划

> 对应英文完整计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.md`

## 目标

构建一个基于 Cloudflare Workers + Pages 的 WebDAV 服务：

- D1 存储用户、管理员会话、目录和文件元数据。
- Workers KV 存储文件正文。
- 管理员可以通过后台新增用户、禁用用户、重置密码。
- 普通用户通过 WebDAV 客户端访问自己的独立文件空间。
- 单文件大小限制为 20 MB。

## 技术栈

- TypeScript
- Cloudflare Workers
- Wrangler
- Cloudflare D1
- Workers KV
- Cloudflare Pages
- Vitest

## 文件结构

计划创建 `cloudflare-webdav` 项目结构：

- `package.json`：项目脚本和依赖。
- `tsconfig.json`：TypeScript 配置。
- `wrangler.jsonc`：Worker、D1、KV 和可观测性配置。
- `migrations/0001_initial.sql`：D1 初始数据库结构。
- `src/index.ts`：Worker 入口和路由分发。
- `src/env.ts`：Cloudflare 绑定类型。
- `src/http.ts`：响应工具函数。
- `src/path.ts`：WebDAV 路径规范化。
- `src/auth.ts`：Basic Auth、密码哈希、会话 token。
- `src/repositories/users.ts`：用户和管理员会话的 D1 操作。
- `src/repositories/nodes.ts`：目录和文件元数据的 D1 操作。
- `src/storage/kv-files.ts`：KV 文件内容读写。
- `src/webdav/xml.ts`：WebDAV XML 响应生成。
- `src/webdav/handler.ts`：WebDAV 方法处理。
- `src/admin/handler.ts`：管理员 API。
- `pages-admin/index.html`：管理员后台页面。
- `pages-admin/app.js`：管理员后台交互逻辑。
- `test/*.test.ts`：路径、认证和 WebDAV 行为测试。
- `README.md` / `README.zh-CN.md`：中英文说明文档。

## 任务拆分

### 任务 1：创建项目骨架

创建 `package.json`、`tsconfig.json`、`wrangler.jsonc`、`src/env.ts`、`src/index.ts`、`src/http.ts`。

完成后运行：

```bash
cd cloudflare-webdav
npm install
npm run typecheck
```

预期结果：依赖安装成功，TypeScript 无错误。

### 任务 2：创建 D1 数据库结构

创建 `migrations/0001_initial.sql`，包含：

- `users`
- `admin_sessions`
- `nodes`

然后在 README 中补充本地初始化和 Cloudflare 资源创建说明。

### 任务 3：实现路径规范化

实现 `src/path.ts`，负责：

- 从 `/dav/*` 提取用户实际路径。
- 拒绝 `..` 路径穿越。
- 拒绝控制字符。
- 统一目录路径和文件路径格式。
- 提供父目录计算函数。

对应测试文件：`test/path.test.ts`。

### 任务 4：实现认证能力

实现 `src/auth.ts`，负责：

- 解析 HTTP Basic Auth。
- 使用 Web Crypto 生成密码哈希。
- 校验密码哈希。
- 生成管理员 session token。
- 生成 token 哈希。

对应测试文件：`test/auth.test.ts`。

### 任务 5：实现 D1 仓储层

实现：

- `src/repositories/users.ts`
- `src/repositories/nodes.ts`

用户仓储负责：

- 按用户名查询用户。
- 创建用户。
- 列出用户。
- 启用 / 禁用用户。
- 重置密码。
- 创建和校验管理员会话。

节点仓储负责：

- 获取文件或目录节点。
- 列出目录子项。
- 创建根目录。
- 创建目录。
- 写入或更新文件元数据。
- 删除节点。
- 判断目录是否有子项。

### 任务 6：实现 KV 文件存储

实现 `src/storage/kv-files.ts`，负责：

- 根据用户 ID 和文件路径生成 KV key。
- 写入文件内容。
- 读取文件内容。
- 删除文件内容。
- 根据文件内容生成 ETag。

### 任务 7：实现 WebDAV XML

实现 `src/webdav/xml.ts`，负责生成 `PROPFIND` 需要的 WebDAV XML。

返回内容需要包含：

- `href`
- `resourcetype`
- `displayname`
- `getlastmodified`
- `getcontentlength`
- `getcontenttype`
- `getetag`

### 任务 8：实现 WebDAV Handler

实现 `src/webdav/handler.ts`，支持：

- `OPTIONS`
- `PROPFIND`
- `GET`
- `HEAD`
- `PUT`
- `DELETE`
- `MKCOL`

暂不支持的方法返回 `501`：

- `LOCK`
- `UNLOCK`
- `COPY`
- `MOVE`
- `PROPPATCH`

`PUT` 必须拒绝超过 20 MB 的上传。

### 任务 9：实现管理员 API

实现 `src/admin/handler.ts`，支持：

- `POST /api/admin/login`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id/enabled`
- `PATCH /api/admin/users/:id/password`

管理员 API 使用 Bearer token。token 原文只存在客户端，D1 中只保存 token 哈希。

### 任务 10：实现 Pages 管理后台

创建：

- `pages-admin/index.html`
- `pages-admin/app.js`

功能：

- 管理员登录。
- 显示用户列表。
- 新增用户。
- 启用 / 禁用用户。
- 重置密码。

首版不做完整文件管理器，文件操作通过 WebDAV 客户端完成。

### 任务 11：实现初始管理员 Bootstrap

新增：

- `src/bootstrap.ts`
- `/api/bootstrap/admin`

用途：在没有管理员账号时，通过 Cloudflare Secret 中的 `BOOTSTRAP_TOKEN` 创建第一个管理员。

创建成功后，后续用户管理都通过管理员后台完成。

### 任务 12：验证和文档

补充 README：

- Cloudflare 资源创建命令。
- D1 迁移命令。
- 设置 `BOOTSTRAP_TOKEN` 的命令。
- WebDAV `curl` 验证命令。

最终检查：

```bash
npm run typecheck
npm test
npx wrangler check
```

本地手动验证：

1. 启动 `wrangler dev`。
2. 通过 bootstrap 创建管理员。
3. 管理员登录后创建普通用户。
4. 使用 WebDAV `MKCOL` 创建目录。
5. 使用 WebDAV `PUT` 上传文件。
6. 使用 `PROPFIND` 查看目录。
7. 使用 `GET` 下载文件。
8. 使用 `DELETE` 删除文件。

## 注意事项

- 当前账户未开通 R2，所以首版使用 KV 存文件正文。
- KV 适合低频更新配置文件，不适合同一个文件高频并发写入。
- D1 只存结构化数据和元数据，不直接存 20 MB 文件正文。
- 密码和 session token 不能写入日志。
- Cloudflare 资源 ID 和 Secret 不能提交到 GitHub。

