import json
from unittest import mock

from django.test import TestCase

from integrations import github_client as gh
from integrations.models import SeenPullRequest, WatchedRepo
from integrations.pr_sync import sync_review_requests
from tasks.models import Task
from tasks.serializers import serialize_task


def pr(n, draft=False, title='Fix bug'):
    return {'number': n, 'title': title, 'html_url': f'https://github.com/o/r/pull/{n}',
            'repo': 'o/r', 'author': 'alice', 'created_at': 'x', 'updated_at': 'y', 'draft': draft}


SEARCH = 'integrations.github_client.search_review_requested_prs'
LOGIN = 'integrations.github_client.get_authenticated_login'


class SyncTests(TestCase):
    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r', github_login='me')

    @mock.patch(SEARCH)
    def test_creates_task_fields_and_is_idempotent(self, search):
        search.return_value = [pr(1), pr(2, draft=True)]
        self.assertEqual(sync_review_requests(), {'created': 2, 'skipped': 0, 'errors': []})
        search.assert_called_with('me', 'o', 'r')
        t = Task.objects.get(pk='pr-o-r-1')
        self.assertEqual((t.title, t.creator, t.category, t.status, t.source_url),
                         ('[PR] #1 Fix bug', 'alice', 'Review', 'todo', 'https://github.com/o/r/pull/1'))
        self.assertIn('https://github.com/o/r/pull/1', t.description)
        self.assertIn('Auto-created from GitHub review request', t.description)
        self.assertEqual(Task.objects.get(pk='pr-o-r-2').title, '[PR] #2 Fix bug (draft)')
        self.repo.refresh_from_db()
        self.assertIsNotNone(self.repo.last_synced_at)
        self.assertEqual(sync_review_requests(), {'created': 0, 'skipped': 2, 'errors': []})
        self.assertEqual(Task.objects.count(), 2)

    @mock.patch(SEARCH)
    def test_deleted_task_not_recreated(self, search):
        search.return_value = [pr(1)]
        sync_review_requests()
        Task.objects.all().delete()
        self.assertEqual(sync_review_requests()['created'], 0)
        self.assertEqual(Task.objects.count(), 0)
        self.assertEqual(SeenPullRequest.objects.count(), 1)

    @mock.patch(SEARCH)
    def test_error_isolation(self, search):
        WatchedRepo.objects.create(url='https://github.com/o/r2', owner='o', name='r2', github_login='me')

        def side(login, owner, name):
            if name == 'r':
                raise gh.GitHubError(500, 'boom')
            return [{**pr(7), 'repo': f'{owner}/{name}'}]  # 실제 검색은 해당 레포 PR만 돌려준다
        search.side_effect = side
        res = sync_review_requests()
        self.assertEqual(res['created'], 1)
        self.assertEqual(len(res['errors']), 1)
        self.assertIn('boom', res['errors'][0])
        self.repo.refresh_from_db()
        self.assertIsNone(self.repo.last_synced_at)

    @mock.patch(SEARCH, return_value=[])
    @mock.patch(LOGIN)
    def test_login_resolved_via_token_and_missing_token_error(self, login, search):
        self.repo.github_login = ''
        self.repo.save()
        login.return_value = 'bob'
        sync_review_requests()
        search.assert_called_with('bob', 'o', 'r')
        login.side_effect = gh.GitHubError(401, 'Requires authentication')
        res = sync_review_requests()
        self.assertEqual(res['created'], 0)
        self.assertIn('GITHUB_TOKEN', res['errors'][0])

    @mock.patch('integrations.github_client.requests.get')
    def test_via_requests_mock(self, get):
        get.return_value = mock.Mock(status_code=200, json=lambda: {'items': [{
            'number': 5, 'title': 'T', 'html_url': 'https://github.com/o/r/pull/5',
            'repository_url': 'https://api.github.com/repos/o/r', 'user': {'login': 'zed'},
            'created_at': 'a', 'updated_at': 'b', 'draft': False}]})
        self.assertEqual(sync_review_requests()['created'], 1)
        self.assertEqual(Task.objects.get(pk='pr-o-r-5').creator, 'zed')


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

    @mock.patch(SEARCH, return_value=[pr(3)])
    def test_sync_endpoint(self, search):
        self.post({'url': 'https://github.com/o/r', 'githubLogin': 'me'})
        r = self.client.post('/api/v1/integrations/sync-prs/')
        self.assertEqual((r.status_code, r.json()), (200, {'created': 1, 'skipped': 0, 'errors': []}))
        tasks = self.client.get('/api/v1/tasks/').json()
        self.assertEqual(tasks[0]['sourceUrl'], 'https://github.com/o/r/pull/3')

    @mock.patch(SEARCH, side_effect=gh.GitHubError(500, 'down'))
    def test_sync_all_fail_is_200(self, _):
        self.post({'url': 'https://github.com/o/r', 'githubLogin': 'me'})
        r = self.client.post('/api/v1/integrations/sync-prs/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['created'], 0)
        self.assertEqual(len(r.json()['errors']), 1)

    def test_sync_no_repos(self):
        self.assertEqual(self.client.post('/api/v1/integrations/sync-prs/').json(),
                         {'created': 0, 'skipped': 0, 'errors': []})


class TaskSourceUrlTests(TestCase):
    def test_serialization(self):
        self.assertIsNone(serialize_task(Task.objects.create(id='a', title='a'))['sourceUrl'])
        t = Task.objects.create(id='b', title='b', source_url='https://x/y')
        self.assertEqual(serialize_task(t)['sourceUrl'], 'https://x/y')


class SearchInjectionTests(TestCase):
    """githubLogin 은 검색 쿼리에 들어가므로 `repo:` 같은 한정자 주입을 막아야 한다."""
    EVIL = 'x repo:victim/private'

    def test_validate_login(self):
        for ok in ('me', 'Lyle-Kim', 'a1', 'a' * 39):
            self.assertEqual(gh.validate_login(ok), ok)
        for bad in ('', None, 'x y', self.EVIL, '-lead', 'a' * 40, 'a:b', 'a/b'):
            with self.assertRaises(ValueError):
                gh.validate_login(bad)

    @mock.patch('integrations.github_client.requests.get')
    def test_client_never_sends_injected_query(self, get):
        with self.assertRaises(ValueError):
            gh.search_review_requested_prs(self.EVIL, 'o', 'r')
        get.assert_not_called()

    def test_endpoint_rejects_bad_login(self):
        r = self.client.post('/api/v1/integrations/watched-repos/',
                             json.dumps({'url': 'https://github.com/o/r', 'githubLogin': self.EVIL}),
                             content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(WatchedRepo.objects.count(), 0)

    @mock.patch(SEARCH)
    def test_sync_drops_prs_from_other_repos(self, search):
        WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r', github_login='me')
        foreign = {**pr(9, title='secret'), 'repo': 'victim/private'}
        search.return_value = [pr(1), foreign, {**pr(2), 'repo': 'O/R'}]  # 대소문자는 허용
        result = sync_review_requests()
        self.assertEqual(result['created'], 2)
        self.assertFalse(Task.objects.filter(title__contains='secret').exists())

    @mock.patch(SEARCH)
    def test_sync_reports_stored_bad_login_without_crashing(self, search):
        WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r', github_login=self.EVIL)
        search.side_effect = lambda login, *a: gh.validate_login(login)  # 실제 클라이언트처럼 ValueError
        result = sync_review_requests()
        self.assertEqual(result['created'], 0)
        self.assertEqual(len(result['errors']), 1)
