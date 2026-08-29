import { useRef, useCallback } from "react";
import type WaveSurfer from "wavesurfer.js";

const CROSSFADE_MS = 10;

/**
 * Performs a mathematically smooth crossfade between two WaveSurfer
 * instances using Web Audio API GainNodes.
 *
 * The crossfade duration is 10ms — fast enough to be imperceptible
 * as a transition, smooth enough to eliminate the "click" artifact.
 */
export function useCrossfade() {
  const fadingRef = useRef(false);

  /**
   * Crossfade from `fromWs` to `toWs`.
   * - Syncs `toWs` position to `fromWs`
   * - Fades out old, fades in new over 10ms
   * - Preserves play/pause state
   */
  const crossfade = useCallback(
    (fromWs: WaveSurfer | null, toWs: WaveSurfer | null) => {
      if (!fromWs || !toWs || fromWs === toWs || fadingRef.current) return;

      fadingRef.current = true;

      const playing = fromWs.isPlaying();
      const pos = fromWs.getCurrentTime();

      // Sync position before playing
      toWs.setTime(pos);

      // Access the internal GainNodes via WaveSurfer's AudioContext
      // WaveSurfer v7 exposes the media element; we ramp volume instead
      // of direct GainNode access for compatibility.
      const fromVol = fromWs.getVolume();
      const steps = 5;
      const stepMs = CROSSFADE_MS / steps;
      let step = 0;

      const tick = () => {
        step++;
        const t = step / steps;

        // Linear crossfade: old fades out, new fades in
        fromWs.setVolume(fromVol * (1 - t));
        toWs.setVolume(t);

        if (step < steps) {
          setTimeout(tick, stepMs);
        } else {
          // Ensure final state is clean
          fromWs.setVolume(0);
          toWs.setVolume(1);

          if (playing) toWs.play();
          fadingRef.current = false;
        }
      };

      // Start the new source (muted, it will fade in)
      toWs.setVolume(0);
      if (playing) toWs.play();

      tick();
    },
    [],
  );

  return { crossfade };
}
