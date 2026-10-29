# balaji-api

REST API for the Balaji Construction website and admin panel, running on **Cloudflare Workers** with a **D1** database.
Photos go straight from the browser to Cloudinary; videos stay on YouTube. Specs: `balaji-docs`.

## Run locally

```bash
cp .dev.vars.example .dev.vars   # fill in the values
npm install
npm run dev                      # http://localhost:8787/api/health (local D1)
npm test                         # end-to-end tests against a local D1
```

## Deploy

Cloudflare → Workers & Pages → Create → Import a repository → `balaji-api`.
Build command: empty. Deploy command: `npx wrangler deploy`.
Then add the secrets from `.dev.vars.example` under **Settings → Variables and Secrets**.
Tables are created automatically on the first request.

## Endpoints

| Access | Endpoints |
| --- | --- |
| Public | `GET /api/health`, `GET /api/projects`, `GET /api/projects/:slug`, `GET /api/testimonials`, `GET /api/settings`, `POST /api/enquiries` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` |
| Admin | projects CRUD, `POST /api/admin/uploads/sign`, testimonials CRUD, enquiries list + status, settings (contact details, About text in English and Hindi, services offered, social links, Facebook Pixel ID) |

## Enquiries

`POST /api/enquiries` stores the visitor's language (`en`/`hi`). Limits: 5 per IP per hour, honeypot field `website`.

## First admin login

Set the `ADMIN_EMAIL` and `ADMIN_PASSWORD` secrets. The first login creates the owner account if none exists. Delete both secrets afterwards and change the password from the admin panel.
