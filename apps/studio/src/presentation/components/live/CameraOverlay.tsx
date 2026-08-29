/**
 * CameraOverlay — Local webcam preview with hand tracking visualization.
 * Uses getUserMedia and draws landmarks overlay.
 * Ref access moved inside useEffect to satisfy react-hooks/exhaustive-deps.
 */

'use client';

import { useRef, useEffect, useState } from 'react';

interface CameraOverlayProps {
  videoRef?: React.RefObject<HTMLVideoElement>;
  showLandmarks?: boolean;
  mirror?: boolean;
  facingMode?: 'user' | 'environment';
  onReady?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
}

export function CameraOverlay({
  videoRef: externalVideoRef,
  showLandmarks = true,
  mirror = true,
  facingMode = 'user',
  onReady,
  onError,
}: CameraOverlayProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Camera initialization effect — no ref reads in render
  useEffect(() => {
    async function startCamera() {
      try {
        setIsLoading(true);
        setError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        const videoEl = externalVideoRef?.current || internalVideoRef.current;
        if (videoEl) {
          videoEl.srcObject = mediaStream;
          videoEl.play().catch(() => {});
          setHasPermission(true);
          onReady?.(mediaStream);
        }
        streamRef.current = mediaStream;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera access denied');
        onError?.(err instanceof Error ? err : new Error('Camera access denied'));
      } finally {
        setIsLoading(false);
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [facingMode, onReady, onError]); // No ref in deps

  // Landmark overlay drawing effect
  useEffect(() => {
    if (!showLandmarks || !canvasRef.current) return;

    const videoEl = externalVideoRef?.current || internalVideoRef.current;
    if (!videoEl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!videoEl || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = videoEl.videoWidth * dpr;
      canvas.height = videoEl.videoHeight * dpr;
      canvas.style.width = `${videoEl.videoWidth}px`;
      canvas.style.height = `${videoEl.videoHeight}px`;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      if (mirror) {
        ctx.translate(canvas.width / dpr, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(videoEl, 0, 0, canvas.width / dpr, canvas.height / dpr);

      // landmarks drawing placeholder
      animationFrameRef.current = requestAnimationFrame(draw);
    };

    if (videoEl.readyState >= videoEl.HAVE_METADATA) {
      animationFrameRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [showLandmarks, mirror]); // No ref in deps

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'rgba(255,59,48,0.1)',
          border: '1px solid rgba(255,59,48,0.3)',
          borderRadius: 16,
          color: '#ff3b30',
          textAlign: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 32 }}>📷</div>
        <strong>Cámara no disponible</strong>
        <p style={{ fontSize: 13, color: '#8a8a8a', margin: 0 }}>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 16px',
            background: '#ff3b30',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 16,
          color: '#8a8a8a',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(98,126,132,0.3)',
            borderTopColor: '#627e84',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span style={{ fontSize: 13 }}>Iniciando cámara...</span>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0a0a0c',
      }}
    >
      <video
        ref={externalVideoRef || internalVideoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirror ? 'scaleX(-1)' : 'none',
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'rgba(52,199,89,0.15)',
          border: '1px solid rgba(52,199,89,0.3)',
          borderRadius: 20,
          fontSize: 11,
          color: '#34c759',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#34c759',
            animation: 'pulse 1.5s infinite',
          }}
        />
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tracking
        </span>
      </div>
      {showLandmarks && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            right: 12,
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#8a8a8a',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ff6b35',
              }}
            />
            <span>Mano derecha</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#8a8a8a',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#00d4aa',
              }}
            />
            <span>Mano izquierda</span>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}