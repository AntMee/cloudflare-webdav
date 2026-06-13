# Cloudflare WebDAV 部署教程

本文档说明如何把 Cloudflare WebDAV 部署到 Cloudflare。项目分为三部分：

- **Worker 后端**：提供 WebDAV 接口和管理员 API。
- **Pages 管理后台**：`pages-admin/`，管理员创建和管理用户。
- **Pages 用户端**：`pages-user/`，普通用户在浏览器中管理文件。

当前仓库已经包含管理员端和用户端前端页面。Worker 后端代码实现完成后，一键部署脚本会自动部署完整服务；在后端代码完成前，脚本会跳过 Worker 部署，只部署前端 Pages。

## 需要准备

本机需要安装：

- Node.js 18 或更高版本。
- Git。
- 可以访问 Cloudflare 账号的浏览器。

首次使用 Wrangler 登录 Cloudflare：

```powershell
npx wrangler login
```

确认登录状态：

```powershell
npx wrangler whoami
```

## Cloudflare 变量与密钥

管理员账号不通过 bootstrap 接口创建，也不提交到 GitHub。

需要在 Cloudflare Worker 的变量与密钥中配置：

- `ADMIN_USERNAME`：管理员用户名，普通变量。
- `ADMIN_PASSWORD`：管理员密码，Secret。
- `JWT_SECRET`：JWT 签名密钥，Secret。

一键部署脚本会提示你输入这些值，并通过 Wrangler 写入 Cloudflare。

## Windows 一键部署

在项目根目录执行：

```powershell
.\scripts\deploy.ps1
```

常用参数：

```powershell
.\scripts\deploy.ps1 `
  -WorkerName cloudflare-webdav `
  -D1Name cloudflare-webdav `
  -KVNamespaceName cloudflare-webdav-files `
  -AdminPagesProject cloudflare-webdav-admin `
  -UserPagesProject cloudflare-webdav-user
```

如果现在只想部署前端页面，不设置 Worker 密钥：

```powershell
.\scripts\deploy.ps1 -SkipWorker
```

脚本会执行：

1. 检查 Wrangler 登录状态。
2. 安装依赖，如果存在 `package.json`。
3. 创建或复用 D1 数据库。
4. 创建或复用 KV 命名空间。
5. 如果存在 `wrangler.jsonc`，自动写入 D1/KV 绑定 ID。
6. 如果存在 `migrations/`，执行 D1 迁移。
7. 设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`JWT_SECRET`。
8. 如果存在 Worker 配置和入口文件，部署 Worker。
9. 部署 `pages-admin/` 到 Cloudflare Pages。
10. 部署 `pages-user/` 到 Cloudflare Pages。

## Linux/macOS 一键部署

在项目根目录执行：

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

可通过环境变量自定义名称：

```bash
WORKER_NAME=cloudflare-webdav \
D1_NAME=cloudflare-webdav \
KV_NAMESPACE_NAME=cloudflare-webdav-files \
ADMIN_PAGES_PROJECT=cloudflare-webdav-admin \
USER_PAGES_PROJECT=cloudflare-webdav-user \
./scripts/deploy.sh
```

只部署前端：

```bash
SKIP_WORKER=1 ./scripts/deploy.sh
```

## 手动部署前端 Pages

管理员端：

```powershell
npx wrangler pages project create cloudflare-webdav-admin
npx wrangler pages deploy .\pages-admin --project-name cloudflare-webdav-admin
```

用户端：

```powershell
npx wrangler pages project create cloudflare-webdav-user
npx wrangler pages deploy .\pages-user --project-name cloudflare-webdav-user
```

如果 Pages 和 Worker 不在同一个域名下，需要在 Worker 中允许 Pages 域名的 CORS，或者通过 Cloudflare 自定义域名/路由让前端和 API 同源。

## 手动部署 Worker

Worker 后端实现完成后，手动部署流程如下。

创建 D1：

```powershell
npx wrangler d1 create cloudflare-webdav
```

创建 KV：

```powershell
npx wrangler kv namespace create cloudflare-webdav-files
```

把返回的 D1 `database_id` 和 KV `id` 填入 `wrangler.jsonc`。

设置密钥：

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET
```

`ADMIN_USERNAME` 可以作为普通变量写入 `wrangler.jsonc`，也可以在 Cloudflare 后台配置。

执行迁移：

```powershell
npx wrangler d1 migrations apply cloudflare-webdav --remote
```

部署 Worker：

```powershell
npx wrangler deploy
```

## GitHub Actions 自动部署

如果后续要用 GitHub 自动部署，需要在 GitHub 仓库设置 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

管理员账号、管理员密码和 `JWT_SECRET` 仍建议在 Cloudflare Worker 的变量与密钥中配置，不放进 GitHub Actions。

## 常见问题

### `git push` 提示 fetch first

先同步远端：

```powershell
git pull --rebase origin main
git push
```

### Wrangler 未登录

执行：

```powershell
npx wrangler login
```

### 找不到 Worker 配置

如果脚本提示没有 `wrangler.jsonc`，说明当前只有前端和文档，Worker 后端还没有实现。脚本会跳过 Worker 部署，继续部署 Pages 前端。

### Pages 能打开但 API 请求失败

通常是以下原因：

- Worker 后端尚未部署。
- Pages 和 Worker 不同源，Worker 没有配置 CORS。
- Pages 访问的 API 路径不是同一个域名下的 `/api/admin/*` 或 `/dav/*`。

