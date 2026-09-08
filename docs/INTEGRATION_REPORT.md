# WaveAI × midiMastering — Integration Report

> **Date:** 2026-08-25 (original) · **Updated:** 2026-09-08 (post-cleanup)
> **Status:** ✅ Mastering integration complete — Live Engine standalone (knob-controlled)

---

## Post-cleanup note

The vision/gesture/real-time-control stack was **removed** from the monorepo:

- All camera/gesture/real-time-input applications and their mock/simulation tooling were deleted.
- The Studio's **Live Engine is standalone**: a Web Audio player controlled exclusively by knobs (mouse/keyboard). No camera, no gestures, no WebSocket, no socket-neutral policy.
- **Mastering (audiomind) is unchanged**: FastAPI + librosa + pedalboard, analysis + 13-stage DSP chain, in-memory sessions, `MasteringParameters` contract.
- `packages/contracts/live_params.schema.json` remains the source of truth for `LiveParams`; only TypeScript types are generated now (`apps/studio/src/lib/live/liveParams.gen.ts`).

---

## What Remains (accurate as of the cleanup)

### Monorepo Structure

```
WaveAI/
├── packages/
│   └── contracts/                 # Shared schema + type generator
│       ├── live_params.schema.json  # Source of truth (JSON Schema)
│       └── scripts/
│           └── gen_types.sh         # TS type generator only
│
├── apps/
│   ├── audiomind/                 # DSP backend (Python/FastAPI)
│   │   ├── src/audiomind/
│   │   │   ├── api/               # mastering.py (GET/POST endpoints)
│   │   │   ├── analysis/          # audio analyzer
│   │   │   └── intelligence/      # genre knowledge base
│   │   ├── tests/                 # pytest suite (green)
│   │   └── Dockerfile
│   │
│   └── studio/                    # Next.js 16 + Turbopack
│       ├── src/
│       │   ├── lib/live/          # Live Engine core (standalone)
│       │   │   ├── audioGraph.ts   # Web Audio node chain
│       │   │   ├── useLiveEngine.ts# Orchestrator hook (no WS)
│       │   │   ├── fxPresets.ts    # preset definitions
│       │   │   ├── recorder.ts     # MediaRecorder + MIME detection
│       │   │   └── liveParams.gen.ts # Generated types
│       │   ├── adapters/live/      # hook + audio graph adapters
│       │   ├── presentation/components/live/
│       │   │   ├── LiveView.tsx     # Container (2-column: FX + meters)
│       │   │   ├── FxSlotPanel.tsx  # 4 slots + preset selector
│       │   │   ├── Knob3D.tsx       # 3D rotary knob
│       │   │   ├── LiveMeters.tsx   # VU/Peak meters
│       │   │   └── LiveRecorderBar.tsx # Record controls
│       │   └── presentation/components/dock/   # Dock navigation
│       ├── tests/                 # Vitest suite
│       └── package.json
│
├── e2e/                           # Playwright E2E tests
│   ├── playwright.config.ts       # Chromium headless flags
│   ├── fixtures/
│   │   └── generate_fixture.py    # WAV audio generator
│   └── tests/
│       └── master_to_live.spec.ts # Upload → master → live (standalone)
│
├── frontend/                      # Legacy (moved to apps/studio)
├── backend/                       # Legacy (moved to apps/audiomind)
├── package.json                   # Root workspace config
└── .gitignore
```

### Shared Contract (LiveParams)

`packages/contracts/live_params.schema.json` — source of truth, unchanged.

Generated types:

| Language | Output Path | Generator |
|----------|-------------|-----------|
| TypeScript | `apps/studio/src/lib/live/liveParams.gen.ts` | `packages/contracts/scripts/gen_types.sh` |

The Python generation step was removed along with the deleted real-time-input applications; only the TypeScript target remains.

### Live Engine (standalone)

- Web Audio graph: `Source → Filter → Drive → Delay → Reverb → Master → Analyser`
- FX presets (clean, dub, big_room, radio) — knob or preset selector driven
- MediaRecorder with MIME detection (record + download)
- `useLiveEngine` orchestrator hook — params come exclusively from knobs

---

## Git History (original integration, for reference)

```
df477be test(e2e): playwright test suite, audio fixtures and helpers
06f5f83 feat(studio): live engine, web audio graph, knobs and dock integration
78b02bf feat(audiomind): dsp backend integration and session endpoints
f3b6311 feat(contracts): schema, generators and monorepo root setup
```

> The commits above are historical; the real-time-input applications they reference were removed in the September cleanup.

---

## How to Run (current stack)

### Prerequisites

- Node.js 18+ (Studio) + bun ≥ 1.3
- Python 3.12 (audiomind)

### Backend + Studio

```bash
cd apps/audiomind && uvicorn audiomind.main:app --port 8000   # http://localhost:8000/health
cd apps/studio && bun install && bun run dev                  # http://localhost:3000
```

### E2E Tests

```bash
cd apps/studio
npx playwright install chromium
npm run e2e:fixtures                                          # generate WAV fixture
npx playwright test --config=../../e2e/playwright.config.ts
```

---

## Next Steps

1. Run the E2E suite against the local Studio (needs backend + fixture).
2. CI/CD: add Playwright job to GitHub Actions with `webServer` config.
3. Re-record `docs/UX_MAP.md` section 5 for the 2-column standalone Live layout (done in the cleanup docs pass).