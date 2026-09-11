/**
 * client — URL builders de audio/download (demo multi-preset):
 *  - getAudioUrl: mastered + preset => ?preset_id; original nunca lo lleva
 *  - getDownloadUrl: appendea ?preset_id para wav y mp3 cuando hay preset
 *  - Sin presetId la URL queda intacta (ruta legacy)
 */
import { describe, it, expect } from 'vitest';
import { getAudioUrl, getDownloadUrl } from '@/adapters/api/client';

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