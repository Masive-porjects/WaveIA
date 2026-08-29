#!/usr/bin/env python3
"""
HumanMidi - Entry Point

SIEMPRE usar run.py como entry point (agrega la raiz al sys.path
y llama a src.main). Ejecutar src/main.py directo falla por imports.
"""
import sys
from pathlib import Path

# Agregar la raiz del proyecto al path para imports absolutos
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.main import main

if __name__ == "__main__":
    main()