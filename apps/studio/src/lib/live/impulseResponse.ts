/**
 * Impulse Response Generator for ConvolverNode Reverb
 * Generates synthetic IRs algorithmically — no external WAV files needed.
 */

export type IRType = 'plate' | 'hall' | 'room' | 'chamber' | 'spring';

interface IRConfig {
  duration: number;        // seconds
  decay: number;           // exponential decay factor
  earlyReflections: number; // number of early reflection taps
  diffusion: number;       // 0-1, how much to smear
  damping: number;         // high-frequency damping 0-1
  preDelay: number;        // ms before reverb starts
}

/**
 * Generate a synthetic impulse response for reverb.
 * Uses filtered white noise with exponential decay and optional early reflections.
 */
export function generateImpulseResponse(
  audioContext: AudioContext,
  type: IRType = 'hall',
  sampleRate: number = 44100
): AudioBuffer {
  const configs: Record<IRType, IRConfig> = {
    plate:  { duration: 1.8, decay: 3.5, earlyReflections: 8,  diffusion: 0.7, damping: 0.3, preDelay: 15 },
    hall:   { duration: 3.5, decay: 2.0, earlyReflections: 12, diffusion: 0.8, damping: 0.2, preDelay: 40 },
    room:   { duration: 1.2, decay: 4.0, earlyReflections: 6,  diffusion: 0.5, damping: 0.4, preDelay: 10 },
    chamber:{ duration: 2.2, decay: 2.8, earlyReflections: 10, diffusion: 0.6, damping: 0.25, preDelay: 25 },
    spring: { duration: 2.5, decay: 3.0, earlyReflections: 4,  diffusion: 0.3, damping: 0.5, preDelay: 5 },
  };

  const cfg = configs[type];
  const length = Math.ceil(cfg.duration * sampleRate);
  const buffer = audioContext.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const channelData = buffer.getChannelData(ch);
    generateChannel(channelData, cfg, sampleRate, ch);
  }

  return buffer;
}

function generateChannel(
  output: Float32Array,
  cfg: IRConfig,
  sampleRate: number,
  channel: number
): void {
  const preDelaySamples = Math.ceil((cfg.preDelay / 1000) * sampleRate);
  const noise = new Float32Array(output.length);

  // Generate white noise
  for (let i = 0; i < noise.length; i++) {
    noise[i] = (Math.random() * 2 - 1) * 0.5;
  }

  // Apply exponential decay envelope
  for (let i = 0; i < output.length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-cfg.decay * t);
    output[i] = noise[i] * envelope;
  }

  // Early reflections (simple tapped delay lines)
  const reflectionDelays = [
    0.012, 0.018, 0.025, 0.032, 0.041, 0.053, 0.067, 0.082,
    0.101, 0.124, 0.152, 0.186
  ].slice(0, cfg.earlyReflections);

  reflectionDelays.forEach((delay, idx) => {
    const delaySamples = Math.ceil(delay * sampleRate);
    const gain = Math.pow(0.7, idx + 1) * 0.5;
    for (let i = delaySamples; i < output.length; i++) {
      output[i] += noise[i - delaySamples] * gain * Math.exp(-cfg.decay * (i - delaySamples) / sampleRate);
    }
  })

  // Diffusion via allpass filter chain (simple version)
  if (cfg.diffusion > 0) {
    const allpassDelays = [0.001, 0.003, 0.007, 0.015];
    allpassDelays.forEach(d => {
      const ds = Math.ceil(d * sampleRate);
      const feedback = 0.5 * cfg.diffusion;
      for (let i = ds; i < output.length; i++) {
        const delayed = output[i - ds];
        output[i] = delayed * feedback + output[i] * (1 - feedback);
      }
    });
  }

  // High-frequency damping (simple lowpass)
  if (cfg.damping > 0) {
    const cutoff = 1 - cfg.damping * 0.8;
    let prev = 0;
    for (let i = 0; i < output.length; i++) {
      prev = output[i] * cutoff + prev * (1 - cutoff);
      output[i] = prev;
    }
  }

  // Pre-delay (silence at start)
  if (preDelaySamples > 0) {
    for (let i = output.length - 1; i >= preDelaySamples; i--) {
      output[i] = output[i - preDelaySamples];
    }
    for (let i = 0; i < preDelaySamples; i++) {
      output[i] = 0;
    }
  }

  // Normalize to prevent clipping
  let max = 0;
  for (const v of output) {
    if (Math.abs(v) > max) max = Math.abs(v);
  }
  if (max > 0) {
    const scale = 0.95 / max;
    for (let i = 0; i < output.length; i++) {
      output[i] *= scale;
    }
  }
}

/**
 * Preset IR configurations matching fxPresets.ts
 */
export const IR_PRESETS: Record<string, IRType> = {
  clean: 'room',
  dub: 'plate',
  big_room: 'hall',
  radio: 'spring',
};