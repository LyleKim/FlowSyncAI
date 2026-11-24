import json
from datetime import datetime, timedelta, timezone as tz
from unittest import mock

from django.test import TestCase

from integrations import github_client as gh
from integrations.models import PullRequest, WatchedRepo
from integrations.pr_sync import sync_repos, sync_review_requests
from tasks.models import Task

FETCH = 'integrations.pr_sync.github_client.fetch_repo_pull_requests'
T0 = datetime(2026, 11, 24, 5, 0, tzinfo=tz.utc)
KEYS = {'created', 'skipped', 'errors', 'throttled', 'repos'}


def prd(n, state='open'):
    return {'number': n, 'title': f't{n}', 'url': f'https://github.com/o/r/pull/{n}', 'author': 'a',
            'is_draft': False, 'state': state, 'created_at': '2026-11-20T00:00:00Z',
            'updated_at': '2026-11-21T00:00:00Z', 'review_requests': [], 'latest_reviews': []}


def ok(*nums, truncated=False):
    return {'prs': [prd(n) for n in nums], 'truncated': truncated}


class SyncTests(TestCase):
    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r')

    @mock.patch(FETCH, return_value=ok(1))
    def test_success_records_status_and_saves(self, _):
        out = sync_repos(now=T0)
        self.assertEqual(set(out), KEYS)
        self.assertEqual((out['created'], out['skipped'], out['errors']), (1, 0, []))
        st = out['repos'][0]
        self.assertEqual(st['lastSuccessAt'], T0.isoformat())
        self.assertEqual(st['lastAttemptAt'], T0.isoformat())
        self.assertIsNone(st['lastError'])
        self.assertEqual(PullRequest.objects.count(), 1)

    @mock.patch(FETCH)
    def test_sync_mirrors_task_for_legacy_login(self, fetch):
        WatchedRepo.objects.filter(pk=self.repo.pk).update(github_login='Me')
        d = prd(1)
        d['review_requests'] = [{'kind': 'user', 'login': 'me', 'team_slug': '', 'requested_at': None}]
        fetch.return_value = {'prs': [d], 'truncated': False}
        sync_repos(now=T0)
        self.assertEqual(Task.objects.get(pk='pr-o-r-1').title, '[PR] #1 t1')

    @mock.patch(FETCH, return_value=ok(1))
    def test_second_call_within_30s_is_throttled(self, fetch):
        sync_repos(now=T0)
        out = sync_repos(now=T0 + timedelta(seconds=10))
        fetch.assert_called_once()
        self.assertEqual(out['throttled'], [self.repo.id])
        self.assertEqual(out['repos'][0]['lastAttemptAt'], T0.isoformat())
        sync_repos(now=T0 + timedelta(seconds=31))
        self.assertEqual(fetch.call_count, 2)

    @mock.patch(FETCH)
    def test_failure_keeps_last_success_and_data(self, fetch):
        fetch.return_value = ok(1)
        sync_repos(now=T0)
        R = T0 + timedelta(hours=1)
        fetch.side_effect = gh.GitHubError(403, 'x', kind='rate_limit', reset_at=R)
        out = sync_repos(now=T0 + timedelta(minutes=1))
        st = out['repos'][0]
        self.assertEqual(st['lastSuccessAt'], T0.isoformat())
        self.assertEqual(st['lastError'], {'kind': 'rate_limit', 'message': 'x', 'resetAt': R.isoformat()})
        self.assertEqual(PullRequest.objects.count(), 1)
        self.assertEqual(out['errors'], ['o/r: x'])

    @mock.patch(FETCH)
    def test_one_repo_failure_does_not_block_other(self, fetch):
        WatchedRepo.objects.create(url='https://github.com/o/b', owner='o', name='b')
        fetch.side_effect = lambda owner, name, **kw: (
            (_ for _ in ()).throw(gh.GitHubError(500, 'down', kind='upstream')) if name == 'r' else ok(7))
        out = sync_repos(now=T0)
        self.assertEqual(len(out['errors']), 1)
        self.assertEqual(out['created'], 1)
        by = {r['repo']: r for r in out['repos']}
        self.assertIsNone(by['o/r']['lastSuccessAt'])
        self.assertEqual(by['o/b']['lastSuccessAt'], T0.isoformat())

    @mock.patch(FETCH)
    def test_unexpected_exception_is_recorded_not_raised(self, fetch):
        fetch.side_effect = RuntimeError('boom')
        out = sync_repos(now=T0)
        self.assertEqual(out['repos'][0]['lastError']['kind'], 'unknown')
        self.assertEqual(out['errors'], ['o/r: boom'])

    @mock.patch(FETCH)
    def test_success_after_failure_clears_error(self, fetch):
        fetch.side_effect = gh.GitHubError(500, 'down', kind='upstream')
        sync_repos(now=T0)
        fetch.side_effect = None
        fetch.return_value = ok(1)
        out = sync_repos(now=T0 + timedelta(minutes=1))
        self.assertIsNone(out['repos'][0]['lastError'])

    @mock.patch(FETCH, return_value=ok(1, truncated=True))
    def test_truncated_flag_stored(self, _):
        out = sync_repos(now=T0)
        self.assertTrue(out['repos'][0]['truncated'])
        self.repo.refresh_from_db()
        self.assertTrue(self.repo.truncated)

    @mock.patch(FETCH, return_value=ok(1))
    def test_repo_id_filter(self, fetch):
        other = WatchedRepo.objects.create(url='https://github.com/o/b', owner='o', name='b')
        out = sync_repos(other.id, now=T0)
        self.assertEqual([r['repoId'] for r in out['repos']], [other.id])
        fetch.assert_called_once()

    @mock.patch(FETCH)
    def test_tracked_open_passed_to_client(self, fetch):
        fetch.return_value = ok(1, 2)
        sync_repos(now=T0)
        fetch.return_value = ok(1)
        sync_repos(now=T0 + timedelta(minutes=1))
        self.assertEqual(sorted(fetch.call_args.kwargs['tracked_open']), [1, 2])

    @mock.patch(FETCH, return_value=ok())
    def test_legacy_wrapper(self, _):
        self.assertEqual(set(sync_review_requests()), KEYS)


class EndpointTests(TestCase):
    URL = '/api/v1/integrations/sync-prs/'

    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r')

    @mock.patch(FETCH, return_value=ok(1))
    def test_endpoint_post_returns_contract_shape(self, fetch):
        r = self.client.post(self.URL, content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), KEYS)
        self.assertEqual(set(r.json()['repos'][0]),
                         {'repoId', 'repo', 'lastAttemptAt', 'lastSuccessAt', 'lastError', 'truncated'})
        r = self.client.post(self.URL, json.dumps({'repoId': self.repo.id}), content_type='application/json')
        self.assertEqual(r.json()['throttled'], [self.repo.id])
        self.assertEqual(self.client.post(self.URL, '{bad', content_type='application/json').status_code, 400)
        self.assertEqual(self.client.post(self.URL, '[]', content_type='application/json').status_code, 400)
        self.assertEqual(self.client.post(self.URL, '{"repoId":"x"}', content_type='application/json').status_code, 400)

    def test_no_repos(self):
        WatchedRepo.objects.all().delete()
        r = self.client.post(self.URL, content_type='application/json')
        self.assertEqual(r.json(), {'created': 0, 'skipped': 0, 'errors': [], 'throttled': [], 'repos': []})
