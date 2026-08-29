#!/usr/bin/env python3
"""
Generate mastering_settings.schema.json from the MasteringParameters model.

Direction of trust differs from gen_types.py (schema -> Python): here the
Pydantic model in apps/audiomind IS the source of truth for the
frontend/backend contract, so the JSON is extracted from the model instead
of hand-maintained (the model's Field(ge/le/default/description) already
carries the full contract).

Run with the audiomind venv (needs pydantic):
    apps/audiomind/.venv/Scripts/python.exe packages/contracts/scripts/gen_mastering_schema.py
"""
import json
import sys
from pathlib import Path

from annotated_types import Ge, Le  # noqa: E402

# apps/audiomind/src — reachable from anywhere in the repo via __file__.
AUDIOMIND_SRC = Path(__file__).resolve().parents[3] / "apps" / "audiomind" / "src"
sys.path.insert(0, str(AUDIOMIND_SRC))

from audiomind.models.audio import MasteringParameters  # noqa: E402

SCHEMA_OUT = Path(__file__).resolve().parents[1] / "mastering_settings.schema.json"


def _json_type(annotation):
    """Map a Python annotation onto a JSON Schema type (or union)."""
    # Union detection covers BOTH typing.Optional[T] (has __origin__) and
    # PEP 604 `T | None` (types.UnionType — has __args__ but no __origin__).
    if (
        getattr(annotation, "__origin__", None) is not None
        or getattr(annotation, "__args__", None) is not None
    ):
        non_null = [a for a in annotation.__args__ if a is not type(None)]
        if len(non_null) == 1:
            base = _json_type(non_null[0])
            return [base, "null"] if base else None
        return None
    if annotation is bool:  # before int: bool subclasses int
        return "boolean"
    if annotation is int:
        return "integer"
    if annotation is float:
        return "number"
    if annotation is str:
        return "string"
    return None


def generate_schema():
    properties = {}
    for name, field in MasteringParameters.model_fields.items():
        prop = {}
        json_type = _json_type(field.annotation)
        if json_type is not None:
            prop["type"] = json_type
        ge = next((c.ge for c in field.metadata if isinstance(c, Ge)), None)
        le = next((c.le for c in field.metadata if isinstance(c, Le)), None)
        if ge is not None:
            prop["minimum"] = ge
        if le is not None:
            prop["maximum"] = le
        prop["default"] = field.default
        if field.description:
            prop["description"] = field.description
        properties[name] = prop

    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "MasteringSettings",
        "description": "Mastering DSP parameters shared by frontend and backend. "
        "Generated from the MasteringParameters Pydantic model — do not edit by "
        "hand; run gen_mastering_schema.py instead.",
        "type": "object",
        "properties": properties,
        "required": [],
        "additionalProperties": False,
    }

    SCHEMA_OUT.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"[OK] Schema -> {SCHEMA_OUT} ({len(properties)} fields)")


if __name__ == "__main__":
    generate_schema()