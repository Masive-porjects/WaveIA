/**
 * Defaults del LiveParams — fuente de verdad: packages/contracts/live_params.schema.json
 *
 * Neutral = defaults del schema = master idéntico al original (regla AGENTS.md).
 * Se usa para el estado inicial del Live Engine y para el reset tras socket caído > 2 s.
 */
import type { LiveParams } from './liveParams.gen';

export const LIVE_PARAM_DEFAULTS: LiveParams = {
  ts: 0, // se sobreescribe con Date.now() al aplicar
  filter_cutoff: 12000,
  filter_res: 0.7,
  drive: 0,
  delay_time: 250,
  echo_feedback: 0,
  reverb_mix: 0,
  output_level: 0.9,
  fx_preset: null,
};

/** Tiempo máximo con socket caído antes de volver a neutral (spec AGENTS.md). */
export const NEUTRAL_AFTER_MS = 2000;

/** Intervalo de chequeo de la política de neutral. */
export const NEUTRAL_CHECK_MS = 250;
