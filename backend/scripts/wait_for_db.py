import os
import sys
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
from django.db import connection
from django.db.utils import OperationalError

django.setup()


def wait_for_db(max_retries=30, delay=2):
    for attempt in range(1, max_retries + 1):
        try:
            connection.ensure_connection()
            print('MySQL connection established.')
            return
        except OperationalError as exc:
            print(f'MySQL not ready ({attempt}/{max_retries}): {exc}')
            time.sleep(delay)

    print('Could not connect to MySQL after multiple retries.')
    sys.exit(1)


if __name__ == '__main__':
    wait_for_db()
