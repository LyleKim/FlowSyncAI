#!/bin/sh
set -e

echo "Waiting for MySQL to become ready..."
python scripts/wait_for_db.py

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting Django development server..."
exec python manage.py runserver 0.0.0.0:8000
