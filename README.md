# StreetCred

Rate NZ drivers and parkers by licence plate. Look up any plate to see their road reputation, or rate a driver you encountered today.

**Live:** [streetcred.nz](https://streetcred.thebottinger.com)

---

## Features

- **Plate lookup** — search any NZ licence plate to see its ratings, average score, and area breakdown
- **Rating submission** — 1–5 stars, behaviour tags, suburb/intersection, optional photo upload
- **Plate registration** — owners can claim their plate and receive dispute notifications
- **Dispute resolution** — two-tier system: rater responds first, then escalates to moderator if unresolved
- **Moderator dashboard** — password-protected queue for dispute rulings and feedback moderation
- **Public feedback** — users can submit suggestions and bug reports; moderators publish selected ones

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Tailwind CSS (CDN), vanilla JS (SPA) |
| Backend | Node.js, Express |
| Database | SQLite via sql.js (file-persisted) |
| File uploads | Multer (images, max 10 MB) |

---

## Getting Started

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `MOD_PASSWORD` | `streetcred-mod-2024` | Bearer token for moderator endpoints |
| `DB_PATH` | `./streetcred.db` | SQLite database file path |
| `UPLOADS_PATH` | `./uploads` | Directory for uploaded photos |

Set these in your shell or a `.env` file before running. **Change `MOD_PASSWORD` before deploying.**

---

## API

All endpoints are relative to the server root.

### Plates

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/plates/:plate` | Plate profile — ratings, average stars, area breakdown |
| `POST` | `/api/plates/register` | Claim a plate (body: `plate`, `firstName`, `email`, optional `showEmail`) |

### Ratings

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ratings` | Submit a rating (multipart: `plate`, `stars`, `eventTags` JSON, optional `locationSuburb`, `locationIntersection`, `raterName`, photo file) |
| `GET` | `/api/ratings/:id` | Fetch a single rating |

### Disputes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/disputes` | Dispute a rating (body: `ratingId`, `response`) |
| `GET` | `/api/disputes/:id` | View dispute details |
| `PUT` | `/api/disputes/:id/accuser` | Rater resolves dispute (body: `decision`: `upheld` or `dropped`) |

### Moderator *(requires `Authorization: Bearer {MOD_PASSWORD}`)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/mod/disputes` | Pending dispute queue |
| `PUT` | `/api/mod/disputes/:id` | Rule on a dispute (body: `decision`, optional `notes`) |
| `GET` | `/api/mod/feedback` | All submitted feedback |
| `PUT` | `/api/mod/feedback/:id/publish` | Toggle feedback visibility |

### Feed & Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/feed` | 20 most recent ratings |
| `GET` | `/api/search?q=ABC` | Plate search (min 2 characters) |
| `POST` | `/api/feedback` | Submit feedback (body: `message`, optional `name`, `category`) |
| `GET` | `/api/feedback` | Published feedback |

---

## Dispute Flow

```
Rating submitted
      ↓
Plate owner disputes → provides written response
      ↓
Original rater decides: upheld or dropped
      ↓ (if no response within deadline, or rater escalates)
Moderator rules: upheld or dropped → rating hidden or restored
```

---

## Database Schema

Four tables: `plates`, `ratings`, `disputes`, `feedback`.

**Key design decisions:**
- Plate numbers are normalised to uppercase alphanumeric on write
- Ratings are soft-deleted (`hidden = true`) rather than removed
- A `previous_owner_cutoff` timestamp on each plate hides ratings predating an ownership change
- Uploaded photos are stored as `{timestamp}-{random}.{ext}` and served at `/uploads/`

---

## Project Structure

```
├── index.html       # Single-page app (all UI and client-side JS)
├── server.js        # Express server and API routes
├── db.js            # Database schema, queries, and persistence logic
├── serve.mjs        # Dev server alias (delegates to server.js)
├── screenshot.mjs   # Puppeteer screenshot utility
├── package.json
└── uploads/         # User-uploaded photos (gitignored)
```

---

## License

MIT
