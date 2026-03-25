const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tldw.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT,
    channel_name TEXT,
    channel_description TEXT,
    channel_avatar_url TEXT,
    video_title TEXT,
    video_description TEXT,
    thumbnail_url TEXT,
    abstract TEXT,
    summary TEXT,
    captions_raw TEXT,
    caption_language TEXT,
    signal_density INTEGER,
    perishability INTEGER,
    replaceability INTEGER,
    novelty INTEGER,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrations: add columns that may be missing from older databases
const existingColumns = new Set(db.pragma('table_info(videos)').map(c => c.name));
const migrations = [
  { col: 'channel_id', sql: 'ALTER TABLE videos ADD COLUMN channel_id TEXT' },
  { col: 'channel_avatar_url', sql: 'ALTER TABLE videos ADD COLUMN channel_avatar_url TEXT' },
  { col: 'signal_density', sql: 'ALTER TABLE videos ADD COLUMN signal_density INTEGER' },
  { col: 'perishability', sql: 'ALTER TABLE videos ADD COLUMN perishability INTEGER' },
  { col: 'replaceability', sql: 'ALTER TABLE videos ADD COLUMN replaceability INTEGER' },
  { col: 'novelty', sql: 'ALTER TABLE videos ADD COLUMN novelty INTEGER' },
];
for (const { col, sql } of migrations) {
  if (!existingColumns.has(col)) {
    db.exec(sql);
  }
}

function getVideo(videoId) {
  return db.prepare('SELECT * FROM videos WHERE video_id = ?').get(videoId);
}

function saveVideo(data) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO videos
    (video_id, channel_id, channel_name, channel_description, channel_avatar_url, video_title, video_description, thumbnail_url, abstract, summary, captions_raw, caption_language, signal_density, perishability, replaceability, novelty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.videoId,
    data.channelId ?? null,
    data.channelName,
    data.channelDescription,
    data.channelAvatarUrl ?? null,
    data.videoTitle,
    data.videoDescription,
    data.thumbnailUrl,
    data.abstract,
    data.summary,
    data.captionsRaw,
    data.captionLanguage,
    data.signalDensity ?? null,
    data.perishability ?? null,
    data.replaceability ?? null,
    data.novelty ?? null
  );
}

function getAllVideos() {
  return db.prepare('SELECT video_id, channel_name, channel_avatar_url, video_title, thumbnail_url, processed_at FROM videos ORDER BY processed_at DESC').all();
}

module.exports = { getVideo, saveVideo, getAllVideos };
