/**
 * useLiveEngine — tests de regresión y robustez.
 *
 * 1. Regresión del glitch: el grafo de audio se crea UNA sola vez aunque
 *    params cambie (bug: la dep [params] recreaba el grafo en cada
 *    PARAM_UPDATE → el audio se cortaba con cada mensaje del bridge).
 *
 * 2. Política de neutral (spec AGENTS.md): socket caído ≤ 2 s mantiene el
 *    último valor; caído > 2 s vuelve a defaults del schema.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveEngine } from './useLiveEngine';

// Hoisted mocks para poder espiar desde los factories de vi.mock
const { createAudioGraphMock, liveSocketConfigs } = vi.hoisted(() => ({
  createAudioGraphMock: vi.fn(),
  liveSocketConfigs: [] as Array<{
    onStateChange?: (state: string) => void;
    onParams?: (params: unknown) => void;
  }>,
}));

vi.mock('@/adapters/live/audioGraph', () => ({
  createAudioGraph: (...args: unknown[]) => createAudioGraphMock(...args),
}));

vi.mock('@/adapters/live/liveSocket', () => ({
  createLiveSocket: (config: {
    onStateChange?: (state: string) => void;
    onParams?: (params: unknown) => void;
  }) => {
    liveSocketConfigs.push(config);
    return {
      getState: () => 'connected',
      send: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(),
    };
  },
}));

vi.mock('@/adapters/live/recorder', () => ({
  createRecorder: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    download: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('@/adapters/live/fxPresets', () => ({
  applyPreset: (p: unknown) => p,
  getPresetByNote: vi.fn(),
  FX_PRESETS: {},
}));

// AudioContext no existe en jsdom → stub mínimo
class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  close = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', MockAudioContext);
  createAudioGraphMock.mockReset();
  liveSocketConfigs.length = 0;
  // El mock devuelve un graph con la API mínima que el hook usa
  createAudioGraphMock.mockReturnValue({
    nodes: { masterGain: { connect: vi.fn() } },
    audioContext: null,
    setParams: vi.fn(),
    setFxPreset: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
    getAnalyserData: vi.fn(() => ({ frequency: new Uint8Array(0), timeDomain: new Uint8Array(0) })),
    getOutputLevel: vi.fn(() => 0),
  });
});

describe('useLiveEngine — regresión del glitch', () => {
  it('no recrea el grafo al cambiar params (regresión: dep [params] lo recreaba)', () => {
    const buffer = {} as AudioBuffer;

    const { result } = renderHook(() => useLiveEngine({ masterAudioBuffer: buffer }));

    // Grafo creado al llegar el buffer
    expect(createAudioGraphMock).toHaveBeenCalledTimes(1);

    // Simula giros de knob / PARAM_UPDATEs del bridge
    act(() => { result.current.setParams({ drive: 0.8 }); });
    act(() => { result.current.setParams({ drive: 0.9 }); });
    act(() => { result.current.setParams({ reverb_mix: 0.3 }); });

    // Con el bug: 4 llamadas (recreación por cada cambio).
    // Con el fix: sigue siendo 1.
    expect(createAudioGraphMock).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveEngine — política de neutral (spec: socket caído > 2 s)', () => {
  it('mantiene el último valor ≤ 2 s y vuelve a defaults > 2 s', () => {
    vi.useFakeTimers();
    const buffer = {} as AudioBuffer;

    const { result } = renderHook(() => useLiveEngine({ masterAudioBuffer: buffer }));
    const socketConfig = liveSocketConfigs[0];

    // El usuario/gestos mueven parámetros
    act(() => { result.current.setParams({ drive: 0.9, reverb_mix: 0.5 }); });
    expect(result.current.params.drive).toBe(0.9);

    // El socket cae
    act(() => { socketConfig.onStateChange?.('disconnected'); });

    // < 2 s: mantiene el último valor (sin flicker en reconexión rápida)
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.params.drive).toBe(0.9);

    // > 2 s: vuelve a neutral (defaults del schema)
    act(() => { vi.advanceTimersByTime(1500); }); // total 2.5 s
    expect(result.current.params.drive).toBe(0);
    expect(result.current.params.reverb_mix).toBe(0);
    expect(result.current.params.filter_cutoff).toBe(12000);

    // Reconexión: no vuelve a resetear
    act(() => { result.current.setParams({ drive: 0.4 }); });
    expect(result.current.params.drive).toBe(0.4);
    act(() => { socketConfig.onStateChange?.('connected'); });
    act(() => { socketConfig.onStateChange?.('disconnected'); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.params.drive).toBe(0); // reset de nuevo tras nueva caída

    vi.useRealTimers();
  });
});
