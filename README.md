# Cloudflare WebDAV

Cloudflare WebDAV is a planned Cloudflare Workers project for storing configuration files without R2. It uses Workers, D1, KV, and Pages.

## Goals

- Administrators can create users, disable users, and reset passwords.
- Users can upload, download, and delete configuration files through WebDAV clients.
- File contents are stored in Workers KV with a 20 MB per-file limit.
- Users, permissions, directories, and file metadata are stored in D1.
- The admin UI is hosted on Cloudflare Pages.

## Documentation

- Chinese README: `README.zh-CN.md`
- English design: `docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.md`
- Chinese design: `docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.zh-CN.md`
- English implementation plan: `docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.md`
- Chinese implementation plan: `docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.zh-CN.md`

## Recommended Architecture

- **Worker**: Handles WebDAV protocol and admin APIs.
- **D1**: Stores users, sessions, directories, and file metadata.
- **KV**: Stores file contents.
- **Pages**: Hosts the admin dashboard.

## Why Not Store Files Directly In D1

D1 is better for structured data and is not suitable for 20 MB file bodies. KV can store values large enough for this use case, so the design stores metadata in D1 and file contents in KV.



# Cloudflare WebDAV

这是一个计划中的 Cloudflare WebDAV 项目，目标是在不使用 R2 的情况下，通过 **Workers + D1 + KV + Pages** 实现一个适合配置文件存储的 WebDAV 服务。

## 设计目标

- 管理员可以新增、禁用用户和重置密码。
- 普通用户通过 WebDAV 客户端上传、下载、删除配置文件。
- 文件内容存储在 Workers KV，单文件限制为 20 MB。
- 用户、权限、目录和文件元数据存储在 D1。
- 管理后台使用 Cloudflare Pages 托管。

## 文档

- 英文 README：`README.md`
- 英文设计文档：`docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.md`
- 中文设计文档：`docs/superpowers/specs/2026-06-13-cloudflare-webdav-d1-kv-design.zh-CN.md`
- 英文实现计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.md`
- 中文实现计划：`docs/superpowers/plans/2026-06-13-cloudflare-webdav-d1-kv.zh-CN.md`

## 推荐架构

- **Worker**：处理 WebDAV 协议和管理员 API。
- **D1**：保存用户、会话、目录、文件元数据。
- **KV**：保存文件正文。
- **Pages**：提供管理员后台页面。

## 为什么不用 D1 直接存文件

D1 更适合结构化数据，不适合直接存 20 MB 文件正文。KV 单个 value 最大可覆盖 20 MB 配置文件场景，因此采用 D1 存元数据、KV 存文件内容的方式。
