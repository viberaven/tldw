const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { generateVoice } = require("./tts");

const db = new Database(path.join(__dirname, "data", "tldw.db"));
const voiceDir = path.join(__dirname, "voice");

const videos = db
  .prepare("SELECT video_id, video_title, abstract, summary, caption_language FROM videos")
  .all();

const needsVoice = videos.filter(
  (v) => !fs.existsSync(path.join(voiceDir, `${v.video_id}.mp3`)),
);

if (needsVoice.length === 0) {
  console.log("All videos already have audio. Nothing to do.");
  process.exit(0);
}

console.log(`Found ${needsVoice.length} video(s) needing audio.\n`);

(async () => {
  let done = 0;
  for (const video of needsVoice) {
    try {
      console.log(`[${video.video_id}] ${video.video_title}`);
      await generateVoice(video.video_id, video.abstract, video.summary, video.caption_language);
      done++;
      console.log(
        `[${video.video_id}] Done (${done}/${needsVoice.length})\n`,
      );
    } catch (err) {
      console.error(`[${video.video_id}] Error: ${err.message}\n`);
    }
  }

  console.log(`\nGenerated audio for ${done}/${needsVoice.length} video(s).`);
  process.exit(0);
})();
