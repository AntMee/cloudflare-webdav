# Cloudflare WebDAV

Cloudflare WebDAV is a planned Cloudflare Workers project for storing configuration files without R2. It uses Workers, D1, KV, and Pages.

## Goals

- Administrators can create users, disable users, and reset passwords.
- The administrator account is configured through Cloudflare variables and secrets, and JWT sessions are signed with `JWT_SECRET`.
- Users can upload, download, and delete configuration files through WebDAV clients.
- File contents are stored in Workers KV with a 20 MB per-file limit.
- Users, permissions, directories, and file metadata are stored in D1.
- The admin UI and user file manager are hosted on Cloudflare Pages.

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
- **Pages**: Hosts the admin dashboard and user file manager.

## Admin Frontend

The static admin frontend is in `pages-admin/`:

- `pages-admin/index.html`
- `pages-admin/styles.css`
- `pages-admin/app.js`

It calls Worker APIs such as `/api/admin/login` and `/api/admin/users`. Deploy this directory to Cloudflare Pages after the Worker API is implemented.

## User Frontend

The user file manager is in `pages-user/`:

- `pages-user/index.html`
- `pages-user/styles.css`
- `pages-user/app.js`

It uses the WebDAV `/dav/` endpoint for login, directory browsing, upload, download, folder creation, and deletion. Deploy it to Cloudflare Pages after the Worker API is implemented, or merge it with the admin frontend in one Pages project.

## Why Not Store Files Directly In D1

D1 is better for structured data and is not suitable for 20 MB file bodies. KV can store values large enough for this use case, so the design stores metadata in D1 and file contents in KV.
