# Cloudflare WebDAV 简化部署方案

## 当前结论

项目实现时建议提供两种简化部署方式：

1. **本地一键部署脚本**：适合自己电脑上执行，一条命令创建 D1、KV、设置管理员密钥和 JWT 密钥、部署 Worker。
2. **GitHub Actions 自动部署**：适合以后改代码后 `git push`，GitHub 自动部署到 Cloudflare。

首版推荐先做 **本地一键部署脚本**，因为它最直观，排错也最简单。等项目跑通后，再加 GitHub Actions。

## 管理员配置方式

管理员不通过 bootstrap 接口创建，也不存入 GitHub。

管理员账号由用户在 Cloudflare 后台的 **变量与密钥** 中自行添加：

- `ADMIN_USERNAME`：管理员用户名。
- `ADMIN_PASSWORD`：管理员密码，必须作为 Secret 保存。
- `JWT_SECRET`：JWT 会话签名密钥，必须作为 Secret 保存。

Worker 启动后，管理员登录接口直接读取这些绑定来验证管理员身份，并用 `JWT_SECRET` 签发管理员会话 JWT。管理员可以登录后台后创建普通 WebDAV 用户。

这种方式的好处：

- 不需要首个管理员 bootstrap API。
- 不需要把管理员写入 D1。
- 不会把管理员密码提交到代码仓库。
- 部署流程更简单。

## 方案一：本地一键部署

后续代码实现时，在项目根目录提供：

```text
scripts/deploy.ps1
```

你只需要执行：

```powershell
.\scripts\deploy.ps1
```

脚本负责：

- 检查是否已安装依赖。
- 检查是否已登录 Cloudflare。
- 创建 D1 数据库。
- 创建 KV 命名空间。
- 自动把 D1/KV ID 写入 `wrangler.jsonc`。
- 应用 D1 数据库迁移。
- 提示设置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。
- 部署 Worker。
- 输出 Worker 访问地址。

需要你手动做的只有：

- 第一次运行 `npx wrangler login` 登录 Cloudflare。
- 输入管理员用户名。
- 输入管理员密码。
- 输入或自动生成 JWT_SECRET。

## 方案二：GitHub Actions 自动部署

后续可以添加：

```text
.github/workflows/deploy.yml
```

以后你只需要：

```powershell
git add .
git commit -m "feat: update webdav"
git push
```

GitHub 会自动：

- 安装依赖。
- 类型检查。
- 执行测试。
- 部署 Worker 到 Cloudflare。

这种方式需要在 GitHub 仓库设置 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

D1 和 KV 建议仍然先用本地脚本创建一次，然后把资源 ID 固定在 `wrangler.jsonc`。

管理员账号和 `JWT_SECRET` 仍然在 Cloudflare Worker 的变量与密钥中设置，不放进 GitHub Actions。

## Pages 管理后台部署

管理后台前端目录是：

```text
pages-admin
```

后端 Worker API 实现完成后，可以用 Wrangler 部署 Pages：

```powershell
npx wrangler pages project create cloudflare-webdav-admin
npx wrangler pages deploy .\pages-admin --project-name cloudflare-webdav-admin
```

如果 Pages 和 Worker 不在同一个域名下，需要在 Worker 中允许 Pages 域名的 CORS，或者在 Cloudflare 中用自定义域名/路由让前端和 API 同源。

## 为什么不能完全零配置

Cloudflare 部署至少需要这些账户级操作：

- 授权 Wrangler 或 API Token。
- 创建 D1 数据库。
- 创建 KV 命名空间。
- 设置管理员变量、管理员密钥和 JWT 密钥。

这些操作不能安全地硬编码在代码里，所以“真正零配置一键部署”不可取。合理做法是把它们封装成脚本，让你只确认授权和输入必要密钥。

## 推荐实现要求

后续写代码时，需要额外加入：

- `scripts/deploy.ps1`：Windows 一键部署脚本。
- `scripts/deploy.sh`：Linux/macOS 一键部署脚本。
- `.github/workflows/deploy.yml`：GitHub Actions 自动部署。
- `docs/deployment.zh-CN.md`：完整中文部署说明。
- 管理员认证读取 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，JWT 签名读取 `JWT_SECRET`，不再实现 bootstrap 创建管理员接口。
<<<<<<< HEAD
=======



>>>>>>> 7239ade (feat: add admin frontend)
