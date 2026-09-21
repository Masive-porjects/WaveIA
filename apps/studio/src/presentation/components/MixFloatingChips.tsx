"use client";

import { AudioWaveform, Music2 } from "lucide-react";
import type { MixChip } from "./mixI18n";

interface MixFloatingChipsProps {
  /** Lista de chips YA traducidos (etapas DSP + stems presentes). */
  chips: MixChip[];
  /** Índice de la etapa actual del ticker de MixPanel: la ventana visible
   *  rota a partir de este índice (mismo timing ``stageMsForDuration``). */
  stageIndex: number;
}

/** Cuántos chips flotan a la vez (ventana del ticker). */
const VISIBLE_CHIPS = 4;

/** Hash determinista por id: la posición de cada chip es estable entre
 *  ticks (solo la ventana rota) y no salta entre renders. */
function chipSlot(id: string): { left: number; delay: number; duration: number } {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return {
    left: 8 + (h % 78), // 8 % – 86 % del ancho de la tarjeta
    delay: (h % 5) * 0.22, // escalonado 0 – 0.9 s
    duration: 2.6 + (h % 3) * 0.3, // 2.6 – 3.2 s por ciclo de deriva
  };
}

/**
 * Overlay DECORATIVO de "pedazos de audio" flotando sobre la tarjeta
 * mientras corre el POST /mix. Las etapas DSP sí se aplican en la cadena
 * real del backend; el timing de cada chip es simulado por el ticker de
 * MixPanel (progress cap 95 %, 100 % solo con la respuesta real). La
 * ventana visible rota con ``stageIndex``; al remontar por tick los chips
 * reaparecen escalonados (drift: aparecen → flotan → desaparecen).
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
          <div
            key={`${stageIndex}-${chip.id}`}
            className="absolute flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              left: `${slot.left}%`,
              top: `${10 + (i % 3) * 24}%`,
              color: isStage ? "#30d158" : "#8b8af2",
              background: isStage
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(94, 92, 230, 0.12)",
              border: isStage
                ? "1px solid rgba(16, 185, 129, 0.35)"
                : "1px solid rgba(94, 92, 230, 0.35)",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
              animation: `mixChipDrift ${slot.duration}s ease-in-out ${slot.delay}s infinite`,
            }}
          >
            {isStage ? (
              <AudioWaveform size={11} strokeWidth={2.5} />
            ) : (
              <Music2 size={11} strokeWidth={2.5} />
            )}
            <span className="whitespace-nowrap">{chip.label}</span>
          </div>
        );
      })}
    </div>
  );
}