# WORKPLAN.md — Estado del trabajo (hackathon)

> Fuente de verdad del **estado** de cada área. El *qué hace cada quién* vive en [`PLAN.md`](PLAN.md); las reglas técnicas en [`AGENTS.md`](AGENTS.md).
> Regla: se actualiza al cerrar cada tarea, con verificación real (no "está casi"). Commits semánticos + PR a `develop`.

---

## 0. Baseline del repo (verificado 2026-08-29)

| Ítem | Estado | Nota |
|---|---|---|
| `apps/studio` build + typecheck | ✅ OK | `npx tsc --noEmit` + `npm run build` |
| `apps/studio` unit tests | ✅ 6/6 | vitest 2.1.9 + jsdom 24 (nuevo: `npm test`) |
| `apps/studio` lint | ✅ 0 errores | warnings pre-existentes, no bloqueantes |
| `apps/humanmidi` + `apps/bridge` pytest | ⏳ pendiente | el entorno de Python se está instalando (venv del repo) |
| `mediapipe` pin | ⚠️ **problema de plataforma** | `0.10.14` no tiene wheel en macOS arm64 → instalar `0.10.33` (último con `mp.solutions.hands`). Actualizar `requirements.txt` con nota de plataforma. |
| CI | ❌ no existe | el PR #1 no tiene checks automáticos; la verificación es manual por ahora |

**Hallazgo**: el `INTEGRATION_REPORT.md` describe 49/49 + 53/53 tests, pero esa verificación fue en otra máquina. En esta Mac el entorno no estaba instalado (faltaba `rtmidi`, `mediapipe`). El repo recién queda "verificado" cuando la suite pasa en la máquina de cada dev.

---

## 1. Estado por persona

| Dev | Área (PLAN §4) | Estado | PR / Rama | DoD pendiente |
|---|---|---|---|---|
| **David** | Live Engine (humanmidi, bridge, studio/live, simulator) | 🔵 4/6 tareas completas | `feat/live-robustez` → PR #1 | demo manual: mano 10 s sin cortes |
| **Andrés** | UI/UX (studio components + app) | ⚪ sin datos | — | — |
| **Miguel** | Agente IA (`apps/agent/`, intent_profile) | ⚪ sin datos | rama `miguel` | — |
| **Tomás** | Backend/Convex (`apps/studio/convex/`, deploy) | ⚪ sin datos | rama `feat/backend` | — |
| **Brickman** | Mastering DSP (`apps/audiomind/`, mapper, presets) | ⚪ sin datos | — | — |

> Los que están en ⚪: actualicen su fila al cerrar algo. El camino crítico del hackathon es el vertical slice (login → subir → procesar → descargar), dueños Tomás + Brickman + Andrés.

---

## 2. Detalle área Live (David)

| # | Tarea (PLAN §4 David) | Estado | Verificación | PR |
|---|---|---|---|---|
| 1 | Robustez socket (heartbeat 5 s, watchdog stale, neutral > 2 s) | ✅ | 4 unit tests (`liveSocket.test.ts`) + 1 e2e existente | #1 |
| 2 | Fix glitch: grafo no se recrea al cambiar params | ✅ | test de regresión red/green (`useLiveEngine.test.ts`) | #1 |
| 3 | Grabar + descargar sesión Live | ✅ | UI cableada al hook (antes: callbacks no-op) | #1 |
| 4 | Conectar master real del flujo de mastering | ✅ | LiveView decodifica `masterAudioUrl` → hook (contrato intacto) | #1 |
| 5 | Mapeo gestos acordado (con Brickman/Andrés) | ⏳ bloqueado | espera lista de perillas de Brickman | — |
| 6 | Escenas en Convex | ⏳ bloqueado | espera schema Convex de Tomás; puente: localStorage | — |

### Verificación del PR #1 (rama `feat/live-robustez`)

```bash
cd apps/studio
npx tsc --noEmit          # OK
npm test                  # 6/6 (vitest)
npx eslint src/lib/live/  # 0 errores
npm run build             # OK
```

### Pendientes del área live

- [ ] DoD manual: subir track → masterizar → Live → mover la mano 10 s sin cortes de audio (verificación en demo)
- [ ] e2e `master_to_live.spec.ts` contra el flujo real (requiere backend + fixture)
- [ ] Escenas: diseñar contra `project_state.schema.json` cuando exista; mientras, localStorage
- [ ] Decidir con Brickman el mapeo final gestos → LiveParams (hoy: CC74/92/71/73/16 + notas 36/38/42/49)

---

## 3. Decisiones del equipo

| Decisión | Estado |
|---|---|
| Flujo de trabajo | ✅ **Ramas `feat/*` desde `develop` + PR a `develop`** (PLAN §7). `main` solo recibe merges de develop. |
| Contratos (Hito 0) | `live_params.schema.json` ✅ · `mastering_settings` ⬜ Brickman · `intent_profile` ⬜ Miguel · `project_state` ⬜ Tomás |
| CI/CD | ❌ pendiente: Playwright job en GitHub Actions (next step del INTEGRATION_REPORT) |
| `mediapipe` pin | ⚠️ decidir: `0.10.14` (Linux) vs `0.10.33` (macOS arm64) — o versionar por plataforma |
