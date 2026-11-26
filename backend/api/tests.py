from unittest.mock import patch

from django.db.utils import OperationalError
from django.test import TestCase


class HealthTests(TestCase):
    def test_ok_with_db(self):
        r = self.client.get('/api/v1/health/')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'ok', 'db': 'ok'}))

    def test_db_down_is_503(self):
        with patch('api.views.connection.cursor', side_effect=OperationalError('down')):
            r = self.client.get('/api/v1/health/')
        self.assertEqual((r.status_code, r.json()['db']), (503, 'error'))
