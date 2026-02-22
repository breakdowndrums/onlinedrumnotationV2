let primed = false;

/**
 * iOS Safari often keeps WebAudio silent until a HTMLMediaElement has played
 * in a user gesture (it affects the audio session/category).
 *
 * We play a tiny silent MP3 at near-zero volume once per session.
 */
export async function primeIOSAudio() {
  if (primed) return;
  primed = true;

  try {
    const a = document.createElement("audio");
    a.setAttribute("playsinline", "true");
    a.preload = "auto";
    a.src = "/silence.mp3";
    // Do NOT mute; some iOS versions ignore muted playback for session priming.
    a.volume = 0.001;

    // Play inside user gesture. Ignore failures.
    await a.play();
    a.pause();
    a.currentTime = 0;
  } catch (_) {
    // ignore
  }
}
