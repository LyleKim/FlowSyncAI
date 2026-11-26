import os

os.environ.setdefault('DJANGO_SECRET_KEY', 'test-only-secret')

from .settings import *  # noqa: E402,F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
