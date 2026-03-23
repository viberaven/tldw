# TLDW - Too Long Didn't Watch

AI-powered YouTube video summarizer. Paste a YouTube URL, get a structured summary with timestamped links back to the original video.

## Requirements

- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (used to run [yt-dlp](https://github.com/yt-dlp/yt-dlp) via `uvx`)
- [deno](https://deno.land/) (required by yt-dlp for YouTube JS challenge solving)
- Google Gemini API key

## Setup

```bash
npm install
cp config.js.example config.js
```

Edit `config.js` with your Google Gemini API key and preferred model.

## Configuration

### config.js

| Field | Description |
|-------|-------------|
| `GOOGLE_API_KEY` | Your Google Gemini API key |
| `MODEL` | Gemini model to use (e.g. `gemini-3.1-flash-lite-preview`) |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server bind address |

## Running

```bash
# Production
npm start

# Development (auto-reload on changes)
npm run dev
```

### systemd deployment

When running as a systemd service, `uvx` and `deno` may not be in the default PATH. Set it explicitly in your unit file:

```ini
[Service]
Environment=PATH=/home/viberaven/.local/bin:/home/viberaven/.deno/bin:/usr/local/bin:/usr/bin:/bin
```

If YouTube returns 429 errors (rate limiting), you can place a `cookies.txt` file (Netscape format) in the `data/` directory. Export it from a browser where you're logged into YouTube using an extension like "Get cookies.txt LOCALLY".

## How it works

1. User pastes a YouTube URL on the homepage
2. Server checks if the video has already been processed (SQLite cache in `data/tldw.db`)
3. If not cached, `yt-dlp` fetches video metadata and closed captions
4. Captions + metadata are sent to Google Gemini for summarization
5. Result is stored in the database and displayed as a clean page with:
   - Channel name and description
   - Video title and thumbnail
   - AI-generated abstract (3 sentences)
   - Detailed summary with inline timestamp links to the original video

## URL structure

- `https://tldw.viberaven.com/` - Homepage
- `https://tldw.viberaven.com/<videoId>` - Video summary page (triggers processing if not cached)

## Output

Each processed video is available as:
- **HTML page** - rendered in the browser with Tailwind CSS (dark mode auto-detected)
- **Markdown file** - downloadable via the "Download Markdown" button

The markdown template can be customized by editing `template.md`.

## Project structure

```
├── config.js          # API keys and model config
├── config.js.example  # Template for config.js
├── server.js          # Express server and API routes
├── db.js              # SQLite database
├── youtube.js         # yt-dlp integration
├── gemini.js          # Gemini API integration
├── template.md        # Markdown output template
├── data/              # SQLite database files
└── public/
    ├── index.html     # Homepage
    └── video.html     # Video summary page
```
