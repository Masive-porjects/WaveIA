"use client";

import { useEffect, useRef } from "react";

/**
 * Espectro que reacciona al audio que está sonando de verdad.
 *
 * El Player ya tenía pulso y shimmer, pero animaban en bucle: se movían igual
 * con silencio que con un drop. Esto lee el audio real, así que el usuario ve
 * lo que escucha — que es justamente lo que hace creíble una herramienta de
 * mastering.
 *
 * Dibuja en canvas y no en DOM porque son 48 barras a 60 fps: con nodos de
 * React el navegador se pasa el frame entero reconciliando.
 */

/**
 * Muchas barras y finas.
 *
 * Con pocas barras anchas el espectro se lee como bloques encima de la onda y
 * la tapa. La onda ya es la visualizacion principal: esto la acompania desde
 * abajo, como un piso de energia.
 */
const BAR_COUNT = 110;

/** Fraccion de la altura que puede ocupar. El resto queda para la onda. */
const MAX_HEIGHT = 0.42;
/** Cuánto conserva cada barra de su valor anterior. Sin esto tiembla. */
const SMOOTHING = 0.62;
/** Las frecuencias altas casi no tienen energía: se compensa para que se vean. */
const TILT = 1.9;

export interface AudioSpectrumProps {
  /** El elemento que está reproduciendo. null cuando no hay nada sonando. */
  mediaElement: HTMLMediaElement | null;
  playing: boolean;
  className?: string;
}

/**
 * Un AudioContext por elemento, para siempre.
 *
 * createMediaElementSource lanza si se llama dos veces sobre el mismo elemento,
 * y el nodo no se puede desconectar del elemento una vez creado. Por eso se
 * cachea en un WeakMap: si el elemento se descarta, la entrada se va con él.
 */
const sources = new WeakMap<
  HTMLMediaElement,
  { context: AudioContext; analyser: AnalyserNode }
>();

function getAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  const cached = sources.get(el);
  if (cached) return cached.analyser;

  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(el);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    // El analyser no reemplaza la salida: hay que reconectar al destino o el
    // audio deja de escucharse.
    analyser.connect(context.destination);
    sources.set(el, { context, analyser });
    return analyser;
  } catch {
    // Otro código ya tomó este elemento, o el navegador no lo permite.
    // Sin espectro el reproductor sigue funcionando igual.
    return null;
  }
}

export default function AudioSpectrum({
  mediaElement,
  playing,
  className,
}: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const levelsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mediaElement) return;

    const analyser = getAnalyser(mediaElement);
    const ctx = canvas.getContext("2d");
    if (!analyser || !ctx) return;

    /**
     * Reanudar el contexto NO es opcional.
     *
     * Al crear el MediaElementSource, el audio del elemento pasa a salir por
     * este grafo. Si el contexto queda suspendido, el reproductor se queda
     * mudo aunque la onda avance. Por eso se reanuda ante cualquier intento de
     * reproducción, no solo cuando el efecto se vuelve a ejecutar.
     */
    const context = sources.get(mediaElement)?.context;
    const resume = () => {
      if (context?.state === "suspended") void context.resume();
    };
    resume();
    mediaElement.addEventListener("play", resume);
    mediaElement.addEventListener("playing", resume);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const levels = levelsRef.current;

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, width, height);

      if (playing) analyser.getByteFrequencyData(bins);

      const barWidth = width / BAR_COUNT;
      const usable = Math.floor(bins.length * 0.7); // arriba de eso no hay nada
      const ceiling = height * MAX_HEIGHT;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Reparto logarítmico: los graves ocupan pocos bins pero mucha energía.
        const from = Math.floor((i / BAR_COUNT) ** 1.7 * usable);
        const to = Math.max(from + 1, Math.floor(((i + 1) / BAR_COUNT) ** 1.7 * usable));

        let sum = 0;
        for (let b = from; b < to; b++) sum += bins[b];
        const avg = playing ? sum / (to - from) / 255 : 0;

        const tilted = Math.min(1, avg * (1 + (i / BAR_COUNT) * TILT));
        levels[i] = levels[i] * SMOOTHING + tilted * (1 - SMOOTHING);

        const intensity = levels[i];
        const barHeight = intensity * ceiling;
        if (barHeight < 0.6) continue; // en silencio no se dibuja nada

        // Ancladas abajo, no centradas: asi no cruzan la onda.
        const x = i * barWidth + barWidth * 0.25;
        const y = height - barHeight;

        // Teal del sistema, translucido. Techo bajo a proposito: si compite con
        // la onda, las dos se leen peor.
        ctx.fillStyle = `rgba(130, 156, 161, ${0.12 + intensity * 0.3})`;
        ctx.fillRect(x, y, Math.max(1, barWidth * 0.5), barHeight);
      }
    };

    draw();
    return () => {
      mediaElement.removeEventListener("play", resume);
      mediaElement.removeEventListener("playing", resume);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [mediaElement, playing]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
