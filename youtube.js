const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execFileAsync = promisify(execFile);

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;gt;/g, '>')
    .replace(/&amp;lt;/g, '<')
    .replace(/&amp;amp;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseCaptionsXml(xml) {
  const entries = [];
  const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeHtmlEntities(match[3]).replace(/\n/g, ' ').trim();
    if (text) {
      entries.push({
        start: parseFloat(match[1]),
        duration: parseFloat(match[2]),
        text
      });
    }
  }
  return entries;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function captionsToText(captions) {
  return captions.map(c => `[${formatTimestamp(c.start)} | ${Math.floor(c.start)}s] ${c.text}`).join('\n');
}

async function fetchVideoData(videoId) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tldw-'));
  const subFile = path.join(tmpDir, 'subs');

  // Use cookies file if available (helps avoid YouTube bot detection)
  // Copy to temp dir so yt-dlp doesn't overwrite the original on failure
  const cookiesFile = path.join(__dirname, 'data', 'cookies.txt');
  let cookiesArgs = [];
  if (fs.existsSync(cookiesFile)) {
    const tmpCookies = path.join(tmpDir, 'cookies.txt');
    fs.copyFileSync(cookiesFile, tmpCookies);
    cookiesArgs = ['--cookies', tmpCookies];
  }

  try {
    // Get metadata
    const { stdout: jsonStr } = await execFileAsync('uvx', [
      'yt-dlp', ...cookiesArgs, '--remote-components', 'ejs:github', '--dump-json', '--skip-download',
      `https://www.youtube.com/watch?v=${videoId}`
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 60000, shell: true });

    const meta = JSON.parse(jsonStr);

    // Determine caption language - prefer original language
    // auto_captions has many langs, pick the one matching the video
    const autoLangs = Object.keys(meta.automatic_captions || {});
    const manualLangs = Object.keys(meta.subtitles || {});

    // Prefer manual subs, then auto subs
    // Filter out non-caption tracks like live_chat
    const realManualLangs = manualLangs.filter(l => l !== 'live_chat');
    let subLang = realManualLangs[0] || '';
    let useAuto = false;

    if (!subLang) {
      // Try to detect original language from auto captions
      // Common: if video is Czech, 'cs' will be in auto_captions
      // YouTube puts the original language first or we can check the video's language
      const origLang = meta.language || '';
      if (origLang && autoLangs.includes(origLang)) {
        subLang = origLang;
      } else {
        // Heuristic: pick 'cs', 'en', or first available
        subLang = autoLangs.includes('cs') ? 'cs' :
                  autoLangs.includes('en') ? 'en' :
                  autoLangs[0] || '';
      }
      useAuto = true;
    }

    if (!subLang) {
      throw new Error('No captions available for this video');
    }

    // Download subtitles
    const subArgs = [
      useAuto ? '--write-auto-sub' : '--write-sub',
      '--sub-lang', subLang,
      '--sub-format', 'srv1',
      '--skip-download',
      '-o', subFile,
      `https://www.youtube.com/watch?v=${videoId}`
    ];

    await execFileAsync('uvx', ['yt-dlp', ...cookiesArgs, '--remote-components', 'ejs:github', ...subArgs], { timeout: 60000, shell: true });

    // Read the subtitle file
    const subFilePath = `${subFile}.${subLang}.srv1`;
    if (!fs.existsSync(subFilePath)) {
      throw new Error(`Subtitle file not found: expected ${subLang}.srv1`);
    }

    const xml = fs.readFileSync(subFilePath, 'utf8');
    const captions = parseCaptionsXml(xml);

    if (captions.length === 0) {
      throw new Error('Failed to parse captions');
    }

    // Get channel description
    let channelDescription = '';
    if (meta.channel_id) {
      try {
        channelDescription = await fetchChannelDescription(meta.channel_id);
      } catch { /* non-critical */ }
    }

    return {
      videoId,
      title: meta.title,
      description: meta.description || '',
      author: meta.channel || meta.uploader || 'Unknown',
      channelId: meta.channel_id,
      channelDescription,
      thumbnailUrl: meta.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      captions,
      captionsText: captionsToText(captions),
      captionLanguage: subLang
    };
  } finally {
    // Cleanup temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function fetchChannelDescription(channelId) {
  const url = `https://www.youtube.com/channel/${channelId}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=PENDING+999'
    }
  });
  if (!response.ok) return '';
  const html = await response.text();

  // Try og:description
  const ogMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*?)"/);
  if (ogMatch) return decodeHtmlEntities(ogMatch[1]);

  return '';
}

module.exports = { fetchVideoData };
