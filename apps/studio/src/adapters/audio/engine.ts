import * as Tone from "tone";

/** Minimal disposal contract shared by every Tone.js node we own. */
export interface Disposable {
  dispose(): void;
}

export interface SequencerResources {
  readonly synths: readonly Disposable[];
  readonly sequence: Tone.Sequence<number>;
  /**
   * Disposes ONLY the nodes owned by this resource set and stops the shared
   * Transport. Never disposes the master bus or the underlying AudioContext.
   */
  dispose(): void;
}

/**
 * Wraps already-built sequencer nodes into a resource set with strict
 * ownership semantics: its own nodes plus a Transport stop() call, nothing
 * else. The singleton owner is the only one allowed to tear down shared
 * state beyond this scope.
 */
export function createSequencerResources(
  synths: readonly Disposable[],
  sequence: Tone.Sequence<number>,
): SequencerResources {
  return {
    synths,
    sequence,
    dispose(): void {
      Tone.getTransport().stop();
      sequence.dispose();
      for (const node of synths) {
        node.dispose();
      }
    },
  };
};

class AudioEngineManager {
  private startPromise: Promise<void> | null = null;
  private masterGain: Tone.Gain | null = null;
  private masterLimiter: Tone.Limiter | null = null;

  /**
   * Autoplay-policy gate. Must be awaited from a user-gesture handler.
   * Idempotent: the underlying Tone.start() promise is cached, and a failure
   * clears the cache so the gesture can be retried.
   */
  async ensureStarted(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = Tone.start().catch(
        (error: unknown): never => {
          this.startPromise = null;
          throw error;
        },
      );
    }
    await this.startPromise;
  }

  /** Shared clock accessor — wraps Tone's own context Transport. */
  getTransport(): ReturnType<typeof Tone.getTransport> {
    return Tone.getTransport();
  }

  /**
   * Lazily builds the shared master bus: Gain(0.9) -> Limiter(-1) -> out.
   * Every future audio module connects here instead of straight to
   * destination so the whole engine shares one output chain.
   */
  masterBus(): Tone.Gain {
    if (!this.masterGain || !this.masterLimiter) {
      const gain = new Tone.Gain(0.9);
      const limiter = new Tone.Limiter(-1);
      gain.connect(limiter);
      limiter.toDestination();
      this.masterGain = gain;
      this.masterLimiter = limiter;
    }
    return this.masterGain;
  }

  /**
   * Owner-level teardown for tests/hard resets. Application components must
   * NEVER call this on unmount — the singleton survives route changes.
   */
  disposeEngine(): void {
    this.getTransport().stop();
    this.masterGain?.dispose();
    this.masterLimiter?.dispose();
    this.masterGain = null;
    this.masterLimiter = null;
    this.startPromise = null;
  }
}

declare global {
  var __brikAudioEngine: AudioEngineManager | undefined;
}

// HMR guard (Prisma-client pattern): keep exactly one instance across hot
// reloads so the cached start promise and master bus are never recreated.
const globalWithEngine = globalThis as typeof globalThis;
export const audioEngine: AudioEngineManager =
  globalWithEngine.__brikAudioEngine ?? new AudioEngineManager();
globalWithEngine.__brikAudioEngine = audioEngine;
