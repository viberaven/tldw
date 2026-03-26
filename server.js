const express = require("express");
const path = require("path");
const { getVideo, saveVideo, getAllVideos } = require("./db");
const { fetchVideoData } = require("./youtube");
const { processVideo } = require("./gemini");
const { generateVoice, getVoicePath } = require("./tts");
const config = require("./config");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// API: Check if video exists in DB
app.get("/api/video/:videoId", (req, res) => {
  const { videoId } = req.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }
  const video = getVideo(videoId);
  if (video) {
    return res.json({ found: true, video });
  }
  return res.json({ found: false });
});

// API: Process a video (fetches data via yt-dlp, processes with Gemini)
app.post("/api/process/:videoId", async (req, res) => {
  const { videoId } = req.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: "Invalid video ID" });
  }

  // Check if already processed
  const existing = getVideo(videoId);
  if (existing) {
    return res.json({ video: existing });
  }

  try {
    console.log(`[${videoId}] Fetching YouTube data via yt-dlp...`);
    const ytData = await fetchVideoData(videoId);

    console.log(`[${videoId}] Processing with Gemini (${config.MODEL})...`);
    const aiResult = await processVideo(ytData);

    const videoRecord = {
      videoId,
      channelId: ytData.channelId,
      channelName: ytData.author,
      channelDescription: ytData.channelDescription,
      channelAvatarUrl: ytData.channelAvatarUrl,
      videoTitle: ytData.title,
      videoDescription: ytData.description,
      thumbnailUrl: ytData.thumbnailUrl,
      abstract: aiResult.abstract,
      summary: aiResult.summary,
      captionsRaw: ytData.captionsText,
      captionLanguage: ytData.captionLanguage,
    };

    saveVideo(videoRecord);
    console.log(`[${videoId}] Saved to database.`);

    // Generate voice narration (non-blocking — don't fail the request if it errors)
    if (config.GOOGLE_API_TTS_KEY) {
      generateVoice(videoId, aiResult.abstract, aiResult.summary, ytData.captionLanguage)
        .then(() => console.log(`[${videoId}] Voice generated.`))
        .catch((err) => console.error(`[${videoId}] Voice error:`, err.message));
    }

    const saved = getVideo(videoId);
    return res.json({ video: saved });
  } catch (err) {
    console.error(`[${videoId}] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// API: Get markdown for download
app.get("/api/video/:videoId/markdown", (req, res) => {
  const { videoId } = req.params;
  const video = getVideo(videoId);
  if (!video) {
    return res.status(404).json({ error: "Video not found" });
  }
  const markdown = generateMarkdown(video);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${videoId}.md"`);
  res.send(markdown);
});

const fs = require("fs");
const markdownTemplate = fs.readFileSync(
  path.join(__dirname, "template.md"),
  "utf8",
);
const videoHtmlTemplate = fs.readFileSync(
  path.join(__dirname, "public", "video.html"),
  "utf8",
);

function generateMarkdown(video) {
  return markdownTemplate.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => video[key] || "",
  );
}

// API: Get voice audio
app.get("/api/video/:videoId/audio", (req, res) => {
  const { videoId } = req.params;
  const voicePath = getVoicePath(videoId);
  if (!voicePath) {
    return res.status(404).json({ error: "Audio not available" });
  }
  res.sendFile(voicePath);
});

// API: Get all videos
app.get("/api/videos", (req, res) => {
  res.json(getAllVideos());
});

// All videos page
app.get("/all", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "all.html"));
});

// Catch-all: serve video page with OG meta tags
app.get("/:videoId", (req, res) => {
  const { videoId } = req.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(404).send("Not found");
  }

  const video = getVideo(videoId);

  const escHtml = (s) =>
    s
      ? s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
      : "";

  const title = video
    ? `TLDW - ${escHtml(video.video_title)}`
    : "TLDW - Too Long Didn't Watch";
  const description = video
    ? escHtml(video.abstract)
    : "AI-powered YouTube video summary";
  const image = video
    ? escHtml(video.thumbnail_url)
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const url = `https://tldw.viberaven.com/${videoId}`;

  const ogTags = `
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${image}">
    <meta property="og:url" content="${url}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">`;

  let html = videoHtmlTemplate.replace("</head>", ogTags + "\n</head>");
  if (video) {
    html = html.replace(
      "<title>TLDW - Loading...</title>",
      `<title>${title}</title>`,
    );
  }
  res.send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`TLDW server running on http://${HOST}:${PORT}`);
});
