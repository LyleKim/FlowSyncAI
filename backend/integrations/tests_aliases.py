import json

import requests
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from integrations import areas
from integrations.architecture import Group, group_paths
from integrations.github_client import GitHubError
from integrations.models import AreaAlias, WatchedRepo

PATHS = ['backend/payments/a.py', 'backend/payments/b.py', 'docs/x.md', 'docs/y.md']


class AliasTests(TestCase):
    def setUp(self):
        cache.clear()
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r')
        self.url = f'/api/v1/integrations/watched-repos/{self.repo.id}/area-aliases/'
        p = mock.patch('integrations.areas.get_groups', return_value=group_paths(PATHS))
        self.groups = p.start()
        self.addCleanup(p.stop)

    def post(self, body, **kw):
        return self.client.post(self.url, json.dumps(body), content_type='application/json', **kw)

    def patch(self, aid, body):
        return self.client.patch(f'{self.url}{aid}/', json.dumps(body), content_type='application/json')

    def mk(self, prefix='backend/payments', name='결제'):
        return self.post({'pathPrefix': prefix, 'displayName': name}).json()

    def test_path_prefix_dir_and_special(self):
        gs = {g.id: g for g in group_paths(PATHS)}
        self.assertEqual(areas.path_prefix(gs['backend-payments']), 'backend/payments')
        self.assertEqual(areas.path_prefix(gs['docs']), '@docs')

    def test_create_alias_201_connected(self):
        a = self.post({'pathPrefix': 'backend/payments', 'displayName': ' 결제 '}, HTTP_IDEMPOTENCY_KEY='k')
        b = self.post({'pathPrefix': 'backend/payments', 'displayName': ' 결제 '}, HTTP_IDEMPOTENCY_KEY='k')
        self.assertEqual((a.status_code, b.status_code), (201, 201))
        self.assertEqual(a.json(), b.json())
        self.assertEqual(a.json()['status'], 'connected')
        self.assertEqual(a.json()['displayName'], '결제')
        self.assertEqual(AreaAlias.objects.count(), 1)

    def test_create_for_missing_prefix_saved_as_disconnected(self):
        r = self.post({'pathPrefix': 'gone/dir', 'displayName': 'x'})
        self.assertEqual((r.status_code, r.json()['status']), (201, 'disconnected'))

    def test_duplicate_prefix_409_alias_exists_with_existing(self):
        first = self.mk()
        r = self.post({'pathPrefix': 'backend/payments', 'displayName': 'y'})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()['code'], 'alias_exists')
        self.assertEqual(r.json()['existing']['id'], first['id'])

    def test_invalid_name_400(self):
        for n in ('', '   ', 'x' * 81):
            r = self.post({'pathPrefix': 'a', 'displayName': n})
            self.assertEqual((r.status_code, r.json()['code']), (400, 'invalid_name'))

    def test_list_includes_disconnected_and_unknown_when_tree_unreadable(self):
        self.mk()
        self.mk('gone', 'g')
        self.assertEqual([a['status'] for a in self.client.get(self.url).json()], ['connected', 'disconnected'])
        self.groups.side_effect = GitHubError(502, 'boom')
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual({a['status'] for a in r.json()}, {'unknown'})
        self.assertEqual(self.post({'pathPrefix': 'n', 'displayName': 'n'}).status_code, 201)

    def test_patch_updates_name_and_bumps_updated_at(self):
        a = self.mk()
        r = self.patch(a['id'], {'displayName': '새 이름', 'expectedUpdatedAt': a['updatedAt']})
        self.assertEqual((r.status_code, r.json()['displayName']), (200, '새 이름'))
        self.assertGreaterEqual(r.json()['updatedAt'], a['updatedAt'])

    def test_patch_conflict_returns_current(self):
        a = self.mk()
        r = self.patch(a['id'], {'displayName': 'z', 'expectedUpdatedAt': '2000-01-01T00:00:00Z'})
        self.assertEqual((r.status_code, r.json()['code']), (409, 'conflict'))
        self.assertEqual(r.json()['current']['displayName'], '결제')
        self.assertEqual(self.patch(a['id'], {'displayName': 'z'}).status_code, 200)

    def test_delete_204_then_recreate_same_prefix_ok(self):
        a = self.mk()
        self.assertEqual(self.client.delete(f"{self.url}{a['id']}/").status_code, 204)
        self.assertEqual(self.post({'pathPrefix': 'backend/payments', 'displayName': 'n'}).status_code, 201)

    def test_unknown_or_deleted_repo_404_repo_not_found(self):
        r = self.client.get('/api/v1/integrations/watched-repos/9999/area-aliases/')
        self.assertEqual((r.status_code, r.json()['code']), (404, 'repo_not_found'))

    def test_path_prefix_normalized(self):
        r = self.post({'pathPrefix': ' /backend/payments/ ', 'displayName': 'n'})
        self.assertEqual((r.status_code, r.json()['pathPrefix']), (201, 'backend/payments'))
        self.assertEqual(self.post({'pathPrefix': ' @docs ', 'displayName': 'n'}).json()['pathPrefix'], '@docs')
        r = self.post({'pathPrefix': ' / ', 'displayName': 'n'})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'invalid_path_prefix'))

    def test_network_error_on_tree_read_keeps_endpoints_working(self):
        mock.patch.stopall()  # use the real get_groups -> github_client
        with mock.patch('integrations.github_client.requests.get', side_effect=requests.ConnectionError('x')):
            a = self.post({'pathPrefix': 'p', 'displayName': 'n'})
            self.assertEqual((a.status_code, a.json()['status']), (201, 'unknown'))
            self.assertEqual([x['status'] for x in self.client.get(self.url).json()], ['unknown'])
            r = self.patch(a.json()['id'], {'displayName': 'm'})
            self.assertEqual((r.status_code, r.json()['status']), (200, 'unknown'))

    def test_patch_with_unreadable_tree_200_unknown(self):
        a = self.mk()
        self.groups.side_effect = GitHubError(502, 'boom')
        r = self.patch(a['id'], {'displayName': 'q'})
        self.assertEqual((r.status_code, r.json()['status']), (200, 'unknown'))

    def test_invalid_path_prefix_400(self):
        for p in ('', '  ', 'x' * 301, None):
            r = self.post({'pathPrefix': p, 'displayName': 'n'})
            self.assertEqual((r.status_code, r.json()['code']), (400, 'invalid_path_prefix'))
