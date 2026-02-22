let primed = false;
let el = null;

/**
 * iOS Safari can keep WebAudio silent until a HTMLMediaElement has begun playback
 * directly inside a user gesture. This function must be called synchronously from
 * the click/tap handler (not after awaiting other promises).
 */
export function primeIOSAudioSync() {
  if (primed) return;
  primed = true;

  try {
    if (!el) {
      el = document.createElement("audio");
      el.setAttribute("playsinline", "true");
      el.preload = "auto";
      el.src = "/silence.mp3";
      // Do NOT mute; some iOS versions ignore muted playback for session priming.
      el.volume = 0.01;
      // Keep in DOM to reduce iOS quirks
      el.style.position = "fixed";
      el.style.left = "-9999px";
      el.style.top = "-9999px";
      document.body.appendChild(el);
    }

    // Call play() synchronously; don't await (gesture association is fragile).
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        window.setTimeout(() => {
          try {
            el.pause();
            el.currentTime = 0;
          } catch (_) {}
        }, 60);
      }).catch(() => {});
    }
  } catch (_) {
    // ignore
  }
}
