import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MOD_PASSWORD = process.env.MOD_PASSWORD || 'streetcred-mod-2024';

mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const app = express();
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(__dirname));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  },
});

function normPlate(p) {
  return (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function requireMod(req, res, next) {
  if (req.headers.authorization !== `Bearer ${MOD_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Plates ────────────────────────────────────────────────────────────────────

app.get('/api/plates/:plate', (req, res) => {
  try {
    res.json(db.getPlateProfile(normPlate(req.params.plate)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plates/register', (req, res) => {
  try {
    const { plate, firstName, email, showEmail } = req.body;
    if (!plate || !firstName || !email) return res.status(400).json({ error: 'plate, firstName and email are required' });
    res.json(db.registerPlate(normPlate(plate), firstName.trim(), email.trim().toLowerCase(), showEmail ? 1 : 0));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Ratings ───────────────────────────────────────────────────────────────────

app.post('/api/ratings', upload.single('photo'), (req, res) => {
  try {
    const { plate, stars, eventTags, locationSuburb, locationIntersection, raterName } = req.body;
    if (!plate || !stars || !eventTags) return res.status(400).json({ error: 'plate, stars and eventTags are required' });
    const s = parseInt(stars, 10);
    if (s < 1 || s > 5) return res.status(400).json({ error: 'stars must be 1–5' });
    res.json(db.submitRating({
      plate: normPlate(plate),
      stars: s,
      eventTags: JSON.parse(eventTags),
      locationSuburb: locationSuburb || null,
      locationIntersection: locationIntersection || null,
      raterName: raterName || null,
      photoPath: req.file ? req.file.filename : null,
    }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/ratings/:id', (req, res) => {
  const r = db.getRating(parseInt(req.params.id, 10));
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});

// ── Disputes ──────────────────────────────────────────────────────────────────

app.post('/api/disputes', (req, res) => {
  try {
    const { ratingId, response } = req.body;
    if (!ratingId || !response) return res.status(400).json({ error: 'ratingId and response are required' });
    res.json(db.createDispute(parseInt(ratingId, 10), response.trim()));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/disputes/:id', (req, res) => {
  const d = db.getDispute(parseInt(req.params.id, 10));
  d ? res.json(d) : res.status(404).json({ error: 'Not found' });
});

app.put('/api/disputes/:id/accuser', (req, res) => {
  try {
    const { decision } = req.body;
    if (!['upheld', 'dropped'].includes(decision)) return res.status(400).json({ error: "decision must be 'upheld' or 'dropped'" });
    res.json(db.accuserDecision(parseInt(req.params.id, 10), decision));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Moderator ─────────────────────────────────────────────────────────────────

app.get('/api/mod/disputes', requireMod, (req, res) => {
  res.json(db.getModeratorQueue());
});

app.put('/api/mod/disputes/:id', requireMod, (req, res) => {
  try {
    const { decision, notes } = req.body;
    if (!['upheld', 'dropped'].includes(decision)) return res.status(400).json({ error: "decision must be 'upheld' or 'dropped'" });
    res.json(db.moderatorDecision(parseInt(req.params.id, 10), decision, notes));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Feedback ──────────────────────────────────────────────────────────────────

app.post('/api/feedback', (req, res) => {
  try {
    const { name, category, message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });
    res.json(db.submitFeedback({ name: name?.trim() || null, category: category || 'general', message: message.trim() }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mod/feedback', requireMod, (req, res) => {
  res.json(db.getFeedback());
});

app.put('/api/mod/feedback/:id/publish', requireMod, (req, res) => {
  try {
    res.json(db.toggleFeedbackPublished(parseInt(req.params.id, 10)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/feedback', (req, res) => {
  res.json(db.getPublishedFeedback());
});

// ── Feed & Search ─────────────────────────────────────────────────────────────

app.get('/api/feed', (req, res) => res.json(db.getRecentFeed()));

app.get('/api/search', (req, res) => {
  const q = normPlate(req.query.q || '');
  res.json(q.length >= 2 ? db.searchPlates(q) : []);
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Boot ──────────────────────────────────────────────────────────────────────

await db.initDb();
app.listen(PORT, () => console.log(`StreetCred running at http://localhost:${PORT}`));
