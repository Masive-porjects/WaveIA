FROM python:3.11-slim

# Build amigable con poca RAM (Railway 1GB):
# - GzipIndexes=false: no descomprime los indices gzip de apt en memoria
# - Languages=none / Pipeline-Depth=0: menos RAM y red en apt update
# - glibc: onnxruntime/demucs NO tienen wheels musllinux (en Alpine el resolver
#   fallaba con ResolutionImpossible). Slim = wheels manylinux disponibles.
RUN apt-get update \
    -o Acquire::GzipIndexes=false \
    -o Acquire::Languages=none \
    -o Acquire::http::Pipeline-Depth=0 \
    && apt-get install -y --no-install-recommends \
    libatomic1 \
    libsndfile1 \
    gcc \
    g++ \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# onnxruntime primero: demucs-onnx pide >=1.17 y sin un wheel instalado el
# resolver puede intentar compilarlo (o fallar la resolucion). Con onnxruntime
# ya instalado, el paso siguiente lo ve satisfecho y no lo re-resuelve.
COPY pyproject.toml .
RUN pip install --no-cache-dir onnxruntime \
    && pip install --no-cache-dir $(python -c "import tomllib;d=tomllib.load(open('pyproject.toml','rb'))['project']['dependencies'];print(' '.join(d))") \
    && pip install --no-cache-dir setuptools wheel

# Codigo: instalar el paquete editable SIN re-bajar ni resolver dependencias.
# Editable es obligatorio: config.py resuelve uploads/outputs con Path(__file__).parent*3
# y APUNTA A /app/src/audiomind/... — con pip install . normal, __file__ estaria en
# site-packages y las rutas de archivos se romperian.
COPY src/ src/
RUN pip install --no-cache-dir --no-deps --no-build-isolation -e .

RUN mkdir -p uploads outputs

EXPOSE 8000

# Railway provee $PORT; si no existe, cae a 8000.
# IMPORTANTE: el modulo es audiomind.main:app (src-layout), NO main:app.
CMD ["sh", "-c", "uvicorn audiomind.main:app --host 0.0.0.0 --port ${PORT:-8000}"]