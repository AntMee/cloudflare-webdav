# Cloudflare Dashboard 部署教程

本文档说明如何在 `https://dash.cloudflare.com/` 中部署 Cloudflare WebDAV。

项目分为三部分：

- **Worker 后端**：提供 WebDAV 接口和管理员 API。
- **Pages 管理员后台**：`pages-admin/`。
- **Pages 用户端文件管理器**：`pages-user/`。

推荐流程是：先把代码上传到 GitHub，再在 Cloudflare Dashboard 中连接 GitHub 仓库部署。

## 1. 上传代码到 GitHub

在项目根目录执行：

```powershell
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的用户名/cloudflare-webdav.git
git push -u origin main
```

如果推送时提示远端已有内容：

```powershell
git pull --rebase origin main
git push
```

## 2. 创建 D1 数据库

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

这个 D1 数据库由用户自己在 Cloudflare 中创建。创建完成后，记录数据库 ID。

## 3. 创建 KV 命名空间

进入：

```text
Workers & Pages -> KV -> Create namespace
```

命名空间名称建议填写：

```text
webdav_files
```

这个 KV 命名空间由用户自己在 Cloudflare 中创建。创建完成后，记录 KV Namespace ID。

## 4. 部署 Worker

进入：

```text
Workers & Pages -> Create application -> Worker
```

Worker 名称建议填写：

```text
cloudflare-webdav
```

如果 Cloudflare 页面提供 GitHub 导入入口，可以选择你的 GitHub 仓库。如果使用在线编辑器，则需要把 Worker 后端代码复制进去。

## 5. 绑定 D1 和 KV

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

如果后端代码使用了不同的绑定名称，请以代码中的名称为准。

## 6. 添加管理员变量与密钥

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

`JWT_SECRET` 建议使用随机长字符串，不要提交到 GitHub。

## 7. 部署管理员后台 Pages

进入：

```text
Workers & Pages -> Create application -> Pages -> Connect to Git
```

选择 GitHub 仓库后填写：

```text
Project name: cloudflare-webdav-admin
Production branch: main
Root directory: pages-admin
Build command: 留空
Build output directory: .
```

保存并部署。

## 8. 部署用户端 Pages

再次进入：

```text
Workers & Pages -> Create application -> Pages -> Connect to Git
```

选择同一个 GitHub 仓库后填写：

```text
Project name: cloudflare-webdav-user
Production branch: main
Root directory: pages-user
Build command: 留空
Build output directory: .
```

保存并部署。

## 9. 配置前端访问 Worker

用户端页面需要访问 Worker 的 `/api/*` 和 `/dav/*` 接口。

推荐选择一种方式：

- 给 Worker 和 Pages 配置同一个自定义域名下的路由。
- 在 Worker 中允许 Pages 域名跨域访问。
- 把前端 API 地址配置为你的 Worker 地址。

## 10. GitHub 自动部署

使用 Cloudflare Pages 的 GitHub 连接部署后，以后只要推送到 GitHub 的 `main` 分支，Cloudflare Pages 会自动重新部署前端。

如果你还想用 GitHub Actions 部署 Worker，需要在 GitHub 仓库添加：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

管理员密码和 `JWT_SECRET` 仍建议只放在 Cloudflare Worker 的变量与密钥中。

## 常见问题

### 没有 R2 可以部署吗？

可以。本项目使用 D1 + KV，不依赖 R2。

### D1 能直接存文件吗？

不建议。D1 用来存用户、目录、文件名、大小、时间等元数据；KV 用来存文件正文。

### Pages 能打开，但登录失败怎么办？

通常是以下原因：

- Worker 没有部署成功。
- D1 或 KV 绑定名称不正确。
- `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`JWT_SECRET` 没有配置。
- Pages 和 Worker 不同源，且 Worker 没有允许跨域。
