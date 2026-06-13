# Cloudflare WebDAV D1 + KV Design

## Goal

Build a Cloudflare-hosted WebDAV service for configuration files up to 20 MB. The service must let an administrator create and manage users, while normal users access their own WebDAV file space through standard WebDAV clients.

## Platform Choice

The project will use Cloudflare Workers for the WebDAV protocol and API layer, Cloudflare D1 for structured data, Workers KV for file contents, and Cloudflare Pages for the administrator UI.

R2 is not required for the first version because the account does not have R2 enabled. D1 alone is not suitable for file bodies because Cloudflare D1 has a per-row / value limit around 2 MB, while Workers KV supports values up to 25 MiB. The service will enforce a 20 MB upload limit.

## Architecture

The Worker exposes two route groups:

- `/dav/*`: WebDAV endpoint used by WebDAV clients.
- `/api/admin/*`: JSON API used by the administrator Pages UI.

Pages hosts a static admin frontend. It calls the Worker admin API to log in, create users, disable users, reset passwords, and inspect metadata.

D1 stores users, sessions, roles, directory records, and file metadata. KV stores file contents by an internal object key derived from the user id and normalized file path.

## Data Model

`users`

- `id`
- `username`
- `password_hash`
- `role`: `admin` or `user`
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
- `kind`: `file` or `directory`
- `kv_key`
- `mime_type`
- `size`
- `etag`
- `created_at`
- `updated_at`

The unique key for `nodes` is `(owner_user_id, path)`. Directory paths end with `/`; file paths do not.

## Authentication And Authorization

WebDAV clients use HTTP Basic Auth. The Worker verifies username and password against D1. Passwords are stored as salted hashes, never plaintext.

The admin UI uses a login endpoint that returns a session token. The token itself is only returned once; D1 stores a hash of the token.

Normal users can only access their own namespace. The external WebDAV path `/` maps to that user's private root. An admin can manage users and metadata through the UI, but WebDAV file operations remain scoped to the authenticated user unless an explicit admin file-management route is added later.

## WebDAV Scope

First version supports:

- `OPTIONS`
- `PROPFIND`
- `GET`
- `HEAD`
- `PUT`
- `DELETE`
- `MKCOL`

First version returns unsupported responses for:

- `LOCK`
- `UNLOCK`
- `COPY`
- `MOVE`
- `PROPPATCH`

This keeps the service compatible with basic mount, browse, upload, download, delete, and create-folder workflows without implementing locking semantics prematurely.

## Request Handling

All paths are normalized before use:

- Decode URL path safely.
- Reject `..`, duplicate separators, control characters, and empty invalid segments.
- Keep all user files inside the authenticated user's namespace.

For `PUT`, the Worker checks `Content-Length` when present and rejects requests above 20 MB. It reads the request body into a KV value, writes metadata to D1, and updates the ETag. Because KV has a same-key write-rate limit, this service assumes low-frequency updates to individual config files.

For `PROPFIND`, the Worker queries D1 for the requested node and children, then returns WebDAV XML with status, resource type, content length, ETag, and modification time.

For `DELETE`, the Worker removes file contents from KV for file nodes and deletes related D1 records. Directory deletion only succeeds when the directory is empty in the first version.

## Admin UI

The Pages admin UI provides:

- Admin login.
- User list.
- Create user.
- Disable / enable user.
- Reset password.
- View per-user file metadata.

It does not need to be a full file manager in the first version. WebDAV clients remain the primary interface for file operations.

## Error Handling

The Worker returns structured JSON errors for admin API routes and WebDAV-compatible status codes for `/dav/*`.

Important cases:

- `401`: missing or invalid credentials.
- `403`: disabled user or unauthorized admin operation.
- `404`: missing file or directory.
- `409`: missing parent directory or directory not empty.
- `413`: upload exceeds 20 MB.
- `405` or `501`: unsupported WebDAV methods.

## Security

Secrets are not stored in source code. Initial admin bootstrap credentials are set through Cloudflare secrets or a one-time bootstrap flow.

Password verification uses Web Crypto APIs available in Workers. Token comparisons use timing-safe comparison logic. Logs must not include passwords, session tokens, or Basic Auth headers.

## Testing

Unit tests cover:

- Path normalization.
- Basic Auth parsing.
- Password hashing and verification.
- WebDAV method routing.
- D1 metadata operations.

Integration tests with local Workers runtime cover:

- Create user through admin API.
- Upload file through WebDAV `PUT`.
- List directory through `PROPFIND`.
- Download file through `GET`.
- Delete file through `DELETE`.
- Reject upload above 20 MB.

Manual verification should include at least one WebDAV client or `curl` sequence.

## Deployment

Wrangler configuration defines:

- Worker entrypoint.
- D1 database binding.
- KV namespace binding.
- Observability enabled.
- Compatibility date set near the project creation date.

Deployment steps:

1. Create D1 database.
2. Create KV namespace.
3. Apply D1 schema migrations.
4. Set admin bootstrap secret.
5. Deploy Worker.
6. Deploy Pages admin UI.

## Out Of Scope For First Version

- R2 storage.
- Multi-tenant shared folders.
- Per-directory ACLs.
- WebDAV locking.
- File version history.
- High-frequency concurrent writes to the same file.
- Large file support beyond 20 MB.

