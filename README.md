# Cloudflare WebDAV 中文部署教程

这是一个基于 **Cloudflare Workers + D1 + KV + Pages** 的轻量 WebDAV 项目，适合存储配置文件、小型备份文件和其他 20 MB 以内的小文件。

本项目不需要 R2。用户、目录和文件元数据存储在 D1，文件内容存储在 Workers KV。

## 功能说明

- 管理员账号由用户在 Cloudflare 的“变量与密钥”中自行配置。
- 支持 `JWT_SECRET`，用于签名后台和用户登录会话。
- 管理员可以在网页后台新增用户、禁用用户、重置用户密码。
- 普通用户可以通过网页文件管理器查看、上传、下载、删除文件。
- 普通用户也可以使用 WebDAV 客户端连接 `/dav/`。
- 文件内容存储在 KV，建议单文件不超过 20 MB。
- 不依赖 R2，未开通 R2 的账号也可以使用。

## 项目目录

```text
pages-admin/                 管理员后台页面
pages-user/                  普通用户文件管理页面
scripts/deploy.ps1           Windows 一键部署脚本
scripts/deploy.sh            Linux/macOS 一键部署脚本
docs/deployment.zh-CN.md     更详细的中文部署文档
```

## Cloudflare 必填变量

管理员不通过接口初始化，也不写死在代码里。请在 Cloudflare Worker 的“变量与密钥”中添加：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | 变量 | 管理员用户名 |
| `ADMIN_PASSWORD` | 密钥 Secret | 管理员密码 |
| `JWT_SECRET` | 密钥 Secret | JWT 签名密钥，建议使用随机长字符串 |

`ADMIN_PASSWORD` 和 `JWT_SECRET` 不要提交到 GitHub。

## 部署方式一：Cloudflare 手动部署

适合不想使用 GitHub Actions，只想在本机部署的用户。

### 1. 安装 Node.js

请先安装 Node.js 18 或更高版本。

检查版本：

```powershell
node -v
npm -v
```

### 2. 登录 Cloudflare

在项目根目录执行：

```powershell
npx wrangler login
```

登录成功后检查账号：

```powershell
npx wrangler whoami
```

### 3. 创建 D1 数据库

```powershell
npx wrangler d1 create cloudflare-webdav
```

把命令返回的 `database_id` 填入 `wrangler.jsonc` 的 D1 绑定。

### 4. 创建 KV 命名空间

```powershell
npx wrangler kv namespace create cloudflare-webdav-files
```

把命令返回的 `id` 填入 `wrangler.jsonc` 的 KV 绑定。

### 5. 设置 Worker 变量与密钥

管理员用户名可以在 Cloudflare 后台设置为普通变量：

```text
ADMIN_USERNAME=你的管理员用户名
```

管理员密码和 JWT 密钥使用 Secret：

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET
```

`JWT_SECRET` 可以使用随机字符串，例如：

```text
f5b8a67d7b9b4f4f8d0b9d2e4a7c9f3e
```

### 6. 执行 D1 迁移

如果项目中存在 `migrations/` 目录，执行：

```powershell
npx wrangler d1 migrations apply cloudflare-webdav --remote
```

### 7. 部署 Worker

```powershell
npx wrangler deploy
```

### 8. 部署管理员后台 Pages

```powershell
npx wrangler pages project create cloudflare-webdav-admin
npx wrangler pages deploy .\pages-admin --project-name cloudflare-webdav-admin
```

### 9. 部署用户端 Pages

```powershell
npx wrangler pages project create cloudflare-webdav-user
npx wrangler pages deploy .\pages-user --project-name cloudflare-webdav-user
```

如果 Pages 和 Worker 不在同一个域名下，需要给 Worker 配置 CORS，或者在 Cloudflare 中绑定自定义域名，让前端和 API 保持同源。

## 部署方式二：一键脚本部署

适合想减少手动操作的用户。

### Windows

```powershell
npx wrangler login
.\scripts\deploy.ps1
```

只部署前端页面：

```powershell
.\scripts\deploy.ps1 -SkipWorker
```

自定义资源名称：

```powershell
.\scripts\deploy.ps1 `
  -WorkerName cloudflare-webdav `
  -D1Name cloudflare-webdav `
  -KVNamespaceName cloudflare-webdav-files `
  -AdminPagesProject cloudflare-webdav-admin `
  -UserPagesProject cloudflare-webdav-user
```

### Linux / macOS

```bash
npx wrangler login
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

只部署前端页面：

```bash
SKIP_WORKER=1 ./scripts/deploy.sh
```

自定义资源名称：

```bash
WORKER_NAME=cloudflare-webdav \
D1_NAME=cloudflare-webdav \
KV_NAMESPACE_NAME=cloudflare-webdav-files \
ADMIN_PAGES_PROJECT=cloudflare-webdav-admin \
USER_PAGES_PROJECT=cloudflare-webdav-user \
./scripts/deploy.sh
```

## 部署方式三：GitHub 自动部署

适合代码已经上传到 GitHub，希望每次 push 后自动部署到 Cloudflare 的用户。

### 1. 上传项目到 GitHub

```powershell
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/cloudflare-webdav.git
git push -u origin main
```

如果提示远端已有内容：

```powershell
git pull --rebase origin main
git push
```

### 2. 创建 Cloudflare API Token

进入 Cloudflare 后台：

```text
My Profile -> API Tokens -> Create Token
```

建议权限：

```text
Account - Cloudflare Pages - Edit
Account - Workers Scripts - Edit
Account - Workers KV Storage - Edit
Account - D1 - Edit
Account - Account Settings - Read
Zone - Zone - Read
```

如果只部署 Pages，可以只保留 Pages 相关权限。

### 3. 获取 Cloudflare Account ID

进入 Cloudflare 控制台右侧栏，复制 `Account ID`。

### 4. 在 GitHub 仓库添加 Secrets

进入 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

添加：

| Secret 名称 | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

管理员账号、管理员密码和 `JWT_SECRET` 仍建议在 Cloudflare Worker 的变量与密钥中配置，不建议放入 GitHub。

### 5. 添加 GitHub Actions 文件

新建文件：

```text
.github/workflows/deploy.yml
```

内容示例：

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: |
          if [ -f package.json ]; then npm install; fi

      - name: Deploy Worker
        if: ${{ hashFiles('wrangler.jsonc') != '' }}
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Deploy admin Pages
        run: npx wrangler pages deploy ./pages-admin --project-name cloudflare-webdav-admin
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

      - name: Deploy user Pages
        run: npx wrangler pages deploy ./pages-user --project-name cloudflare-webdav-user
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

提交后推送：

```powershell
git add .github/workflows/deploy.yml
git commit -m "add cloudflare github action"
git push
```

以后只要推送到 `main` 分支，GitHub Actions 就会自动部署。

## 使用方法

### 管理员后台

打开管理员 Pages 地址：

```text
https://cloudflare-webdav-admin.pages.dev
```

使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。

管理员可以：

- 新增普通用户
- 禁用或启用普通用户
- 重置普通用户密码

### 用户端网页

打开用户 Pages 地址：

```text
https://cloudflare-webdav-user.pages.dev
```

普通用户使用管理员创建的账号登录后，可以在网页中：

- 查看文件
- 上传文件
- 下载文件
- 新建文件夹
- 删除文件

### WebDAV 客户端

WebDAV 地址：

```text
https://你的 Worker 域名/dav/
```

用户名和密码使用管理员创建的普通用户账号。

## 常见问题

### D1 能不能存文件？

D1 可以存数据，但不适合直接存 20 MB 文件正文。本项目使用 D1 存用户、目录、文件名、大小、时间等元数据，使用 KV 存文件内容。

### 没有 R2 可以用吗？

可以。本项目设计目标就是不依赖 R2。

### 文件大小有限制吗？

建议单文件不超过 20 MB。本项目更适合配置文件、小型备份文件，不适合大文件网盘。

### GitHub Actions 会不会泄露管理员密码？

不会，只要你不要把 `ADMIN_PASSWORD` 和 `JWT_SECRET` 写进仓库。推荐在 Cloudflare Worker 的“变量与密钥”中维护它们。

### Pages 打开了，但登录或文件列表失败？

通常是以下原因：

- Worker 后端没有部署成功。
- Pages 和 Worker 不同源，Worker 没有配置 CORS。
- 前端请求的 API 地址和实际 Worker 地址不一致。
- Cloudflare 变量或密钥没有配置完整。

## 更多文档

- [详细部署教程](docs/deployment.zh-CN.md)
- [中文设计文档](docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.zh-CN.md)
- [中文实现计划](docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.zh-CN.md)
