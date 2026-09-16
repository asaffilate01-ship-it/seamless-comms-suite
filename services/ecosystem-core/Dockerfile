FROM python:3.12-slim
WORKDIR /app
COPY . /app
RUN useradd --uid 10001 --create-home ecosystem && mkdir -p /data && chown ecosystem:ecosystem /data
USER ecosystem
ENV ECOSYSTEM_DB=/data/ecosystem.db BIND=0.0.0.0 PORT=8787 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8787
CMD ["python3","app.py"]
