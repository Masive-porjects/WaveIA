# Convex — setup rápido

Dueño: Tomás (ver `PLAN.md` raíz). No se editan `_generated/*` a mano.

## Primera vez (una sola persona, después se comparte el deployment)

```bash
cd apps/studio
npx convex login        # login por navegador (código de un solo uso)
npx convex dev           # crea el proyecto Convex, genera convex/_generated/, pushea el schema
```

Esto crea/actualiza `.env.local` con `NEXT_PUBLIC_CONVEX_URL` (no se commitea).

## Resto del equipo

1. Pedirle a Tomás que los invite al proyecto en el [dashboard de Convex](https://dashboard.convex.dev).
2. `cp .env.local.example .env.local` y completar `NEXT_PUBLIC_CONVEX_URL` con la URL del deployment (dashboard → Settings → URL & Deploy Key).
3. `npx convex dev` (deja corriendo en una terminal aparte, junto a `npm run dev`).

## Variables de entorno del deployment (no de Next.js)

AudioMind se configura como variable de entorno **del deployment de Convex**, no en `.env.local`:

```bash
npx convex env set AUDIOMIND_URL https://tu-audiomind.up.railway.app
```

`startMastering` (`convex/mastering.ts`) falla explícitamente si esta variable no está seteada.

## Estructura

| Archivo | Qué hace |
|---|---|
| `schema.ts` | Tablas: `projects`, `messages` + tablas de auth (`authTables`) |
| `auth.ts` / `auth.config.ts` / `http.ts` | Convex Auth (email + contraseña) |
| `projects.ts` | CRUD de proyectos, upload de audio a Convex Storage — todo scoped por `userId` |
| `messages.ts` | Chat IA persistido por proyecto (lo consume el agente de Miguel) |
| `mastering.ts` | Action `startMastering` — idempotente, llama a AudioMind con una URL firmada (nunca con el audio como payload) |

## Contrato

El modelo de datos espeja `packages/contracts/project_state.schema.json`. Si cambia el schema de Convex, avisar al equipo y actualizar ese contrato.
