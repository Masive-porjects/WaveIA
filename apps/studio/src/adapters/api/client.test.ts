/**
 * client — URL builders de audio/download (demo multi-preset):
 *  - getAudioUrl: mastered + preset => ?preset_id; original nunca lo lleva
 *  - getDownloadUrl: appendea ?preset_id para wav y mp3 cuando hay preset
 *  - Sin presetId la URL queda intacta (ruta legacy)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAudioUrl,
  getDownloadUrl,
  getMixAudioUrl,
  mixTracks,
} from '@/adapters/api/client';

// Mismo fallback que config.ts en tests (sin NEXT_PUBLIC_API_URL).
const API = 'http://localhost:8000/api';
const SID = 'session-123';

describe('getAudioUrl', () => {
  it('mastered con preset appendea ?preset_id', () => {
    expect(getAudioUrl(SID, 'mastered', 'urban')).toBe(
      `${API}/session/${SID}/audio/mastered?preset_id=urban`,
    );
  });

  it('mastered sin preset NO appendea la query', () => {
    expect(getAudioUrl(SID, 'mastered')).toBe(
      `${API}/session/${SID}/audio/mastered`,
    );
  });

  it('original nunca appendea preset_id', () => {
    expect(getAudioUrl(SID, 'original', 'urban')).toBe(
      `${API}/session/${SID}/audio/original`,
    );
  });

  it('codifica el preset_id', () => {
    expect(getAudioUrl(SID, 'mastered', 'rock & roll')).toBe(
      `${API}/session/${SID}/audio/mastered?preset_id=rock%20%26%20roll`,
    );
  });
});

describe('getDownloadUrl', () => {
  it('wav con preset appendea la query', () => {
    expect(getDownloadUrl(SID, 'wav', 'urban')).toBe(
      `${API}/session/${SID}/download/wav?preset_id=urban`,
    );
  });

  it('mp3 con preset appendea la query', () => {
    expect(getDownloadUrl(SID, 'mp3', 'urban')).toBe(
      `${API}/session/${SID}/download/mp3?preset_id=urban`,
    );
  });

  it('sin presetId deja la URL intacta', () => {
    expect(getDownloadUrl(SID, 'wav')).toBe(`${API}/session/${SID}/download/wav`);
    expect(getDownloadUrl(SID, 'mp3')).toBe(`${API}/session/${SID}/download/mp3`);
  });
});

describe('getMixAudioUrl', () => {
  it('apunta al WAV mezclado persistido de la sesión', () => {
    expect(getMixAudioUrl(SID)).toBe(`${API}/session/${SID}/audio/mix`);
  });
});

describe('mixTracks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Stub de jsdom: URL.createObjectURL no está implementado. */
  function stubObjectUrl() {
    URL.createObjectURL = vi.fn(() => 'blob:mock-mix') as unknown as typeof URL.createObjectURL;
  }

  it('POSTea /mix y parsea el header X-Mix-Result', async () => {
    const payload = {
      tempo_bpm: 128,
      genre: 'urban',
      genre_confidence: 0.87,
      sample_rate: 48000,
      duration_seconds: 96.5,
      stem_presence: { drums: true, bass: true, other: false, vocals: true },
      qc_report: { summary: { all_ok: true, flagged: [] } },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['RIFF...'], { type: 'audio/wav' }),
      headers: { get: (name: string) => (name === 'X-Mix-Result' ? JSON.stringify(payload) : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectUrl();

    const { audioUrl, result } = await mixTracks(SID);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/session/${SID}/mix`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(audioUrl).toBe('blob:mock-mix');
    expect(result?.tempo_bpm).toBe(128);
    expect(result?.genre).toBe('urban');
    expect(result?.stem_presence).toEqual({
      drums: true,
      bass: true,
      other: false,
      vocals: true,
    });
    expect(result?.qc_report).toEqual(payload.qc_report);
  });

  it('devuelve result null cuando el header no parsea como JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
      headers: { get: () => 'not-json{' },
    });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectUrl();

    const { result } = await mixTracks(SID);
    expect(result).toBeNull();
  });

  it('lanza error con el detail del backend cuando !res.ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Mix failed: boom' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mixTracks(SID)).rejects.toThrow('Mix failed: boom');
  });

  it('propaga un AbortSignal opcional al fetch de /mix', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x']),
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectUrl();

    const { audioUrl } = await mixTracks(SID, controller.signal);

    expect(audioUrl).toBe('blob:mock-mix');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/session/${SID}/mix`,
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
      }),
    );
  });
});
