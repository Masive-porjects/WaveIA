# apps/agent — Agente de interpretación de intención

Traduce lo que el usuario dice en el chat a un **`IntentProfile`**: nueve ejes semánticos de 0 a 1.

No toca el motor de audio. Devuelve un perfil; el **mapper** (propiedad del área de DSP) lo convierte en `MasteringSettings`. Ver [`PLAN.md`](../../PLAN.md) §2 D2 y D4.

```
Lenguaje natural → agente → IntentProfile → [mapper] → MasteringSettings → motor → audio
```

## Correr

```bash
npm run check -w apps/agent    # verifica el contrato, no llama a la API
npm run chat  -w apps/agent    # REPL interactivo, sí llama a la API
npm run typecheck -w apps/agent
```

El REPL necesita credenciales: `ANTHROPIC_API_KEY` en el entorno, o `ant auth login`.

## Uso

```ts
import { interpretIntent, NEUTRAL_PROFILE } from "@midimastering/agent";

const result = await interpretIntent({
  messages: [{ role: "user", content: "quiero que suene más cálida, con la voz al frente" }],
  currentProfile: NEUTRAL_PROFILE,
  analysis: { detected_genre: "reggaeton", tempo_bpm: 96, integrated_lufs: -12.4 },
});

result.reply;               // lo que se muestra en el chat
result.profile;             // IntentProfile validado
result.changes;             // [{ axis: "warmth", from: 0.5, to: 0.7, delta: 0.2 }, ...]
result.needsClarification;  // true si el pedido era demasiado vago
```

## Decisiones

**Un solo objeto de salida, no una unión.** Los esquemas con `oneOf` son frágiles con structured outputs. `needs_clarification: boolean` + `clarifying_question: string` expresan lo mismo sin ambigüedad.

**El perfil no se mueve cuando el agente pregunta.** Si `needs_clarification` es `true`, `interpretIntent` devuelve el perfil de entrada intacto. Sin esa guarda, el modelo puede preguntar y ajustar en el mismo turno.

**Fuera de rango se rechaza, no se recorta.** Un `warmth: 1.4` significa que el modelo entendió mal el contrato. Hacerle `clamp` esconde el bug y produce un master que nadie pidió.

**Ajuste incremental.** Recibe el perfil actual y suma sobre él. "Ahora un poco más de brillo" no empieza de cero.

**`effort: "low"` por defecto.** El chat es sensible a la latencia y esto es interpretación acotada, no razonamiento profundo. Configurable por llamada.

**El system prompt es estable byte a byte** y lleva `cache_control`. Todo lo que varía entre turnos (perfil actual, análisis del track) va en el mensaje de usuario, para no invalidar el prefijo cacheado.

## Estado

| | |
|---|---|
| Contrato `intent_profile.schema.json` | ✅ escrito |
| Espejo en Zod + validación | ✅ verificado (`npm run check`) |
| Prompt principal | ✅ escrito |
| `interpretIntent` | ✅ compila; **la llamada real no está probada** (no hay credenciales en el entorno) |
| Tipos Python para el mapper | ⬜ pendiente |
| Integración con Convex | ⬜ bloqueada por el schema de Convex |
| Memoria de conversación persistida | ⬜ pendiente (hoy el historial lo pasa quien llama) |

## Para el resto del equipo

**Brickman** — el mapper consume `IntentProfile`. Contrato duro: los nueve ejes en `0.5` deben devolver los defaults exactos de `MasteringParameters`, o sea bypass bit-exacto. `npm run check` verifica el lado del agente; el test del mapper es tuyo.

**Tomás** — `interpretIntent` es una función pura sobre `(historial, perfil, análisis)`. Encaja en una Convex action sin cambios. Necesito que `projects` guarde `messages[]` e `intentProfile`.

**Andrés** — `result.changes` trae los ejes que se movieron con su `from`/`to`, que es exactamente lo que necesita la tarjeta de "configuración propuesta" del chat. Cuando `needsClarification` es `true`, mostrá `clarifyingQuestion` en vez del diff.
