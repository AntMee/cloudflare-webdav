# Cloudflare WebDAV

## 项目介绍

Cloudflare WebDAV 是一个基于 **Cloudflare Workers + D1 + KV** 的轻量 WebDAV 文件服务。

适合存储配置文件、小型备份文件和其他小文件。项目不依赖 R2：

- D1：存储用户、目录、文件元数据
- KV：存储文件内容
- Workers：提供 WebDAV 接口和网页端

管理员通过 Cloudflare 变量与密钥配置。管理员登录后可以新增用户、禁用用户、重置密码；普通用户可以在网页端或 WebDAV 客户端中上传、下载、删除文件。

默认单文件大小上限为 `20 MB`。

## 部署教程

### 1. Fork 或上传项目到 GitHub

把本项目上传到你自己的 GitHub 仓库。

### 2. 添加 GitHub Secrets

进入 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

添加：

| 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

Cloudflare API Token 至少需要 D1、KV、Workers 的编辑权限。

### 3. 运行 GitHub Actions

进入 GitHub 仓库：

```text
Actions -> Deploy to Cloudflare -> Run workflow
```

脚本会自动创建或复用：

| 资源 | 默认名称 |
| --- | --- |
| D1 数据库 | `webdav_db` |
| KV 命名空间 | `webdav_files` |
| Worker | `cloudflare-webdav` |

### 4. 添加 Cloudflare 变量与密钥

进入 Cloudflare Dashboard：

```text
Workers & Pages -> cloudflare-webdav -> Settings -> Variables and Secrets
```

添加变量：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | Variable | 是 | 管理员用户名 |
| `ADMIN_PASSWORD` | Secret | 是 | 管理员密码 |
| `JWT_SECRET` | Secret | 是 | JWT 签名密钥 |
| `MAX_FILE_BYTES` | Variable | 否 | 文件大小限制，默认 `20971520` |
| `SESSION_TTL_SECONDS` | Variable | 否 | 登录有效期，默认 `43200` |

`ADMIN_PASSWORD` 和 `JWT_SECRET` 不要提交到 GitHub。

### 5. 重新部署

变量添加完成后，在 GitHub Actions 里再次运行：

```text
Deploy to Cloudflare -> Run workflow
```

### 6. 访问服务

网页端：

```text
https://你的 Worker 域名/
```

WebDAV 地址：

```text
https://你的 Worker 域名/dav/
```

管理员使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。

普通用户由管理员在网页端创建，然后使用普通用户账号登录网页端或 WebDAV 客户端。

## 本地命令

```bash
npm install
npm run deploy
```

`npm run deploy` 会自动创建或复用 D1/KV，执行 D1 迁移，并部署 Worker。
