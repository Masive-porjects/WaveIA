/**
 * WebAudio processor for A/B playback.
 * Loads original and mastered audio via file URLs + decodeAudioData.
 * No effect chain — backend handles all DSP via Pedalboard.
 */
import { API_BASE } from "@/adapters/api/config";

export class AudioProcessor {
  private context: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  private originalBuffer: AudioBuffer | null = null;
  private masteredBuffer: AudioBuffer | null = null;
  private activeBuffer: AudioBuffer | null = null;

  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;
  private currentVersion: "original" | "mastered" = "original";

  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || API_BASE;
  }

  async init(): Promise<void> {
    if (this.context) return;
    this.context = new AudioContext();
  }

  /**
   * Load original (raw) audio from backend as WAV file.
   */
  async loadOriginal(sessionId: string): Promise<void> {
    await this.init();
    const url = `${this.apiUrl}/session/${sessionId}/audio/original`;
    this.originalBuffer = await this.fetchBuffer(url);
    if (this.currentVersion === "original") {
      this.activeBuffer = this.originalBuffer;
    }
  }

  /**
   * Load mastered audio from backend as WAV file.
   */
  async loadMastered(sessionId: string): Promise<void> {
    await this.init();
    const url = `${this.apiUrl}/session/${sessionId}/audio/mastered`;
    this.masteredBuffer = await this.fetchBuffer(url);
    if (this.currentVersion === "mastered") {
      this.activeBuffer = this.masteredBuffer;
    }
  }

  /**
   * Fetch WAV file and decode via browser's decodeAudioData.
   * Much faster and more reliable than JSON PCM transfer.
   */
  private async fetchBuffer(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return this.context!.decodeAudioData(arrayBuffer);
  }

  /**
   * Switch to original buffer and play.
   */
  playOriginal(): void {
    this.currentVersion = "original";
    this.activeBuffer = this.originalBuffer;
    this.stop();
    this.play();
  }

  /**
   * Switch to mastered buffer and play.
   */
  playMastered(): void {
    this.currentVersion = "mastered";
    this.activeBuffer = this.masteredBuffer;
    this.stop();
    this.play();
  }

  /**
   * Switch active buffer without playing.
   */
  setVersion(version: "original" | "mastered"): void {
    this.currentVersion = version;
    this.activeBuffer = version === "original" ? this.originalBuffer : this.masteredBuffer;
  }

  play(): void {
    if (!this.context || !this.activeBuffer || this.isPlaying) return;

    this.sourceNode = this.context.createBufferSource();
    this.sourceNode.buffer = this.activeBuffer;
    this.sourceNode.connect(this.context.destination);

    this.sourceNode.start(0, this.pauseOffset);
    this.startTime = this.context.currentTime - this.pauseOffset;
    this.isPlaying = true;

    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.pauseOffset = 0;
      }
    };
  }

  pause(): void {
    if (!this.sourceNode || !this.isPlaying) return;

    this.pauseOffset = this.context!.currentTime - this.startTime;
    this.sourceNode.stop();
    this.sourceNode.disconnect();
    this.sourceNode = null;
    this.isPlaying = false;
  }

  stop(): void {
    this.pause();
    this.pauseOffset = 0;
  }

  seek(normalizedPosition: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseOffset = normalizedPosition * (this.activeBuffer?.duration || 0);
    if (wasPlaying) this.play();
  }

  getPosition(): number {
    if (!this.activeBuffer) return 0;
    const current = this.isPlaying
      ? this.context!.currentTime - this.startTime
      : this.pauseOffset;
    return Math.min(current / this.activeBuffer.duration, 1);
  }

  getDuration(): number {
    return this.activeBuffer?.duration || 0;
  }

  getPlaying(): boolean {
    return this.isPlaying;
  }

  getCurrentVersion(): "original" | "mastered" {
    return this.currentVersion;
  }

  hasOriginal(): boolean {
    return this.originalBuffer !== null;
  }

  hasMastered(): boolean {
    return this.masteredBuffer !== null;
  }

  destroy(): void {
    this.stop();
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}
