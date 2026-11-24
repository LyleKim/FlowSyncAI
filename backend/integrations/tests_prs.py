import json
from unittest import mock

from django.test import TestCase

from integrations import github_client as gh
from integrations.models import SeenPullRequest, WatchedRepo
from tasks.models import Task
from tasks.serializers import serialize_task


def pr(n, draft=False, title='Fix bug'):
    return {'number': n, 'title': title, 'html_url': f'https://github.com/o/r/pull/{n}',
            'repo': 'o/r', 'author': 'alice', 'created_at': 'x', 'updated_at': 'y', 'draft': draft}


class EndpointTests(TestCase):
    URL = '/api/v1/integrations/watched-repos/'

    def post(self, body, **kw):
        return self.client.post(self.URL, json.dumps(body), content_type='application/json', **kw)

    def test_crud(self):
        r = self.post({'url': 'https://github.com/o/r.git', 'githubLogin': 'me'})
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertEqual({k: data[k] for k in ('url', 'owner', 'name', 'githubLogin', 'lastSyncedAt')},
                         {'url': 'https://github.com/o/r', 'owner': 'o', 'name': 'r',
                          'githubLogin': 'me', 'lastSyncedAt': None})
        self.assertIn('createdAt', data)
        self.assertEqual(len(self.client.get(self.URL).json()), 1)
        self.assertEqual(self.post({'url': 'https://github.com/o/r'}).status_code, 409)
        self.assertEqual(self.client.delete(f"{self.URL}{data['id']}/").status_code, 204)
        self.assertEqual(self.client.delete(f"{self.URL}{data['id']}/").status_code, 404)
        self.assertEqual(self.client.get(self.URL).json(), [])

    def test_validation(self):
        self.assertEqual(self.post({'url': 'https://example.com/x'}).status_code, 400)
        self.assertEqual(self.post({}).status_code, 400)
        r = self.client.post(self.URL, 'nope', content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_idempotency_replay(self):
        a = self.post({'url': 'https://github.com/o/r'}, HTTP_IDEMPOTENCY_KEY='k1')
        b = self.post({'url': 'https://github.com/o/r'}, HTTP_IDEMPOTENCY_KEY='k1')
        self.assertEqual((a.status_code, b.status_code), (201, 201))
        self.assertEqual(a.json(), b.json())
        self.assertEqual(WatchedRepo.objects.count(), 1)


class TaskSourceUrlTests(TestCase):
    def test_serialization(self):
        self.assertIsNone(serialize_task(Task.objects.create(id='a', title='a'))['sourceUrl'])
        t = Task.objects.create(id='b', title='b', source_url='https://x/y')
        self.assertEqual(serialize_task(t)['sourceUrl'], 'https://x/y')
