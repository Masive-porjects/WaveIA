FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY src/ src/

RUN mkdir -p uploads outputs

EXPOSE 8000

CMD ["uvicorn", "audiomind.main:app", "--host", "0.0.0.0", "--port", "8000"]
