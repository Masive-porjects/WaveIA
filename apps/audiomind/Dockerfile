FROM python:3.12-slim

# pedalboard necesita libatomic; soundfile/libsndfile necesitan libsndfile1
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
COPY src/ src/

RUN pip install --no-cache-dir -e .

RUN mkdir -p uploads outputs

EXPOSE 8000

CMD ["uvicorn", "audiomind.main:app", "--host", "0.0.0.0", "--port", "8000"]
