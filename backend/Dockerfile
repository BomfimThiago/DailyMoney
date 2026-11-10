FROM python:3.12-slim

# Scanned PDF statements (CaixaBank) are read by OCR.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "uv>=0.5,<0.6"
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN useradd --create-home appuser
USER appuser

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# Migrations run before the server so a deploy never serves code against an old schema.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
