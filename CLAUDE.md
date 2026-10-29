# CLAUDE.md — balaji-api

REST API for the Balaji Construction portfolio site and admin panel.

## Read first

The specs live in the `balaji-docs` repo. Before any change, read:
- `03-data-model.md` for records and fields
- `04-api-contract.md` for endpoints and the error shape
- `tasks/backlog.md` for the task you are doing

If the code and the docs disagree, stop and ask; do not silently change the contract.

## Stack

Cloudflare Workers + Hono (Express-style routing), D1 (SQLite) database, Zod for validation, Web Crypto for passwords and Cloudinary signing, Vitest against a local D1 via Wrangler's `getPlatformProxy`.

## Layout

```
src/
  index.js      # Hono app: all routes, auth, error shape
  db.js         # D1 schema (auto-created) and queries; records = columns + JSON `data`
  schemas.js    # Zod input schemas
  crypto.js     # PBKDF2 passwords, Cloudinary signature
  constants.js
tests/          # end-to-end tests on a local D1
```

## Rules

- Public routes never return unpublished records.
- Every route validates input with Zod and returns the error shape from the contract.
- Admin routes go through the auth middleware; no exceptions.
- Every new route gets a test. `npm run lint && npm test` must pass before a PR.
- Never commit `.dev.vars` or secrets.
- Keep CPU per request small (Workers free plan): no heavy loops, use Web Crypto.
- One task per branch (`p2-1-project-routes`) and pull request; reference the task ID.
