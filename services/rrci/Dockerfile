FROM python:3.12-slim
WORKDIR /app
COPY requirements-hosting.txt requirements-neo4j.txt ./
RUN pip install --no-cache-dir -r requirements-hosting.txt -r requirements-neo4j.txt && useradd --uid 10001 --create-home knowledge
COPY knowledge_core/ knowledge_core/
RUN mkdir -p /app/var && chown knowledge:knowledge /app/var
USER knowledge
ENV KNOWLEDGE_DB=/app/var/knowledge.db KNOWLEDGE_CREDENTIALS=/run/secrets/knowledge-credentials.json
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "4", "--timeout", "120", "knowledge_core.app:create_app()"]
