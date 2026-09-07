/**
 * LiveView — Main Live Engine container (3-column layout).
 * Combines Camera, FX Slots, and Meters into the Live tab.
 */

'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveEngine } from '@/adapters/live/useLiveEngine';
import { FxSlotPanel } from './FxSlotPanel';
import { CameraOverlay } from './CameraOverlay';
import { LiveMeters } from './LiveMeters';
import { LiveRecorderBar } from './LiveRecorderBar';

interface LiveViewProps {
  /** Master audio buffer URL or blob */
  masterAudioUrl?: string | null;
  /** Master audio buffer (decoded) */
  masterAudioBuffer?: AudioBuffer | null | undefined;
  /** Whether the Live tab is active */
  isActive?: boolean;
  /** Connection status from bridge */
  bridgeConnected?: boolean;
  /** Bridge latency in ms */
  bridgeLatency?: number;
}

/** Parámetros iniciales (neutrales) del Live Engine — el hook ya inicializa con defaults del schema. */

export function LiveView({
  masterAudioUrl,
  masterAudioBuffer,
  isActive = false,
  bridgeConnected = false,
  bridgeLatency,
}: LiveViewProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Master real del flujo de mastering ─────────────────────────────
  // El padre pasa la URL del masterizado (getAudioUrl(session_id, "mastered")).
  // La decodificamos a AudioBuffer para el Live Engine. Con un AudioContext
  // efímero (el decode es puntual; el hook usa el suyo para el graph).
  const [masterBuffer, setMasterBuffer] = useState<AudioBuffer | null>(null);
  const [decodedUrl, setDecodedUrl] = useState<string | null>(null);

  // Patrón oficial React: si la URL cambió, descartar el buffer viejo
  // (ajuste de estado durante render, no en efecto).
  if (decodedUrl !== (masterAudioUrl ?? null)) {
    setDecodedUrl(masterAudioUrl ?? null);
    setMasterBuffer(null);
  }

  useEffect(() => {
    if (!masterAudioUrl) return;

    let cancelled = false;
    const ctx = new AudioContext();
    fetch(masterAudioUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch master: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audioBuf) => {
        if (!cancelled) setMasterBuffer(audioBuf);
      })
      .catch((err) => console.error('[LiveView] decode master:', err))
      .finally(() => { void ctx.close(); });

    return () => { cancelled = true; };
  }, [masterAudioUrl]);

  // Use the live engine hook
  const {
    params,
    connectionState,
    latency,
    outputLevel,
    analyserData,
    recorderState,
    isPlaying,
    setParams,
    setFxPreset,
    play,
    pause,
    stop,
    startRecording,
    stopRecording,
    downloadRecording,
    destroy,
  } = useLiveEngine({
    masterAudioBuffer: masterBuffer ?? masterAudioBuffer ?? null,
    initialParams: {
      filter_cutoff: 12000,
      filter_res: 0.7,
      drive: 0,
      delay_time: 250,
      echo_feedback: 0,
      reverb_mix: 0,
      output_level: 0.9,
      fx_preset: null,
    },
    onParamsChange: (p) => {}, // Handled by hook internally
    onConnectionStateChange: () => {},
    onLatencyUpdate: () => {},
    onError: (err) => console.error('[LiveEngine]', err),
  });

  // Handle camera errors
  const handleCameraError = (err: Error) => {
    setCameraError(err.message);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => destroy();
  }, [destroy]);

  if (!isActive) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#8a8a8a', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎛️</div>
            <h2 style={{ margin: '0 0 8px', color: '#e8e8e8' }}>Live Engine</h2>
            <p style={{ margin: 0, color: '#8a8a8a' }}>
              Selecciona la pestaña Live para activar el motor de audio
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr 1fr',
        gridTemplateRows: '1fr auto',
        gap: 16,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Column 1: Camera & Input */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'auto',
          paddingRight: 8,
        }}
      >
        {/* Camera Overlay */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CameraOverlay
            mirror={true}
            facingMode="user"
            showLandmarks={true}
            onError={handleCameraError}
          />
        </div>

        {cameraError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '12px 16px',
              background: 'rgba(255,59,48,0.1)',
              border: '1px solid rgba(255,59,48,0.3)',
              borderRadius: 10,
              color: '#ff3b30',
              fontSize: 12,
            }}
          >
            ⚠️ Cámara: {cameraError}
          </motion.div>
        )}

        {/* Audio Source Selector */}
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 10,
            fontSize: 12,
            color: '#8a8a8a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#627e84' }} />
            <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
              Fuente de audio
            </span>
          </div>
          <select
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#e8e8e8',
              fontSize: 12,
            }}
            defaultValue="master"
            disabled
          >
            <option value="master">Master Output (Brikmaster)</option>
            <option value="mic" disabled>Micrófono (próximamente)</option>
            <option value="file" disabled>Archivo local (próximamente)</option>
          </select>
        </div>
      </motion.div>

      {/* Column 2: FX Chain */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'auto',
          padding: '0 8',
        }}
      >
        {/* Header with status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#e8e8e8' }}>LIVE ENGINE</span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: connectionState === 'connected'
                  ? 'rgba(52,199,89,0.15)'
                  : 'rgba(255,149,0,0.15)',
                border: `1px solid ${connectionState === 'connected' ? 'rgba(52,199,89,0.3)' : 'rgba(255,149,0,0.3)'}`,
                borderRadius: 20,
                fontSize: 11,
                color: connectionState === 'connected' ? '#34c759' : '#ff9500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: connectionState === 'connected' ? '#34c759' : '#ff9500',
                  animation: connectionState === 'connecting' ? 'pulse 1s infinite' : 'none',
                }}
              />
              {connectionState === 'connected' ? 'Conectado' : connectionState === 'connecting' ? 'Conectando...' : 'Desconectado'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {latency > 0 && (
              <span style={{ color: '#627e84', fontSize: 11, fontFamily: 'Inter, monospace' }}>
                RTT: {latency.toFixed(1)}ms
              </span>
            )}
            <span style={{ color: '#8a8a8a', fontSize: 11 }}>
              {bridgeConnected ? '🎮 Bridge OK' : '⏳ Esperando Bridge'}
            </span>
          </div>
        </div>

        {/* FX Slot Panel */}
        <FxSlotPanel
          params={params}
          onParamsChange={setParams}
          onPresetChange={setFxPreset}
        />
      </motion.div>

      {/* Column 3: Meters & Recorder */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'auto',
          paddingLeft: 8,
        }}
      >
        <LiveMeters
          analyserData={analyserData}
          outputLevel={outputLevel}
          latency={latency}
          connectionState={connectionState}
          width={280}
          height={320}
        />

        <LiveRecorderBar
          recorderState={recorderState}
          isPlaying={isPlaying}
          onPlay={play}
          onPause={pause}
          onStop={stop}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onDownload={downloadRecording}
        />
      </motion.div>

      {/* Bottom: Full-width recorder bar when active */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          gridColumn: '1 / -1',
          maxHeight: 200,
        }}
      >
        <LiveRecorderBar
          recorderState={recorderState}
          isPlaying={isPlaying}
          onPlay={play}
          onPause={pause}
          onStop={stop}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onDownload={downloadRecording}
        />
      </motion.div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </motion.div>
  );
}