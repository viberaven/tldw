const Database = require('better-sqlite3');
const path = require('path');
const { fetchChannelInfo, fetchChannelId } = require('./youtube');

const db = new Database(path.join(__dirname, 'data', 'tldw.db'));

const videos = db.prepare('SELECT video_id, channel_id, channel_description, channel_avatar_url FROM videos').all();
const needsBackfill = videos.filter(v => !v.channel_avatar_url || !v.channel_id);

if (needsBackfill.length === 0) {
  console.log('All videos already have channel info. Nothing to do.');
  process.exit(0);
}

console.log(`Found ${needsBackfill.length} video(s) needing backfill.\n`);

const update = db.prepare(`
  UPDATE videos SET channel_id = COALESCE(?, channel_id), channel_description = COALESCE(?, channel_description), channel_avatar_url = ? WHERE video_id = ?
`);

(async () => {
  for (const video of needsBackfill) {
    const { video_id } = video;
    try {
      let channelId = video.channel_id;
      if (!channelId) {
        console.log(`[${video_id}] Fetching channel ID...`);
        channelId = await fetchChannelId(video_id);
      }
      if (!channelId) {
        console.log(`[${video_id}] Could not determine channel ID, skipping.`);
        continue;
      }

      console.log(`[${video_id}] Fetching channel info for ${channelId}...`);
      const info = await fetchChannelInfo(channelId);

      if (info.avatarUrl) {
        update.run(channelId, info.description || null, info.avatarUrl, video_id);
        console.log(`[${video_id}] Updated: avatar=${info.avatarUrl}`);
      } else {
        console.log(`[${video_id}] No avatar found.`);
      }
    } catch (err) {
      console.error(`[${video_id}] Error: ${err.message}`);
    }
  }

  console.log('\nBackfill complete.');
  process.exit(0);
})();
