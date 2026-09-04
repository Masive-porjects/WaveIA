FROM python:3.11-alpine

# apk con --no-cache: sin cache de indices ni de paquetes (menos RAM y disco).
# libatomic: pedalboard necesita libatomic.so.1 (musl).
# libsndfile: soundfile/librosa.
# g++ gcc python3-dev musl-dev: toolchain por si algun wheel musllinux no existe y
# pip tiene que compilar (muy probable con demucs-onnx/onnxruntime en Alpine).
RUN apk add --no-cache \
    libatomic \
    libsndfile \
    g++ \
    gcc \
    python3-dev \
    musl-dev

WORKDIR /app

# Capa cacheable de SOLO dependencias (sin el codigo, sin cache de pip).
# tomllib lee la lista del pyproject en build time: si cambian las deps,
# esta capa se invalida sola. Instalar `pip install .` aca (sin src/) fallaria
# porque el paquete es src-layout ([tool.setuptools.packages.find] where=["src"]).
# setuptools+wheel: necesarios para el editable final con --no-build-isolation.
COPY pyproject.toml .
RUN pip install --no-cache-dir $(python -c "import tomllib;d=tomllib.load(open('pyproject.toml','rb'))['project']['dependencies'];print(' '.join(d))") \
    && pip install --no-cache-dir setuptools wheel

# Codigo: instalar el paquete editable SIN re-bajar ni resolver dependencias.
# Editable es obligatorio: config.py resuelve uploads/outputs con Path(__file__).parent*3
# y APUNTA A /app/src/audiomind/... — si instalaras en modo normal (pip install .),
# __file__ estaria en site-packages y las rutas de archivos se romperian.
COPY src/ src/
RUN pip install --no-cache-dir --no-deps --no-build-isolation -e .

RUN mkdir -p uploads outputs

EXPOSE 8000

# Railway provee $PORT; si no existe, cae a 8000.
CMD ["sh", "-c", "uvicorn audiomind.main:app --host 0.0.0.0 --port ${PORT:-8000}"]