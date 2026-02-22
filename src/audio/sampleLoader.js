export async function loadSamples(audioCtx, sampleMap) {
  const entries = await Promise.all(
    Object.entries(sampleMap).map(async ([instId, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);

      const arrayBuf = await res.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuf);
      return [instId, buffer];
    })
  );

  return Object.fromEntries(entries);
}
