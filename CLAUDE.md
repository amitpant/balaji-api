# CLAUDE.md — balaji-api

REST API for the Balaji Construction portfolio site and admin panel.

## Read first

The specs live in the `balaji-docs` repo. Before any change, read:
- `03-data-model.md` for records and fields
- `04-api-contract.md` for endpoints and the error shape
- `tasks/backlog.md` for the task you are doing

If the code and the docs disagree, stop and ask; do not silently change the contract.

## Stack

Node.js 20+ (ES modules), Express, Mongoose (MongoDB Atlas), Zod for validation, Vitest + Supertest for tests.

## Layout

```
src/
  app.js          # createApp(): middleware + routes, no DB connect (testable)
  server.js       # connects MongoDB, starts the server
  config/env.js   # validated environment variables
  models/         # Mongoose models, one per file
  routes/         # one router per resource (public and admin split)
  middleware/     # auth, validation, errors
  services/       # Cloudinary, email
tests/            # *.test.js
```

## Rules

- Public routes never return unpublished records.
- Every route validates input with Zod and returns the error shape from the contract.
- Admin routes go through the auth middleware; no exceptions.
- Every new route gets a test. `npm run lint && npm test` must pass before a PR.
- Never commit `.env` or secrets.
- One task per branch (`p2-1-project-routes`) and pull request; reference the task ID.
