#!/usr/bin/env python3
"""
Generador de tipos Python desde live_params.schema.json
Sin dependencias externas -- usa solo stdlib.
Genera: apps/bridge/live_params.py
"""
import json
import sys
from pathlib import Path

CONTRACTS_DIR = Path(__file__).parent.parent
SCHEMA_FILE = CONTRACTS_DIR / "live_params.schema.json"
PY_OUT = CONTRACTS_DIR.parent.parent / "apps" / "bridge" / "live_params.py"

def generate_python():
    with open(SCHEMA_FILE, encoding="utf-8") as f:
        schema = json.load(f)

    props = schema.get("properties", {})
    required = set(schema.get("required", []))

    # Separate fields: required first, then optional with defaults, then optional without
    required_fields = []
    optional_with_default = []
    optional_without_default = []

    for name, prop in props.items():
        is_required = name in required
        default = _json_to_default(prop, name)
        
        if is_required:
            required_fields.append((name, prop))
        elif default is not None:
            optional_with_default.append((name, prop))
        else:
            optional_without_default.append((name, prop))

    lines = [
        '"""',
        'LiveParams -- Tipos generados automaticamente desde live_params.schema.json',
        'NO EDITAR A MANO: ejecutar packages/contracts/scripts/gen_types.py',
        '"""',
        "",
        "from dataclasses import dataclass, field",
        "from typing import Optional, Literal",
        "",
        "",
        "@dataclass",
        "class LiveParams:",
    ]

    # Required fields first (no defaults)
    for name, prop in required_fields:
        py_type = _json_to_python_type(prop)
        lines.append("    " + name + ": " + py_type)

    # Optional with defaults
    for name, prop in optional_with_default:
        py_type = _json_to_python_type(prop)
        default = _json_to_default(prop, name)
        lines.append("    " + name + ": " + py_type + " = " + default)

    # Optional without defaults - use Optional with default=None via field
    for name, prop in optional_without_default:
        py_type = _json_to_python_type(prop)
        if not py_type.startswith("Optional["):
            py_type = "Optional[" + py_type + "]"
        lines.append("    " + name + ": " + py_type + " = field(default=None)")

    # Factory method para crear con defaults
    lines.extend([
        "",
        "    @classmethod",
        "    def defaults(cls) -> 'LiveParams':",
        "        return cls(",
    ])

    for name, prop in required_fields + optional_with_default + optional_without_default:
        default = _json_to_default(prop, name)
        if default is not None:
            lines.append("            " + name + "=" + default + ",")
        elif name in required:
            lines.append("            " + name + "=...,  # required")
        else:
            lines.append("            " + name + "=None,")

    lines.append("        )")

    # Factory para neutral (bypass)
    lines.extend([
        "",
        "    @classmethod",
        "    def neutral(cls) -> 'LiveParams':",
        "        '''Neutral = bypass bit-exacto / audio identico'''",
        "        return cls(",
    ])

    for name, prop in required_fields + optional_with_default + optional_without_default:
        default = _json_to_default(prop, name)
        if default is not None:
            lines.append("            " + name + "=" + default + ",")
        else:
            lines.append("            " + name + "=None,")

    lines.append("        )")

    PY_OUT.parent.mkdir(parents=True, exist_ok=True)
    PY_OUT.write_text("\n".join(lines), encoding="utf-8")
    print("[OK] Generado Python -> " + str(PY_OUT))


def _json_to_python_type(prop):
    t = prop.get("type")
    if isinstance(t, list):
        # Union type, e.g., ["string", "null"]
        non_null = [x for x in t if x != "null"]
        if len(non_null) == 1:
            return _json_to_python_type({"type": non_null[0], **{k: v for k, v in prop.items() if k != "type"}})
    if t == "string":
        enum = prop.get("enum")
        if enum:
            vals = ", ".join('"' + str(v) + '"' for v in enum if v is not None)
            return "Optional[Literal[" + vals + "]]" if "null" in (prop.get("type") if isinstance(prop.get("type"), list) else []) else "Literal[" + vals + "]"
        return "str"
    if t == "number":
        return "float"
    if t == "integer":
        return "int"
    if t == "boolean":
        return "bool"
    return "Any"


def _json_to_default(prop, name):
    if "default" in prop:
        val = prop["default"]
        if isinstance(val, str):
            return '"' + val + '"'
        if isinstance(val, bool):
            return "True" if val else "False"
        return str(val)
    if name == "ts":
        return "0.0"  # required, no default in schema but we need one
    return None


if __name__ == "__main__":
    generate_python()