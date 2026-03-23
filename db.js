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
    channel_name TEXT,
    channel_description TEXT,
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
function getVideo(videoId) {
  return db.prepare('SELECT * FROM videos WHERE video_id = ?').get(videoId);
}

function saveVideo(data) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO videos
    (video_id, channel_name, channel_description, video_title, video_description, thumbnail_url, abstract, summary, captions_raw, caption_language, signal_density, perishability, replaceability, novelty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.videoId,
    data.channelName,
    data.channelDescription,
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

module.exports = { getVideo, saveVideo };
