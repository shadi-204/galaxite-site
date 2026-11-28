FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY ingestion_worker.py asura_adapter.py ./

CMD ["python", "ingestion_worker.py"]
