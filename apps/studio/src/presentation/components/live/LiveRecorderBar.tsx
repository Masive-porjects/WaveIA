/**
 * LiveRecorderBar — Transport controls and recording UI for live session.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RecorderState } from '@/lib/live/recorder';

interface LiveRecorderBarProps {
  recorderState: RecorderState;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownload: (filename?: string) => void;
  disabled?: boolean;
}

export function LiveRecorderBar({
  recorderState,
  isPlaying,
  onPlay,
  onPause,
  onStop,
  onStartRecording,
  onStopRecording,
  onDownload,
  disabled = false,
}: LiveRecorderBarProps) {
  const [showDownload, setShowDownload] = useState(false);
  const [downloadName, setDownloadName] = useState('');

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (downloadName.trim()) {
      onDownload(downloadName.trim());
    } else {
      onDownload();
    }
    setShowDownload(false);
    setDownloadName('');
  };

  return (
    <div
      className="live-recorder-bar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: 'rgba(18,18,22,0.7)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Transport Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <motion.button
          onClick={isPlaying ? onPause : onPlay}
          disabled={disabled}
          whileTap={{ scale: 0.95 }}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: isPlaying
              ? 'rgba(255,59,48,0.2)'
              : 'rgba(52,199,89,0.2)',
            border: `1px solid ${isPlaying ? 'rgba(255,59,48,0.4)' : 'rgba(52,199,89,0.4)'}`,
            color: isPlaying ? '#ff3b30' : '#34c759',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7-11-7z" />
            </svg>
          )}
        </motion.button>

        <motion.button
          onClick={onStop}
          disabled={disabled || !isPlaying}
          whileTap={{ scale: 0.95 }}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(255,149,0,0.15)',
            border: '1px solid rgba(255,149,0,0.3)',
            color: '#ff9500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled || !isPlaying ? 'not-allowed' : 'pointer',
            opacity: isPlaying ? 1 : 0.5,
          }}
          aria-label="Detener"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </motion.button>
      </div>

      {/* Recording Section */}
      <AnimatePresence mode="wait">
        {!recorderState.recording && !recorderState.blob ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={onStartRecording}
            disabled={disabled}
            whileTap={{ scale: 0.95 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '12px 16px',
              background: 'rgba(255,59,48,0.15)',
              border: '1px solid rgba(255,59,48,0.3)',
              borderRadius: 10,
              color: '#ff3b30',
              fontWeight: 600,
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ff3b30',
              }}
            />
            <span>Grabar sesión</span>
          </motion.button>
        ) : null}

        {recorderState.recording && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 16px',
              background: 'rgba(255,59,48,0.15)',
              border: '1px solid rgba(255,59,48,0.3)',
              borderRadius: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <motion.span
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#ff3b30',
                  boxShadow: '0 0 12px #ff3b30',
                }}
              />
              <div>
                <div style={{ fontWeight: 600, color: '#ff3b30', fontSize: 13 }}>
                  GRABANDO
                </div>
                <div style={{ fontSize: 11, color: '#8a8a8a', fontFamily: 'Inter, monospace' }}>
                  {formatTime(recorderState.duration)}
                </div>
              </div>
            </div>
            <motion.button
              onClick={onStopRecording}
              disabled={disabled}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '8px 16px',
                background: '#ff3b30',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 12,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Detener
            </motion.button>
          </motion.div>
        )}

        {recorderState.blob && !recorderState.recording && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 16,
              background: 'rgba(52,199,89,0.1)',
              border: '1px solid rgba(52,199,89,0.3)',
              borderRadius: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🎵</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#34c759', fontSize: 13 }}>
                  Grabación lista
                </div>
                <div style={{ fontSize: 11, color: '#8a8a8a' }}>
                  Duración: {formatTime(recorderState.duration)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <motion.button
                onClick={() => setShowDownload(true)}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '10px 16px',
                  background: '#34c759',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Descargar WAV
              </motion.button>
              <motion.button
                onClick={() => onDownload()}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#e8e8e8',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Descargar rápido
              </motion.button>
              <motion.button
                onClick={() => { onDownload(); setShowDownload(false); }}
                whileTap={{ scale: 0.95 }}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  color: '#8a8a8a',
                  fontWeight: 500,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Descartar
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Download filename input */}
        {showDownload && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 100,
            }}
            onClick={() => { setShowDownload(false); setDownloadName(''); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '90%',
                maxWidth: 400,
                padding: 24,
                background: 'rgba(26,26,32,0.98)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
              }}
            >
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#e8e8e8' }}>
                Nombre del archivo
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: '#8a8a8a' }}>
                Se guardará como .wav
              </p>
              <input
                type="text"
                value={downloadName}
                onChange={(e) => setDownloadName(e.target.value)}
                placeholder="mi-sesion-en-vivo"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#e8e8e8',
                  fontSize: 13,
                  outline: 'none',
                  marginBottom: 16,
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowDownload(false); setDownloadName(''); }}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 8,
                    color: '#8a8a8a',
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: '10px 16px',
                    background: '#34c759',
                    border: 'none',
                    borderRadius: 8,
                    color: 'white',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Guardar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}