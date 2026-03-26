const config = require("./config");
const fs = require("fs");
const path = require("path");

const voiceDir = path.join(__dirname, "voice");
fs.mkdirSync(voiceDir, { recursive: true });

// Map 2-letter language codes to Google Cloud TTS locale codes
const LANG_MAP = {
  cs: "cs-CZ",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  pl: "pl-PL",
  pt: "pt-BR",
  ru: "ru-RU",
  sk: "sk-SK",
  uk: "uk-UA",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
};

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, "") // headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/^[-*]\s+/gm, "") // bullet points
    .replace(/^\d+\.\s+/gm, "") // numbered lists
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/>\s+/g, "") // blockquotes
    .trim();
}

// Split text into chunks of max ~4500 chars (under 5000 limit), breaking at sentence boundaries
function chunkText(text, maxLen = 4500) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    const window = remaining.slice(0, maxLen);

    // Find last sentence boundary (. ! ? followed by space/newline)
    let cutoff = -1;
    for (let i = window.length - 1; i >= maxLen * 0.3; i--) {
      const ch = window[i];
      const next = window[i + 1];
      if ((ch === "." || ch === "!" || ch === "?") && (!next || next === " " || next === "\n")) {
        cutoff = i;
        break;
      }
    }

    // Fallback: split at last newline (paragraph boundary)
    if (cutoff === -1) {
      cutoff = window.lastIndexOf("\n");
    }

    // Fallback: split at last space
    if (cutoff === -1 || cutoff < maxLen * 0.3) {
      cutoff = window.lastIndexOf(" ");
    }

    // Last resort: hard cut
    if (cutoff === -1) {
      cutoff = maxLen - 1;
    }

    chunks.push(remaining.slice(0, cutoff + 1).trim());
    remaining = remaining.slice(cutoff + 1).trim();
  }

  return chunks;
}

async function synthesizeChunk(text, languageCode) {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${config.GOOGLE_API_TTS_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode,
          name: `${languageCode}-Chirp3-HD-Achernar`,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google TTS API error ${response.status}: ${err}`);
  }

  const result = await response.json();
  return Buffer.from(result.audioContent, "base64");
}

async function generateVoice(videoId, abstract, summary, language) {
  const outputPath = path.join(voiceDir, `${videoId}.mp3`);

  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  const text = stripMarkdown(abstract) + "\n\n" + stripMarkdown(summary);
  const languageCode = LANG_MAP[language] || LANG_MAP.en;
  const chunks = chunkText(text);

  console.log(
    `[${videoId}] Generating voice: ${chunks.length} chunk(s), lang=${languageCode}`,
  );

  const audioBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const buffer = await synthesizeChunk(chunks[i], languageCode);
    audioBuffers.push(buffer);
  }

  // Concatenate MP3 buffers (MP3 frames are independently decodable)
  const combined = Buffer.concat(audioBuffers);
  fs.writeFileSync(outputPath, combined);
  return outputPath;
}

function getVoicePath(videoId) {
  const p = path.join(voiceDir, `${videoId}.mp3`);
  return fs.existsSync(p) ? p : null;
}

module.exports = { generateVoice, getVoicePath };
