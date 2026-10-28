# balaji-api

Node.js + Express REST API for the Balaji Construction website and admin panel.
Specs: see the `balaji-docs` repo.

## Run locally

```bash
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev            # http://localhost:4000/api/health
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm start` | Start for production |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
