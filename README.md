# balaji-api

Node.js + Express REST API for the Balaji Construction website and admin panel.
Specs: see the `balaji-docs` repo.

## Run locally

```bash
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev            # http://localhost:4000/api/health
```

## Endpoints

Public: `GET /api/projects`, `GET /api/projects/:slug`, `GET /api/testimonials`, `GET /api/settings`, `POST /api/enquiries`.
Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
Admin (login required): projects CRUD, `POST /api/admin/uploads/sign`, testimonials CRUD, enquiries list + status, settings (incl. social links and Facebook Pixel ID).
Full contract: `balaji-docs/04-api-contract.md`.

## First admin login

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the host. On start, if no admin exists, the API creates one. Remove both variables after the first login.

## Deploy (Render)

`render.yaml` is a Render Blueprint: Render → New → Blueprint → this repo, then fill in the secrets it asks for.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm start` | Start for production |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
