
function trimLeadingSilence(audioCtx, buffer, { threshold = 0.001, maxTrimSec = 0.08 } = {}) {
  // MP3s often have encoder delay / leading near-silence which makes hits feel late
  // and makes choke behavior feel early. We trim leading silence across channels.
  const sr = buffer.sampleRate;
  const maxTrimSamples = Math.floor(maxTrimSec * sr);
  const channels = buffer.numberOfChannels;

  let start = 0;
  const len = buffer.length;

  // Find first sample index where any channel crosses threshold
  const maxSearch = Math.min(len, maxTrimSamples > 0 ? maxTrimSamples : len);
  let found = 0;
  for (let i = 0; i < maxSearch; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const v = buffer.getChannelData(ch)[i];
      if (v > threshold || v < -threshold) {
        found = i;
        i = maxSearch; // break outer
        break;
      }
    }
  }

  start = found;
  if (!start) return buffer;
  if (start >= len - 1) return buffer;

  const newLen = len - start;
  const trimmed = audioCtx.createBuffer(channels, newLen, sr);
  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = trimmed.getChannelData(ch);
    dst.set(src.subarray(start));
  }
  return trimmed;
}

export async function loadSamples(audioCtx, sampleMap) {
  // Load samples defensively.
  // If a sample is missing (404) or fails to decode, we skip it instead of
  // breaking playback for the entire app.
  const results = await Promise.all(
    Object.entries(sampleMap).map(async ([instId, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[audio] Failed to fetch ${url} (${res.status})`);
          return null;
        }

        const arrayBuf = await res.arrayBuffer();
        // If the server returned HTML (e.g., a 404 page), decodeAudioData will throw.
        let buffer = await audioCtx.decodeAudioData(arrayBuf);
        buffer = trimLeadingSilence(audioCtx, buffer);
        return [instId, buffer];
      } catch (e) {
        console.warn(`[audio] Failed to load/decode ${url}:`, e);
        return null;
      }
    })
  );

  const entries = results.filter(Boolean);
  return Object.fromEntries(entries);
}
