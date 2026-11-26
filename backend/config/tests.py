import json
import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parent.parent
PROBE = ('import json, config.settings as s; print(json.dumps({"debug": s.DEBUG, "hosts": s.ALLOWED_HOSTS, '
         '"cors": s.CORS_ALLOWED_ORIGINS, "all": getattr(s, "CORS_ALLOW_ALL_ORIGINS", False), '
         '"proxy": getattr(s, "SECURE_PROXY_SSL_HEADER", None), "secure": getattr(s, "SESSION_COOKIE_SECURE", False)}))')


def load(**env):
    """Import config.settings in a clean subprocess with only the given env (no .env file)."""
    base = {k: v for k, v in os.environ.items() if not k.startswith(('DJANGO_', 'DEBUG', 'ALLOWED_', 'CORS_'))}
    base.update(env, DJANGO_DOTENV='0')
    return subprocess.run([sys.executable, '-c', PROBE], cwd=BACKEND, env=base, capture_output=True, text=True)


class SettingsTests(SimpleTestCase):
    def test_debug_off_without_secret_fails(self):
        r = load()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('DJANGO_SECRET_KEY', r.stderr)

    def test_debug_on_allows_dev_secret_and_local_defaults(self):
        r = load(DEBUG='True')
        self.assertEqual(r.returncode, 0, r.stderr)
        s = json.loads(r.stdout)
        self.assertTrue(s['debug'])
        self.assertEqual(s['hosts'], ['localhost', '127.0.0.1'])
        self.assertFalse(s['all'])
        self.assertTrue(all('localhost' in o or '127.0.0.1' in o for o in s['cors']))

    def test_prod_env_lists_and_https_toggle(self):
        r = load(DJANGO_SECRET_KEY='x' * 50, DJANGO_ALLOWED_HOSTS='a.example.com, b.example.com',
                 DJANGO_CORS_ALLOWED_ORIGINS='https://a.example.com', DJANGO_BEHIND_HTTPS_PROXY='True')
        self.assertEqual(r.returncode, 0, r.stderr)
        s = json.loads(r.stdout)
        self.assertEqual((s['debug'], s['hosts'], s['cors']),
                         (False, ['a.example.com', 'b.example.com'], ['https://a.example.com']))
        self.assertEqual((s['proxy'], s['secure']), (['HTTP_X_FORWARDED_PROTO', 'https'], True))

    def test_https_toggle_off_by_default(self):
        s = json.loads(load(DJANGO_SECRET_KEY='x' * 50).stdout)
        self.assertEqual((s['proxy'], s['secure']), (None, False))
