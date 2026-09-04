FROM python:3.12-slim

# Build amigable con poca RAM (Railway 1GB):
# - Acquire::GzipIndexes=false: no descomprime los indices gzip de apt en memoria
# - Acquire::Languages=none: no descarga los indices de idiomas (menos trafico y RAM)
# - Acquire::http::Pipeline-Depth=0: procesa un paquete a la vez (picos de RAM menores)
RUN apt-get update \
    -o Acquire::GzipIndexes=false \
    -o Acquire::Languages=none \
    -o Acquire::http::Pipeline-Depth=0 \
    && apt-get install -y --no-install-recommends \
    libatomic1 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Capa cacheable de SOLO dependencias (sin el codigo, sin cache de pip).
# tomllib lee la lista en build time: si cambian las deps, esta capa se invalida sola.
# setuptools+wheel se necesitan para el editable final con --no-build-isolation.
COPY pyproject.toml .
RUN pip install --no-cache-dir $(python -c "import tomllib;d=tomllib.load(open('pyproject.toml','rb'))['project']['dependencies'];print(' '.join(d))") \
    && pip install --no-cache-dir setuptools wheel

# Codigo: instalar el paquete editable SIN re-bajar ni resolver dependencias.
# Editable es obligatorio: config.py resuelve uploads/outputs con Path(__file__).parent*3.
COPY src/ src/
RUN pip install --no-cache-dir --no-deps --no-build-isolation -e .

RUN mkdir -p uploads outputs

EXPOSE 8000

# Railway provee $PORT; si no existe, cae a 8000.
CMD ["sh", "-c", "uvicorn audiomind.main:app --host 0.0.0.0 --port ${PORT:-8000}"]