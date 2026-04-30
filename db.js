import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'streetcred.db');

let db;

export async function initDb() {
  const SQL = await initSqlJs();
  db = existsSync(DB_PATH)
    ? new SQL.Database(readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`
    CREATE TABLE IF NOT EXISTS plates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT NOT NULL UNIQUE,
      country TEXT DEFAULT 'NZ',
      registered INTEGER DEFAULT 0,
      owner_first_name TEXT,
      owner_email TEXT,
      show_email INTEGER DEFAULT 0,
      previous_owner_cutoff INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_id INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      event_tags TEXT NOT NULL,
      location_suburb TEXT,
      location_intersection TEXT,
      photo_path TEXT,
      rater_name TEXT,
      disputed INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (plate_id) REFERENCES plates(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS disputes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rating_id INTEGER NOT NULL UNIQUE,
      accused_response TEXT,
      accused_at INTEGER,
      accuser_decision TEXT,
      accuser_decided_at INTEGER,
      moderator_decision TEXT,
      moderator_decided_at INTEGER,
      moderator_notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (rating_id) REFERENCES ratings(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT DEFAULT 'general',
      message TEXT NOT NULL,
      published INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  try { db.run(`ALTER TABLE feedback ADD COLUMN published INTEGER DEFAULT 0`); } catch(e) { /* column already exists */ }

  save();
}

function save() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function lastId() {
  return get('SELECT last_insert_rowid() as id').id;
}

export function getPlateProfile(plateNumber) {
  let plate = get('SELECT * FROM plates WHERE plate_number = ?', [plateNumber]);

  if (!plate) {
    run('INSERT INTO plates (plate_number) VALUES (?)', [plateNumber]);
    plate = get('SELECT * FROM plates WHERE plate_number = ?', [plateNumber]);
  }

  const ratings = all(`
    SELECT r.id, r.stars, r.event_tags, r.location_suburb, r.location_intersection,
           r.photo_path, r.rater_name, r.created_at, r.disputed, r.hidden,
           d.status as dispute_status, d.id as dispute_id
    FROM ratings r
    LEFT JOIN disputes d ON d.rating_id = r.id
    WHERE r.plate_id = ? AND r.hidden = 0
    ORDER BY r.created_at DESC
  `, [plate.id]);

  const avgStars = ratings.length
    ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length
    : null;

  const areaBreakdown = all(`
    SELECT location_suburb, COUNT(*) as count, AVG(stars) as avg_stars
    FROM ratings
    WHERE plate_id = ? AND location_suburb IS NOT NULL AND hidden = 0
    GROUP BY location_suburb
    ORDER BY count DESC
    LIMIT 5
  `, [plate.id]);

  return {
    plate: plate.plate_number,
    country: plate.country,
    registered: plate.registered === 1,
    ownerFirstName: plate.registered ? plate.owner_first_name : null,
    ownerEmail: (plate.show_email === 1 && plate.registered) ? plate.owner_email : null,
    avgStars,
    totalRatings: ratings.length,
    previousOwnerCutoff: plate.previous_owner_cutoff || null,
    ratings: ratings.map(r => ({
      id: r.id,
      stars: r.stars,
      eventTags: JSON.parse(r.event_tags),
      locationSuburb: r.location_suburb,
      locationIntersection: r.location_intersection,
      photoPath: r.photo_path,
      raterName: r.rater_name,
      createdAt: r.created_at,
      disputed: r.disputed === 1,
      disputeStatus: r.dispute_status,
      disputeId: r.dispute_id,
    })),
    areaBreakdown,
  };
}

export function registerPlate(plateNumber, firstName, email, showEmail) {
  const existing = get('SELECT * FROM plates WHERE plate_number = ?', [plateNumber]);

  if (existing) {
    const cutoff = (existing.registered && existing.owner_email !== email)
      ? Math.floor(Date.now() / 1000)
      : (existing.previous_owner_cutoff || null);

    run(`
      UPDATE plates SET
        owner_first_name = ?,
        owner_email = ?,
        show_email = ?,
        registered = 1,
        previous_owner_cutoff = ?,
        updated_at = strftime('%s','now')
      WHERE plate_number = ?
    `, [firstName, email, showEmail, cutoff, plateNumber]);
  } else {
    run(`
      INSERT INTO plates (plate_number, registered, owner_first_name, owner_email, show_email)
      VALUES (?, 1, ?, ?, ?)
    `, [plateNumber, firstName, email, showEmail]);
  }

  return { success: true };
}

export function submitRating({ plate, stars, eventTags, locationSuburb, locationIntersection, raterName, photoPath }) {
  let plateRecord = get('SELECT id FROM plates WHERE plate_number = ?', [plate]);

  if (!plateRecord) {
    run('INSERT INTO plates (plate_number) VALUES (?)', [plate]);
    plateRecord = get('SELECT id FROM plates WHERE plate_number = ?', [plate]);
  }

  run(`
    INSERT INTO ratings (plate_id, stars, event_tags, location_suburb, location_intersection, rater_name, photo_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    plateRecord.id,
    stars,
    JSON.stringify(eventTags),
    locationSuburb || null,
    locationIntersection || null,
    raterName || null,
    photoPath || null,
  ]);

  return { success: true, ratingId: lastId() };
}

export function getRating(ratingId) {
  const r = get(`
    SELECT r.*, p.plate_number,
           d.id as dispute_id, d.status as dispute_status, d.accused_response
    FROM ratings r
    JOIN plates p ON p.id = r.plate_id
    LEFT JOIN disputes d ON d.rating_id = r.id
    WHERE r.id = ?
  `, [ratingId]);
  if (!r) return null;
  return { ...r, eventTags: JSON.parse(r.event_tags) };
}

export function createDispute(ratingId, response) {
  const rating = get('SELECT id FROM ratings WHERE id = ?', [ratingId]);
  if (!rating) throw new Error('Rating not found');
  const existing = get('SELECT id FROM disputes WHERE rating_id = ?', [ratingId]);
  if (existing) throw new Error('Dispute already filed');

  run(`
    INSERT INTO disputes (rating_id, accused_response, accused_at, status)
    VALUES (?, ?, strftime('%s','now'), 'accused_responded')
  `, [ratingId, response]);

  run('UPDATE ratings SET disputed = 1 WHERE id = ?', [ratingId]);
  return { success: true, disputeId: lastId() };
}

export function getDispute(disputeId) {
  const d = get(`
    SELECT d.*, r.stars, r.event_tags, r.location_suburb, r.rater_name,
           r.created_at as rating_created_at, p.plate_number
    FROM disputes d
    JOIN ratings r ON r.id = d.rating_id
    JOIN plates p ON p.id = r.plate_id
    WHERE d.id = ?
  `, [disputeId]);
  if (!d) return null;
  return { ...d, eventTags: JSON.parse(d.event_tags) };
}

export function accuserDecision(disputeId, decision) {
  const dispute = get('SELECT * FROM disputes WHERE id = ?', [disputeId]);
  if (!dispute) throw new Error('Dispute not found');

  if (decision === 'dropped') {
    run(`UPDATE disputes SET accuser_decision='dropped', accuser_decided_at=strftime('%s','now'), status='resolved' WHERE id=?`, [disputeId]);
    run('UPDATE ratings SET hidden=1 WHERE id=?', [dispute.rating_id]);
  } else {
    run(`UPDATE disputes SET accuser_decision='upheld', accuser_decided_at=strftime('%s','now'), status='mod_queue' WHERE id=?`, [disputeId]);
  }
  return { success: true };
}

export function getModeratorQueue() {
  return all(`
    SELECT d.*, r.stars, r.event_tags, r.location_suburb, r.rater_name,
           r.created_at as rating_created_at, p.plate_number
    FROM disputes d
    JOIN ratings r ON r.id = d.rating_id
    JOIN plates p ON p.id = r.plate_id
    WHERE d.status IN ('accused_responded', 'mod_queue')
    ORDER BY d.created_at ASC
  `).map(d => ({ ...d, eventTags: JSON.parse(d.event_tags) }));
}

export function moderatorDecision(disputeId, decision, notes) {
  const dispute = get('SELECT * FROM disputes WHERE id = ?', [disputeId]);
  if (!dispute) throw new Error('Dispute not found');

  run(`
    UPDATE disputes SET
      moderator_decision = ?,
      moderator_notes = ?,
      moderator_decided_at = strftime('%s','now'),
      status = 'resolved'
    WHERE id = ?
  `, [decision, notes || null, disputeId]);

  if (decision === 'dropped') {
    run('UPDATE ratings SET hidden=1 WHERE id=?', [dispute.rating_id]);
  }
  return { success: true };
}

export function getRecentFeed() {
  return all(`
    SELECT r.id, r.stars, r.event_tags, r.location_suburb, r.location_intersection,
           r.rater_name, r.created_at,
           p.plate_number, p.registered, p.owner_first_name
    FROM ratings r
    JOIN plates p ON p.id = r.plate_id
    WHERE r.hidden = 0
    ORDER BY r.created_at DESC
    LIMIT 20
  `).map(r => ({ ...r, eventTags: JSON.parse(r.event_tags) }));
}

export function searchPlates(query) {
  return all(`
    SELECT p.plate_number, p.registered, p.owner_first_name,
           COUNT(r.id) as rating_count,
           AVG(r.stars) as avg_stars
    FROM plates p
    LEFT JOIN ratings r ON r.plate_id = p.id AND r.hidden = 0
    WHERE p.plate_number LIKE ?
    GROUP BY p.id
    ORDER BY rating_count DESC
    LIMIT 10
  `, [`${query}%`]);
}

export function submitFeedback({ name, category, message }) {
  run(`INSERT INTO feedback (name, category, message) VALUES (?, ?, ?)`,
    [name || null, category || 'general', message]);
  return { success: true, feedbackId: lastId() };
}

export function getFeedback() {
  return all(`SELECT * FROM feedback ORDER BY created_at DESC`);
}

export function toggleFeedbackPublished(id) {
  run(`UPDATE feedback SET published = CASE WHEN published = 1 THEN 0 ELSE 1 END WHERE id = ?`, [id]);
  const row = get(`SELECT published FROM feedback WHERE id = ?`, [id]);
  return { success: true, published: row?.published === 1 };
}

export function getPublishedFeedback() {
  return all(`SELECT id, name, category, message, created_at FROM feedback WHERE published = 1 ORDER BY created_at DESC`);
}
