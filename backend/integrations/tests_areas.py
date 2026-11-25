import json
from datetime import datetime, timedelta, timezone as tz
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase

from . import areas, github_client
from .architecture import group_paths
from .models import AreaAlias, PullRequest, PullRequestReviewer, WatchedRepo
from .tests_arch import TREE, commit

NOW = datetime.now(tz.utc).replace(microsecond=0)
A, B = 'backend-reviews', 'backend-tasks'  # A sorts before B
A_FILES = ['backend/reviews/models.py', 'backend/reviews/views.py']
B_FILES = ['backend/tasks/models.py', 'backend/tasks/views.py']
GROUPS = group_paths(TREE)


def mk(repo, n, files, state='open', draft=False, reviewers=((('minji-park'), 1),), truncated=False):
    pr = PullRequest.objects.create(
        repo=repo, number=n, title=f't{n}', url=f'https://github.com/acme/api/pull/{n}', author='jun-ho',
        is_draft=draft, state=state, pr_created_at=NOW - timedelta(days=9), pr_updated_at=NOW,
        files=json.dumps(files), files_truncated=truncated, additions=5, deletions=2, changed_files=len(files))
    for who, days in reviewers:
        PullRequestReviewer.objects.create(pr=pr, login=who, login_key=who.lower(), is_active=days > 0,
                                           requested_at=NOW - timedelta(days=abs(days)))
    return pr


class MapTests(TestCase):
    def test_map_pr_files_primary_and_ties(self):
        m = areas.map_pr_files(GROUPS, A_FILES + ['backend/reviews/x.py'] + B_FILES + ['backend/tasks/y.py'])
        self.assertEqual(m['primaryAreaId'], A)  # 3 vs 3 -> id order
        self.assertEqual([t['areaId'] for t in m['touched']], [A, B])
        m = areas.map_pr_files(GROUPS, A_FILES + ['frontend/node_modules/x/i.js'])
        self.assertEqual((m['unmapped'], m['touched']), (1, [{'areaId': A, 'fileCount': 2}]))
        self.assertEqual(areas.map_pr_files(GROUPS, []),
                         {'primaryAreaId': None, 'touched': [], 'unmapped': 0})

    def test_review_waiting_counts_primary_only_and_excludes_draft_and_closed(self):
        repo = WatchedRepo.objects.create(url='https://github.com/acme/api', owner='acme', name='api')
        mk(repo, 1, A_FILES + B_FILES[:1], reviewers=[('a', 3), ('b', 5)])
        mk(repo, 2, A_FILES, reviewers=[('a', 2)])
        mk(repo, 3, B_FILES, draft=True)
        mk(repo, 4, B_FILES, state='merged')
        mk(repo, 5, B_FILES, reviewers=[('a', -4)])  # inactive reviewer only
        mk(repo, 6, ['unknown/node_modules/x.js'])
        w = areas.review_waiting_by_area(repo, GROUPS, NOW)
        self.assertEqual(set(w), {A})
        self.assertEqual(w[A], {'prCount': 2, 'oldestRequestedAt': areas.iso_z(NOW - timedelta(days=5))})


class ViewBase(TestCase):
    def setUp(self):
        cache.clear()
        self.repo = WatchedRepo.objects.create(url='https://github.com/acme/api', owner='acme', name='api')
        self.mocks = [patch.object(github_client, 'list_repo_tree', return_value=TREE).start(),
                      patch.object(github_client, 'list_commits', return_value=[commit('a', 1)]).start(),
                      patch.object(github_client, 'get_commit_files',
                                   return_value=['backend/tasks/models.py']).start()]
        self.addCleanup(patch.stopall)

    def list(self, **q):
        return self.client.get(f'/api/v1/integrations/watched-repos/{self.repo.id}/areas/', q)

    def detail(self, area, **q):
        return self.client.get(f'/api/v1/integrations/watched-repos/{self.repo.id}/areas/{area}/', q)


class ListTests(ViewBase):
    def test_area_list_shape(self):
        AreaAlias.objects.create(repo=self.repo, path_prefix='backend/tasks', display_name='할 일')
        d = self.list().json()
        self.assertEqual(set(d), {'repoId', 'generatedAt', 'days', 'truncated', 'analyzedCommits', 'areas',
                                  'couplings'})
        a = {x['id']: x for x in d['areas']}
        self.assertEqual(set(a[B]), {'id', 'name', 'displayName', 'alias', 'pathPrefix', 'kind', 'fileCount',
                                     'samplePaths', 'weekly', 'totalCommits', 'lastChangeAt', 'authors',
                                     'trend', 'reviewWaiting'})
        self.assertEqual((a[B]['displayName'], a[B]['alias']['displayName'], a[B]['pathPrefix']),
                         ('할 일', '할 일', 'backend/tasks'))
        self.assertEqual((a[A]['displayName'], a[A]['alias']), (a[A]['name'], None))
        self.assertEqual(a[A]['reviewWaiting'], {'prCount': 0, 'oldestRequestedAt': None})
        self.assertTrue(all(len(x['weekly']) in (5, 6) for x in d['areas']))  # every week, zeros included
        self.assertIn(0, [w['commits'] for w in a[A]['weekly']])
        self.assertEqual(a['docs']['pathPrefix'], '@docs')

    def test_area_list_errors(self):
        self.assertEqual(self.client.get('/api/v1/integrations/watched-repos/999/areas/').json()['code'],
                         'repo_not_found')
        self.assertEqual(self.list(days='abc').status_code, 400)
        self.mocks[0].side_effect = github_client.GitHubError(403, 'rate limit')
        r = self.list()
        self.assertEqual((r.status_code, r.json()['code']), (502, 'github_unavailable'))
        self.mocks[0].side_effect = None
        self.mocks[0].return_value = []
        cache.clear()
        r = self.list()
        self.assertEqual((r.status_code, r.json()['areas']), (200, []))

    def test_shared_cache_single_tree_fetch(self):
        self.list()
        self.client.get('/api/v1/integrations/architecture/', {'url': 'https://github.com/acme/api'})
        self.assertEqual(self.mocks[0].call_count, 1)


class ConditionalGetTests(ViewBase):
    def test_list_detail_304(self):
        for get in (self.list, lambda: self.detail(B)):
            r = get()
            etag = r['ETag']
            r2 = self.client.get(r.wsgi_request.path, HTTP_IF_NONE_MATCH=etag)
            self.assertEqual((r.status_code, r2.status_code), (200, 304))


class CacheDivergenceTests(ViewBase):
    def test_tree_cache_expiring_alone_does_not_500(self):
        self.assertEqual(self.list().status_code, 200)  # primes tree + activity caches
        cache.delete('tree:acme/api')
        github_client.list_repo_tree.return_value = ['docs/only.md', 'docs/two.md']  # tree changed
        self.assertEqual(self.list().status_code, 200)
        self.assertEqual(self.detail(B).status_code, 200)  # served from the paths activity was computed with
        self.assertEqual(self.detail('gone').status_code, 404)


class DetailTests(ViewBase):
    def test_area_detail_and_missing_area(self):
        d = self.detail(B).json()
        self.assertEqual(d['id'], B)
        self.assertEqual(d['recentCommits'][0]['sha7'], 'aaaaaaa')
        self.assertEqual((d['waitingPullRequests'], d['coupledWith']), ([], []))
        r = self.detail('nope')
        self.assertEqual((r.status_code, r.json()['code']), (404, 'area_not_found'))

    def test_detail_includes_pr_touching_non_primary_area(self):
        mk(self.repo, 7, [f'backend/tasks/f{i}.py' for i in range(4)] + A_FILES)
        # B is primary (4 files), A secondary (2 files)
        da, db = self.detail(A).json(), self.detail(B).json()
        pa, pb = da['waitingPullRequests'][0], db['waitingPullRequests'][0]
        self.assertEqual((pa['isPrimary'], pb['isPrimary']), (False, True))
        self.assertEqual((pa['primaryAreaId'], pb['primaryAreaId']), (B, B))
        self.assertEqual([(t['areaId'], t['fileCount']) for t in pa['touchedAreas']], [(B, 4), (A, 2)])
        self.assertEqual(pa['requestedReviewers'], ['minji-park'])
        lst = {x['id']: x for x in self.list().json()['areas']}
        self.assertEqual((lst[A]['reviewWaiting']['prCount'], lst[B]['reviewWaiting']['prCount']), (0, 1))

    def test_detail_waiting_prs_rules(self):
        mk(self.repo, 1, B_FILES, reviewers=[('a', 2)])
        mk(self.repo, 2, B_FILES, draft=True, reviewers=[('a', 6)])
        mk(self.repo, 3, B_FILES, reviewers=[('a', -3)])
        mk(self.repo, 4, B_FILES, state='merged')
        mk(self.repo, 5, B_FILES, state='closed')
        mk(self.repo, 6, [])
        mk(self.repo, 7, [f'backend/tasks/f{i}.py' for i in range(100)], truncated=True, reviewers=[('a', 4)])
        w = self.detail(B).json()['waitingPullRequests']
        self.assertEqual([p['number'] for p in w], [2, 7, 1])
        self.assertEqual((w[0]['isDraft'], w[1]['filesTruncated']), (True, True))
        for n in range(20, 70):
            mk(self.repo, n, B_FILES + A_FILES)
        with self.assertNumQueries(7):  # constant: repo, 2x aliases, 2x (PRs + reviewers prefetch)
            r = self.detail(B)
        self.assertEqual(len(r.json()['waitingPullRequests']), 53)


class QueueAreasTests(ViewBase):
    def test_queue_include_areas_fills_areas(self):
        mk(self.repo, 1, B_FILES + A_FILES[:1])
        url = '/api/v1/integrations/review-queue/'
        item = self.client.get(url, {'login': 'minji-park', 'include': 'areas'}).json()['items'][0]
        self.assertEqual(item['areas'], {'primaryAreaId': B, 'touched': [
            {'areaId': B, 'fileCount': 2}, {'areaId': A, 'fileCount': 1}], 'filesTruncated': False})
        self.assertIsNone(self.client.get(url, {'login': 'minji-park'}).json()['items'][0]['areas'])
        cache.clear()
        self.mocks[0].side_effect = github_client.GitHubError(502, 'down')
        r = self.client.get(url, {'login': 'minji-park', 'include': 'areas'})
        self.assertEqual((r.status_code, r.json()['items'][0]['areas']), (200, None))

    def test_groups_fetched_once_per_repo(self):
        for n in range(1, 6):
            mk(self.repo, n, B_FILES)
        self.client.get('/api/v1/integrations/review-queue/', {'login': 'minji-park', 'include': 'areas'})
        self.assertEqual(self.mocks[0].call_count, 1)
