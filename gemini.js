const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("./config");

const genAI = new GoogleGenerativeAI(config.GOOGLE_API_GENERATIVE_KEY);

async function processVideo(videoData) {
  const model = genAI.getGenerativeModel({ model: config.MODEL });

  const prompt = `You are given the closed captions of a YouTube video along with the video title and description.

Video ID: ${videoData.videoId}
Video Title: ${videoData.title}
Channel Name: ${videoData.author}
Video Description:
${videoData.description}

Captions (each line starts with [MM:SS | Xs] where X is the timestamp in seconds):
${videoData.captionsText}

Your task:
1. Generate an "abstract" - a concise summary in exactly 3 sentences that captures the essence of the video.
2. Generate a "summary" - a detailed, thorough summary of the video content in markdown format.
   - The summary should be PROPORTIONAL to the video length. As a rough guide: ~500 words per 30 minutes of video. A 1-hour video should produce ~1000 words, a 2-hour video ~2000 words.
   - Focus on KEY INSIGHTS, revelations, surprising claims, concrete examples, specific numbers/data, and actionable takeaways. Skip filler, repetition, ads, sponsor segments, and small talk.
   - Cover all major topics discussed in the video, not just the first few.
   - Weave timestamp links naturally into the text as inline markdown links on the most relevant keyword or phrase.
   - Link format: [keyword or phrase](T=SECONDSs) — use the seconds value from the captions (the number after | in each line).
   - IMPORTANT: Use the EXACT seconds value from the captions. Do NOT concatenate MM:SS digits. For example, [59:30 | 3570s] means use T=3570s, NOT T=5930s.
   - CORRECT example: Cílem jeho firmy je přeměna na tzv. [„Dark Factory"](T=330s), kde většinu práce vykonávají AI agenti.
   - WRONG example: Cílem jeho firmy je přeměna na tzv. „Dark Factory" [viz 330s](T=330s).
   - The link should be ON the relevant word/phrase itself, not appended as a separate reference.
   - Use markdown formatting: headers (###, ####), bullet points, bold text as appropriate.
   - Structure the summary by topic/theme, not chronologically.

IMPORTANT: Write everything in the same language as the captions/video title. If the video is in Czech, write in Czech. If in English, write in English. Etc.

Respond ONLY with valid JSON in this exact format (no markdown code blocks, just raw JSON):
{
  "abstract": "Three sentence abstract here.",
  "summary": "Detailed markdown summary with [timestamp links](T=123s) here."
}`;

  function replaceTimestamps(summary) {
    return summary.replace(
      /\(T=(\d+)s\)/g,
      `(https://www.youtube.com/watch?v=${videoData.videoId}&t=$1s)`,
    );
  }

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // Parse JSON from response - handle potential markdown code blocks
  let jsonStr = responseText;
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      abstract: parsed.abstract,
      summary: replaceTimestamps(parsed.summary),
    };
  } catch (e) {
    // Try to extract JSON from the response
    const startIdx = responseText.indexOf("{");
    const endIdx = responseText.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      const extracted = responseText.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(extracted);
      return {
        abstract: parsed.abstract,
        summary: replaceTimestamps(parsed.summary),
      };
    }
    throw new Error(`Failed to parse Gemini response: ${e.message}`);
  }
}

module.exports = { processVideo };
