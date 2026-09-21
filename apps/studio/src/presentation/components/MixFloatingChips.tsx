"use client";

import type { MixChip } from "./mixI18n";

interface MixFloatingChipsProps {
  /** Lista de chips YA traducidos (etapas DSP + stems presentes). */
  chips: MixChip[];
  /** Índice de la etapa actual del ticker de MixPanel: la ventana visible
   *  rota a partir de este índice (mismo timing ``stageMsForDuration``). */
  stageIndex: number;
}

/** Cuántas frases flotan a la vez (ventana del ticker). */
const VISIBLE_CHIPS = 4;

/** Hash determinista por id: la posición de cada frase es estable entre
 *  ticks (solo la ventana rota) y no salta entre renders. */
function chipSlot(id: string): { left: number; delay: number; duration: number } {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return {
    left: 6 + (h % 80), // 6 % – 86 % del ancho de la tarjeta
    delay: (h % 5) * 0.22, // escalonado 0 – 0.9 s
    duration: 2.6 + (h % 3) * 0.3, // 2.6 – 3.2 s por ciclo de deriva
  };
}

/**
 * Overlay DECORATIVO (v6): SOLO texto flotando sobre la tarjeta mientras
 * corre el POST /mix — sin caja, sin fondo, sin borde. Las etapas DSP sí
 * se aplican en la cadena real del backend; el timing de cada frase es
 * simulado por el ticker de MixPanel (progress cap 95 %, 100 % solo con
 * la respuesta real). La ventana visible rota con ``stageIndex``; al
 * remontar por tick las frases reaparecen escalonadas (drift: aparecen →
 * flotan → desaparecen). ``text-shadow`` sutil para legibilidad en dark
 * y light; tonalidad por tipo (etapas verde / stems violeta).
 */
export default function MixFloatingChips({
  chips,
  stageIndex,
}: MixFloatingChipsProps) {
  if (chips.length === 0) return null;

  const count = Math.min(VISIBLE_CHIPS, chips.length);
  const visible = Array.from(
    { length: count },
    (_, i) => chips[(stageIndex + i) % chips.length],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {visible.map((chip, i) => {
        const slot = chipSlot(chip.id);
        const isStage = chip.tone === "stage";
        return (
          <span
            key={`${stageIndex}-${chip.id}`}
            className="absolute whitespace-nowrap text-sm font-semibold tracking-tight"
            style={{
              left: `${slot.left}%`,
              top: `${12 + (i % 3) * 22}%`,
              color: isStage ? "#30d158" : "#8b8af2",
              textShadow:
                "0 1px 10px rgba(15, 23, 42, 0.45), 0 0 2px rgba(15, 23, 42, 0.3)",
              animation: `mixChipDrift ${slot.duration}s ease-in-out ${slot.delay}s infinite`,
            }}
          >
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}