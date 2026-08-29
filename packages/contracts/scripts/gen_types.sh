#!/usr/bin/env bash
# Genera tipos TypeScript y Python desde live_params.schema.json
# Uso: ./gen_types.sh
# Requiere: npm i -g json-schema-to-typescript (para TS)
#           pip install datamodel-code-generator (para Python)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR"
SCHEMA_FILE="$CONTRACTS_DIR/live_params.schema.json"

# ──────────────────────────────────────────────────────────────────────
# TypeScript → apps/studio/src/lib/live/liveParams.gen.ts
# ──────────────────────────────────────────────────────────────────────
TS_OUT="$CONTRACTS_DIR/../apps/studio/src/lib/live/liveParams.gen.ts"
mkdir -p "$(dirname "$TS_OUT")"

if command -v json-schema-to-typescript >/dev/null 2>&1; then
  echo "🔧 Generando TypeScript → $TS_OUT"
  json-schema-to-typescript "$SCHEMA_FILE" \
    --output "$TS_OUT" \
    --style.singleQuote true \
    --style.semi true \
    --bannerComment "// AUTOGENERADO desde live_params.schema.json — NO EDITAR A MANO"
else
  echo "⚠️  json-schema-to-typescript no instalado. Saltando TS."
  echo "   Instalar: npm i -g json-schema-to-typescript"
fi

# ──────────────────────────────────────────────────────────────────────
# Python → apps/bridge/live_params.py (dataclass con defaults)
# ──────────────────────────────────────────────────────────────────────
PY_OUT="$CONTRACTS_DIR/../apps/bridge/live_params.py"
mkdir -p "$(dirname "$PY_OUT")"

if command -v datamodel-codegen >/dev/null 2>&1; then
  echo "🔧 Generando Python → $PY_OUT"
  datamodel-codegen \
    --input "$SCHEMA_FILE" \
    --input-file-type jsonschema \
    --output "$PY_OUT" \
    --target-python-version 3.12 \
    --use-standard-collections \
    --use-default \
    --use-generic-container-types \
    --field-constraints \
    --disable-timestamp \
    --use-union-operator \
    --class-name LiveParams
else
  echo "⚠️  datamodel-codegen no instalado. Saltando Python."
  echo "   Instalar: pip install datamodel-code-generator"
fi

echo "✅ Generación completa"