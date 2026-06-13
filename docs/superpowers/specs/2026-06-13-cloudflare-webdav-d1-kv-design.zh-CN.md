# Cloudflare WebDAV D1 + KV 设计文档

## 目标

构建一个部署在 Cloudflare 上的 WebDAV 服务，用于存储不超过 20 MB 的配置文件。服务需要支持管理员创建和管理用户，普通用户通过标准 WebDAV 客户端访问自己的文件空间。

## 平台选择

项目使用 Cloudflare Workers 作为 WebDAV 协议和 API 层，Cloudflare D1 存储结构化数据，Workers KV 存储文件内容，Cloudflare Pages 托管管理员后台。

首版不依赖 R2，因为当前账户未开通 R2。D1 不适合直接保存文件正文，因为 D1 单行或单值大小限制约为 2 MB；Workers KV 单个 value 最大 25 MiB，可以覆盖 20 MB 以内文件的需求。服务会主动限制上传文件最大为 20 MB。

## 架构

Worker 暴露两组路由：

- `/dav/*`：供 WebDAV 客户端使用的 WebDAV 入口。
- `/api/admin/*`：供管理员后台调用的 JSON API。

Pages 托管静态管理员前端。前端调用 Worker 的管理员 API，实现登录、创建用户、禁用用户、重置密码和查看元数据。

D1 保存用户、会话、角色、目录记录和文件元数据。KV 使用基于用户 ID 和规范化文件路径生成的内部 key 保存文件正文。

## 数据模型

`users`

- `id`
- `username`
- `password_hash`
- `role`：`admin` 或 `user`
- `enabled`
- `created_at`
- `updated_at`

`admin_sessions`

- `token_hash`
- `user_id`
- `expires_at`
- `created_at`

`nodes`

- `id`
- `owner_user_id`
- `path`
- `kind`：`file` 或 `directory`
- `kv_key`
- `mime_type`
- `size`
- `etag`
- `created_at`
- `updated_at`

`nodes` 的唯一键是 `(owner_user_id, path)`。目录路径以 `/` 结尾，文件路径不以 `/` 结尾。

## 认证与授权

WebDAV 客户端使用 HTTP Basic Auth。Worker 从 D1 查询用户并校验用户名和密码。密码只保存加盐哈希，不保存明文。

管理员账号由用户在 Cloudflare Worker 的变量与密钥中自行配置：`ADMIN_USERNAME` 保存管理员用户名，`ADMIN_PASSWORD` 作为 Secret 保存管理员密码，`JWT_SECRET` 作为 Secret 保存会话签名密钥。管理员后台使用登录接口获取 JWT 会话 token，token 使用 `JWT_SECRET` 签名；D1 可选保存 token 哈希和过期时间，用于会话撤销。

普通用户只能访问自己的命名空间。外部 WebDAV 路径 `/` 映射到该用户的私有根目录。管理员可以通过后台管理用户和元数据，但 WebDAV 文件操作默认仍然限制在当前认证用户自己的空间内；如需管理员跨用户管理文件，可在后续版本增加专门的管理员文件管理接口。

## WebDAV 范围

首版支持：

- `OPTIONS`
- `PROPFIND`
- `GET`
- `HEAD`
- `PUT`
- `DELETE`
- `MKCOL`

首版暂不支持：

- `LOCK`
- `UNLOCK`
- `COPY`
- `MOVE`
- `PROPPATCH`

这样可以先覆盖基础挂载、浏览、上传、下载、删除和创建目录流程，避免过早实现复杂的锁语义。

## 请求处理

所有路径在使用前都要规范化：

- 安全解码 URL 路径。
- 拒绝 `..`、重复分隔符、控制字符和非法空路径段。
- 确保所有用户文件都留在当前认证用户的命名空间内。

处理 `PUT` 时，Worker 会优先检查 `Content-Length`，超过 20 MB 直接拒绝。随后读取请求体写入 KV，再把文件元数据写入 D1，并更新 ETag。由于 KV 对同一个 key 有写入频率限制，本项目假设单个配置文件不会被高频反复写入。

处理 `PROPFIND` 时，Worker 从 D1 查询目标节点和子节点，然后返回 WebDAV XML，包含状态、资源类型、内容长度、ETag 和修改时间。

处理 `DELETE` 时，如果是文件节点，Worker 先删除 KV 中的文件正文，再删除 D1 记录。首版只允许删除空目录。

## 管理后台

Pages 管理后台提供：

- 管理员登录。
- 用户列表。
- 创建用户。
- 禁用 / 启用用户。
- 重置密码。
- 查看用户文件元数据。

首版不需要做完整文件管理器。文件操作仍以 WebDAV 客户端为主。

## 错误处理

Worker 对管理员 API 返回结构化 JSON 错误；对 `/dav/*` 返回 WebDAV 客户端可理解的 HTTP 状态码。

重要状态：

- `401`：缺少凭据或凭据无效。
- `403`：用户被禁用或管理员操作未授权。
- `404`：文件或目录不存在。
- `409`：父目录不存在或目录非空。
- `413`：上传超过 20 MB。
- `405` 或 `501`：不支持的 WebDAV 方法。

## 安全

密钥不写入源码。管理员用户名、管理员密码和 `JWT_SECRET` 由用户在 Cloudflare 的变量与密钥中设置，不通过 bootstrap 接口创建，也不提交到 GitHub。

密码校验使用 Workers 可用的 Web Crypto API。JWT 使用 `JWT_SECRET` 签名和校验。token 比较使用防时序攻击的比较逻辑。日志不能包含密码、JWT、会话 token 或 Basic Auth 请求头。

## 测试

单元测试覆盖：

- 路径规范化。
- Basic Auth 解析。
- 密码哈希和校验。
- WebDAV 方法路由。
- D1 元数据操作。

本地 Workers 运行时集成测试覆盖：

- 通过管理员 API 创建用户。
- 通过 WebDAV `PUT` 上传文件。
- 通过 `PROPFIND` 列目录。
- 通过 `GET` 下载文件。
- 通过 `DELETE` 删除文件。
- 拒绝超过 20 MB 的上传。

人工验证至少需要包含一个 WebDAV 客户端，或使用 `curl` 完成一组基础 WebDAV 操作。

## 部署

Wrangler 配置定义：

- Worker 入口。
- D1 数据库绑定。
- KV 命名空间绑定。
- 可观测性配置。
- 接近项目创建日期的 compatibility date。

部署步骤：

1. 创建 D1 数据库。
2. 创建 KV 命名空间。
3. 应用 D1 schema 迁移。
4. 在 Cloudflare 变量与密钥中设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。
5. 部署 Worker。
6. 部署 Pages 管理后台。

## 首版不包含

- R2 存储。
- 多租户共享目录。
- 目录级 ACL。
- WebDAV 锁。
- 文件版本历史。
- 对同一个文件的高频并发写入。
- 超过 20 MB 的大文件支持。
