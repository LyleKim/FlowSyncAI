FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# collectstatic only needs importable settings, not the real secret
RUN chmod +x scripts/entrypoint.sh \
    && DJANGO_SECRET_KEY=build-only DJANGO_DOTENV=0 python manage.py collectstatic --noinput \
    && useradd --system --uid 10001 --no-create-home app

USER app

EXPOSE 8000

# Dev default (docker-compose.yml): wait for DB, migrate, runserver.
# Prod (docker-compose.prod.yml) overrides the command with gunicorn and runs migrate as its own step.
CMD ["./scripts/entrypoint.sh"]
