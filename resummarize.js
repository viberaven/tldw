const Database = require("better-sqlite3");
const path = require("path");
const { processVideo } = require("./gemini");

const db = new Database(path.join(__dirname, "data", "tldw.db"));

const videos = db
  .prepare(
    "SELECT video_id, channel_name, video_title, video_description, captions_raw FROM videos ORDER BY processed_at DESC",
  )
  .all();

if (videos.length === 0) {
  console.log("No videos in database.");
  process.exit(0);
}

console.log(`Found ${videos.length} video(s) to resummarize.\n`);

const update = db.prepare(`
  UPDATE videos SET abstract = ?, summary = ? WHERE video_id = ?
`);

(async () => {
  let done = 0;
  for (const video of videos) {
    try {
      console.log(`[${video.video_id}] ${video.video_title}`);
      const aiResult = await processVideo({
        videoId: video.video_id,
        title: video.video_title,
        author: video.channel_name,
        description: video.video_description || "",
        captionsText: video.captions_raw,
      });

      update.run(aiResult.abstract, aiResult.summary, video.video_id);
      done++;
      console.log(`[${video.video_id}] Done (${done}/${videos.length})\n`);
    } catch (err) {
      console.error(`[${video.video_id}] Error: ${err.message}\n`);
    }
  }

  console.log(`\nResummarized ${done}/${videos.length} video(s).`);
  process.exit(0);
})();
