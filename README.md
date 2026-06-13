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

## 部署方式一：Cloudflare + GitHub 自动部署

适合希望尽量减少手动操作的用户。代码上传到 GitHub 后，GitHub Actions 会自动：

- 创建或复用 D1 数据库 `webdav_db`。
- 创建或复用 KV 命名空间 `webdav_files`。
- 把 D1 `database_id` 和 KV `id` 写入 `wrangler.jsonc`。
- 执行 D1 迁移。
- 部署 Worker。
- 部署管理员 Pages。
- 部署用户端 Pages。

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

打开 Cloudflare Dashboard：

```text
https://dash.cloudflare.com/
```

进入：

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

### 3. 获取 Cloudflare Account ID

在 Cloudflare 控制台右侧栏复制 `Account ID`。

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

### 5. 触发自动部署

推送代码到 `main` 分支：

```powershell
git add .
git commit -m "deploy cloudflare webdav"
git push
```

也可以在 GitHub 仓库中手动运行：

```text
Actions -> Deploy to Cloudflare -> Run workflow
```

部署完成后，Cloudflare 中会自动出现：

```text
D1 database: webdav_db
KV namespace: webdav_files
Worker: cloudflare-webdav
Pages: cloudflare-webdav-admin
Pages: cloudflare-webdav-user
```

### 6. 添加管理员变量与密钥

管理员账号仍然建议由用户自己在 Cloudflare Worker 的变量与密钥中配置。

进入 Cloudflare Dashboard：

```text
Workers & Pages -> cloudflare-webdav -> Settings -> Variables and Secrets
```

添加普通变量：

```text
ADMIN_USERNAME=你的管理员用户名
```

添加 Secret：

```text
ADMIN_PASSWORD=你的管理员密码
JWT_SECRET=随机长字符串
```

## 部署方式二：Cloudflare Dashboard 手动绑定

如果你不想使用 GitHub Actions，也可以在 Cloudflare Dashboard 手动创建资源并绑定。

### 1. 创建 D1 数据库

打开 Cloudflare Dashboard：

```text
https://dash.cloudflare.com/
```

进入：

```text
Workers & Pages -> D1 SQL Database -> Create database
```

数据库名称建议填写：

```text
webdav_db
```

这个 D1 数据库由用户自己在 Cloudflare 中创建。创建完成后，记录 D1 数据库 ID，后续绑定 Worker 时会用到。

### 2. 创建 KV 命名空间

进入：

```text
Workers & Pages -> KV -> Create namespace
```

命名空间名称建议填写：

```text
webdav_files
```

这个 KV 命名空间由用户自己在 Cloudflare 中创建。创建完成后，记录 KV Namespace ID，后续绑定 Worker 时会用到。

### 3. 创建或导入 Worker

进入：

```text
Workers & Pages -> Create application -> Worker
```

如果 Cloudflare 页面提供连接 GitHub 仓库的入口，可以选择导入你的 GitHub 仓库。如果使用在线编辑器，则需要把 Worker 后端代码放入 Worker 中。

Worker 名称建议填写：

```text
cloudflare-webdav
```

### 4. 绑定 D1 和 KV

进入 Worker 项目：

```text
Settings -> Bindings
```

添加 D1 绑定：

```text
Variable name: DB
D1 database: webdav_db
```

这里的变量名称必须填写 `DB`，因为 Worker 代码会通过 `env.DB` 访问 D1 数据库。

添加 KV 绑定：

```text
Variable name: KV
KV namespace: webdav_files
```

这里的变量名称必须填写 `KV`，因为 Worker 代码会通过 `env.KV` 访问 KV 命名空间。

如果你的 Worker 代码中使用了其他绑定名称，请以代码中的名称为准。

### 5. 添加管理员变量与密钥

进入 Worker 项目：

```text
Settings -> Variables and Secrets
```

添加普通变量：

```text
ADMIN_USERNAME=你的管理员用户名
```

添加 Secret：

```text
ADMIN_PASSWORD=你的管理员密码
JWT_SECRET=随机长字符串
```

`JWT_SECRET` 可以使用类似下面的随机字符串：

```text
f5b8a67d7b9b4f4f8d0b9d2e4a7c9f3e
```

### 6. 部署管理员后台 Pages

进入：

```text
Workers & Pages -> Create application -> Pages -> Connect to Git
```

选择你的 GitHub 仓库后，创建管理员后台 Pages 项目：

```text
Project name: cloudflare-webdav-admin
Production branch: main
Root directory: pages-admin
Build command: 留空
Build output directory: .
```

保存并部署。

### 7. 部署用户端 Pages

再次进入：

```text
Workers & Pages -> Create application -> Pages -> Connect to Git
```

选择同一个 GitHub 仓库，创建用户端 Pages 项目：

```text
Project name: cloudflare-webdav-user
Production branch: main
Root directory: pages-user
Build command: 留空
Build output directory: .
```

保存并部署。

Cloudflare Pages 官方 Git 集成支持连接 GitHub 仓库，推送代码后会自动构建和部署。参考 Cloudflare 文档：[Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)。

### 8. 配置同源访问

用户端页面需要访问 Worker 的 `/api/*` 和 `/dav/*` 接口。推荐使用其中一种方式：

- 给 Worker 和 Pages 配置同一个自定义域名下的路由。
- 在 Worker 中允许 Pages 域名跨域访问。
- 把前端 API 地址配置为你的 Worker 地址。

## GitHub Actions 文件说明

仓库已经包含：

```text
.github/workflows/deploy.yml
.github/workflows/prepare-cloudflare.mjs
```

`prepare-cloudflare.mjs` 会自动创建或复用 D1/KV，并把真实 ID 写入 `wrangler.jsonc` 后再部署。

如果你要手动维护 GitHub Actions，可以参考下面的流程。

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
