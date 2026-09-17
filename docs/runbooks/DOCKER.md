# DOCKER.md — Stack local con Docker Compose

> Alternativa dockerizada a `SETUP.md` para levantar el stack completo sin
> instalar Python/bun en el host. Solo necesitas Docker Desktop.
> Stack: Studio (Next.js :3000) · AudioMind (FastAPI :8000) · Simulator (WS :8765).

---

## 0. Requisitos

| Requisito | Versión | Por qué |
|---|---|---|
| Docker | ≥ 24 con Compose v2 | `docker compose` (plugin) |
| RAM libre | ~4 GB para el primer build | audiomind compila deps DSP pesadas (librosa, pedalboard, demucs-onnx) |

---

## 1. Levantar el stack

```bash
docker compose up --build        # primer build: varios minutos (deps DSP + next build)
docker compose up                # subsecuentes: usa cache
docker compose up -d             # en segundo plano
docker compose down              # detiene todo (los volúmenes sobreviven)
docker compose down -v           # detiene y BORRA uploads/outputs persistidos
```

**Esperado:** `docker compose ps` muestra los 3 servicios `healthy`.

| Servicio | URL | Qué es |
|---|---|---|
| `studio` | http://localhost:3000 | UI de mastering + pestaña Live (build de producción, `next start` standalone) |
| `audiomind` | http://localhost:8000/health | DSP de mastering (`{"status":"ok","service":"AudioMind"}`) |
| `simulator` | ws://localhost:8765 | Mock del bridge: emite `LiveParams` sintéticos (scenario `sweep`, loop) |

---

## 2. Decisiones de diseño (por qué es así)

- **El bridge NO está dockerizado.** `python-rtmidi` necesita el stack MIDI del
  host (hardware/driver); dentro de un contenedor `MidiListener.open()` falla y
  el proceso sale. El `simulator` ocupa su lugar en :8765 — es el mismo mock que
  usa la suite e2e. Si tienes un controlador MIDI, corre el bridge en el host
  (`scripts/start/start-bridge.bat`) y comenta el servicio `simulator` para no
  pelear por el puerto.
- **`NEXT_PUBLIC_API_URL` es un build-arg.** Las `NEXT_PUBLIC_*` se inlinean en
  el bundle durante `next build` — cambiarla exige `docker compose build studio`.
  El default `http://localhost:8000/api` es correcto porque el browser corre en
  el host y llega a audiomind por el puerto publicado.
- **Studio corre standalone.** `next.config.ts` usa `output: "standalone"` +
  `outputFileTracingRoot` en la raíz del monorepo; el Dockerfile copia solo lo
  trazado (imagen final sin `node_modules` completos). `next start` y los
  deploys en Vercel/Railway no se ven afectados.
- **Convex no es obligatorio.** El provider de la app es un passthrough
  (`ConvexClientProvider`); el studio compila y corre sin
  `NEXT_PUBLIC_CONVEX_URL`. Si necesitas auth/datos reales, pásala como
  build-arg: `docker compose build --build-arg NEXT_PUBLIC_CONVEX_URL=https://… studio`.
- **`GEMINI_API_KEY` / ElevenLabs** son envs de runtime de las rutas `/voz/*`.
  Sin ellas esas rutas responden degradado (comportamiento ya existente).
  Para habilitarlas: `environment:` en el servicio `studio` o un `.env` junto
  al compose.

---

## 3. Persistencia

- `audiomind-uploads` y `audiomind-outputs` son volúmenes nombrados: los WAV
  subidos y los masters sobreviven a `restart`/`down`.
- **Las sesiones siguen siendo en memoria** (regla no negociable del backend):
  reiniciar el contenedor pierde el estado de sesión — el frontend muestra
  "Tu sesión anterior expiró". Igual que en el run local.

---

## 4. Verificación

```bash
docker compose ps                                   # 3 servicios healthy
curl http://localhost:8000/health                   # {"status":"ok","service":"AudioMind"}
curl -I http://localhost:3000                       # 200
# Live Engine: pestaña "Live" del studio — con el simulator corriendo, los
# knobs se mueven solos (sweep) y los metros reaccionan.
```

---

## 5. Pitfalls

| # | Pitfall | Detalle |
|---|---|---|
| 1 | Puerto 8765 ocupado | bridge local y simulator no pueden coexistir: comenta uno |
| 2 | Cambiar `NEXT_PUBLIC_API_URL` | es build-arg: `docker compose build studio` (no basta `restart`) |
| 3 | Primer build lento | demucs-onnx/onnxruntime pesan ~1 GB; los rebuilds usan cache |
| 4 | `docker compose up` viejo | tras cambios de código: `docker compose up --build` |
