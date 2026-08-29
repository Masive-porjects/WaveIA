# Handoff — Backend/Convex (Tomás)

> Rama: `feat/backend` (pusheada a `origin`) · PR abierto a `develop`:
> https://github.com/MiguelAriza77/THE-NEXT-CRAFT---HACKTHON-29-/pull/new/feat/backend
> (recordá cambiar el base branch a `develop`, GitHub propone `main` por default)

## Qué está hecho

Todo el scaffold de Convex descrito en `PLAN.md` §4 (Tomás), listo para pushear el schema en cuanto alguien del equipo se loguee:

| Archivo | Qué hace |
|---|---|
| `apps/studio/convex/schema.ts` | Tablas `projects` y `messages` + tablas de Convex Auth (`authTables`) |
| `apps/studio/convex/auth.ts`, `auth.config.ts`, `http.ts` | Convex Auth con provider email + contraseña |
| `apps/studio/convex/projects.ts` | `list`, `get`, `create`, `rename`, `remove`, `generateUploadUrl`, `attachAudio`, `setMasteringSettings` — todo filtrado por `userId` del usuario logueado |
| `apps/studio/convex/messages.ts` | `list`, `send` — chat persistido por proyecto (memoria de conversación, PLAN.md entregable 4 de Miguel) |
| `apps/studio/convex/mastering.ts` | Action `startMastering` — **idempotente** (si el job ya está en `pending`/`processing` no dispara otro), llama a AudioMind pasando una URL firmada de Storage (nunca el audio como payload — D1 del plan) |
| `apps/studio/src/app/ConvexClientProvider.tsx` | Envuelve la app con `ConvexAuthNextjsProvider` |
| `apps/studio/src/middleware.ts` | Requerido por Convex Auth para refrescar la sesión en SSR (no redirige nada todavía) |
| `packages/contracts/project_state.schema.json` | Contrato de estados del job (mi entregable de Hito 0) |
| `.github/workflows/studio-ci.yml` | CI: lint + build de `apps/studio` en cada PR. El deploy real queda apagado hasta que exista el secret `CONVEX_DEPLOY_KEY` |
| `apps/studio/convex/README.md` | Guía de setup para levantar Convex localmente |
| `apps/studio/.env.local.example` | Referencia de qué variables necesita el front |

**Modelo de datos** (`projects`):
```
projects
├── userId              (dueño)
├── audioFileId          (Convex Storage — original)
├── masteredFileId       (Convex Storage — resultado)
├── intentProfile        (última salida de la IA — Miguel)
├── masteringSettings    (lo que se procesa — Brickman)
├── job { status, progress, error, startedAt, finishedAt }
└── result { integrated_lufs, true_peak_db, crest_factor_db, ... }

messages (tabla aparte, indexada por projectId)
├── projectId, userId, role ("user"|"assistant"), content
```

Estados de `job.status`: `idle → pending → processing → completed | failed`.

## Qué falta (y quién sigue)

### 1. Login del equipo a Convex — bloquea todo lo demás
Alguien del equipo corre:
```bash
cd apps/studio
npx convex login
npx convex dev     # crea el proyecto, genera convex/_generated/, pushea el schema
```
Esto genera `.env.local` con `NEXT_PUBLIC_CONVEX_URL` (no se commitea — cada uno lo genera o lo copia del dashboard). Después invita al resto del equipo desde https://dashboard.convex.dev.

**Sin este paso**, `convex/_generated/` no existe y las funciones no corren — pero el código ya compila y está listo para el momento en que se loguee alguien.

### 2. Brickman — endpoint `/api/master` en AudioMind
`startMastering` (en `convex/mastering.ts`) ya asume este contrato:
```
POST {AUDIOMIND_URL}/api/master
body: { audio_url: string, settings: MasteringSettings }
resp: { mastered_url: string, metrics: { integrated_lufs, true_peak_db, ... } }
```
Hoy AudioMind trabaja con upload multipart + sesión en memoria (`apps/audiomind/src/audiomind/main.py`). Falta el endpoint stateless que reciba una URL en vez de bytes (PLAN.md, entregable 6 de Brickman). Una vez que exista y esté desplegado:
```bash
npx convex env set AUDIOMIND_URL https://tu-audiomind.up.railway.app
```

### 3. Andrés — conectar las pantallas
Las funciones ya están para consumir desde React con `useQuery`/`useMutation`/`useAction` de `convex/react`:
- Login: `api.auth.*` (via `@convex-dev/auth/react`, ver su doc)
- Panel: `api.projects.list`, `api.projects.create`
- Upload: `api.projects.generateUploadUrl` → subir el archivo → `api.projects.attachAudio`
- Procesar: `api.mastering.startMastering`
- Resultado: `api.projects.get` (trae `job`, `result`, `masteredFileId`)

### 4. Miguel — chat del agente
`api.messages.send` / `api.messages.list` ya están listos para que su action del agente los use en vez de guardar en RAM.

### 5. Deploy final
- AudioMind → Railway/Fly/Render (Brickman/Tomás).
- Studio → Vercel (recomendado por ser Next.js) + variable `NEXT_PUBLIC_CONVEX_URL` de producción.
- Activar el job `deploy-convex` del CI seteando el secret `CONVEX_DEPLOY_KEY` y la variable de repo `CONVEX_DEPLOY_ENABLED=true`.

## Definición de "listo" de esta parte (PLAN.md)
Dos usuarios distintos no ven los proyectos del otro (✅ ya scoped por `userId` en cada query/mutation), y darle 3 veces a "Procesar" genera **un** job (✅ `startMastering` chequea `job.status` antes de arrancar uno nuevo).

## Regla anti-bloqueo
Si estás esperando el login de Convex o el endpoint de Brickman, trabajá contra estos mismos archivos con datos falsos — las firmas de las funciones no van a cambiar.
