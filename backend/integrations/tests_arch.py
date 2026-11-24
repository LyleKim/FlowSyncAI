from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase

from . import github_client
from .activity import compute_activity
from .architecture import Locator, group_paths

OWN_REPO = [
    'README.md', 'CLAUDE.md', '.gitignore', '.env.example', 'docker-compose.yml', 'package.json',
    'package-lock.json', '.github/workflows/ci.yml', 'docs/DECISIONS.md', 'scripts/seed.sh',
    'backend/Dockerfile', 'backend/manage.py', 'backend/requirements.txt',
    'backend/tasks/models.py', 'backend/tasks/views.py', 'backend/tasks/tests.py',
    'backend/tasks/migrations/0001_initial.py', 'backend/tasks/migrations/0002_x.py',
    'backend/tasks/__pycache__/models.cpython-310.pyc',
    'backend/reviews/models.py', 'backend/reviews/views.py',
    'backend/ai_services/services.py', 'backend/ai_services/views.py',
    'backend/api/http.py', 'backend/api/decorators.py',
    'backend/config/settings.py', 'backend/config/urls.py',
    'backend/activities/models.py', 'backend/activities/forms.py',
    'backend/integrations/github_client.py', 'backend/integrations/views.py',
    'frontend/src/App.tsx', 'frontend/src/main.tsx',
    'frontend/src/components/common/TaskModal.tsx', 'frontend/src/components/common/Button.tsx',
    'frontend/src/components/dashboard/TaskBoard.tsx', 'frontend/src/components/dashboard/TaskList.tsx',
    'frontend/src/components/layout/Sidebar.tsx', 'frontend/src/components/layout/Header.tsx',
    'frontend/src/services/apiClient.ts', 'frontend/src/services/taskSync.ts',
    'frontend/src/logo.png', 'frontend/node_modules/x/index.js',
    'frontend/src/components/dashboard/TaskBoard.test.tsx',
]


def by_id(groups):
    return {g.id: g for g in groups}


class GroupingTests(SimpleTestCase):
    def test_own_repo_layout(self):
        g = by_id(group_paths(OWN_REPO))
        for gid in ['backend-tasks', 'backend-reviews', 'backend-ai-services', 'backend-api', 'backend-config',
                    'backend-activities', 'backend-integrations', 'frontend-src-components-common',
                    'frontend-src-components-dashboard', 'frontend-src-components-layout',
                    'frontend-src-services', 'docs', 'infra-config']:
            self.assertIn(gid, g)
        self.assertEqual(g['backend-tasks'].kind, 'backend')
        self.assertEqual(g['frontend-src-services'].kind, 'frontend')
        self.assertEqual(g['docs'].kind, 'docs')
        self.assertEqual(g['infra-config'].kind, 'infra')
        self.assertEqual(g['frontend-src-components-dashboard'].name, 'Frontend / Components / Dashboard')
        # sibling test file stays with the code it sits beside
        self.assertIn('frontend/src/components/dashboard/TaskBoard.test.tsx',
                      g['frontend-src-components-dashboard'].files)
        # scripts, CI, Dockerfile, root configs -> infra; README -> docs
        for p in ['scripts/seed.sh', '.github/workflows/ci.yml', 'backend/Dockerfile', 'package.json']:
            self.assertIn(p, g['infra-config'].files)
        self.assertIn('README.md', g['docs'].files)

    def test_noise_filtered_migrations_counted_not_sampled(self):
        g = by_id(group_paths(OWN_REPO))
        allfiles = {p for x in g.values() for p in x.files}
        for p in ['package-lock.json', 'frontend/src/logo.png', 'frontend/node_modules/x/index.js',
                  'backend/tasks/__pycache__/models.cpython-310.pyc']:
            self.assertNotIn(p, allfiles)
        t = g['backend-tasks']
        self.assertEqual(t.file_count, 5)  # models, views, tests, 2 migrations
        self.assertFalse(any('migrations' in s for s in t.sample_paths))
        self.assertLessEqual(len(t.sample_paths), 5)

    def test_single_package_repo(self):
        paths = ['README.md', 'pyproject.toml', 'mylib/__init__.py', 'mylib/core.py', 'mylib/utils.py',
                 'tests/test_core.py', 'tests/test_mylib_api.py', 'test_utils.py', 'main.py', 'run.py']
        g = by_id(group_paths(paths))
        self.assertEqual(g['mylib'].file_count, 4)  # + the test whose name mentions the package
        self.assertIn('tests/test_mylib_api.py', g['mylib'].files)
        self.assertEqual(sorted(g['tests'].files), ['test_utils.py', 'tests/test_core.py'])
        self.assertEqual(sorted(g['root'].files), ['main.py', 'run.py'])
        self.assertEqual(g['infra-config'].files, ['pyproject.toml'])

    def test_tiny_groups_merge_into_parent_or_misc(self):
        paths = ['frontend/src/App.tsx', 'frontend/src/main.tsx',
                 'frontend/src/components/ui/a.tsx', 'frontend/src/components/ui/b.tsx',
                 'frontend/src/components/tiny/one.tsx',   # tiny -> nearest existing parent: frontend/src
                 'backend/b/only.py', 'tool/one.py']       # tiny, no parent group -> Misc
        g = by_id(group_paths(paths))
        self.assertEqual(g['frontend-src'].file_count, 3)
        self.assertIn('frontend/src/components/tiny/one.tsx', g['frontend-src'].files)
        self.assertEqual(g['frontend-src-components-ui'].file_count, 2)
        self.assertEqual(sorted(g['misc'].files), ['backend/b/only.py', 'tool/one.py'])
        self.assertNotIn('tool', g)

    def test_deterministic(self):
        a = [x.to_dict() for x in group_paths(OWN_REPO)]
        b = [x.to_dict() for x in group_paths(list(reversed(OWN_REPO)))]
        self.assertEqual(a, b)

    def test_locator_handles_deleted_files(self):
        loc = Locator(group_paths(OWN_REPO))
        self.assertEqual(loc('backend/tasks/old_removed.py'), 'backend-tasks')
        self.assertEqual(loc('backend/tasks/migrations/0009_new.py'), 'backend-tasks')
        self.assertEqual(loc('docs/new.md'), 'docs')
        self.assertIsNone(loc('frontend/dist/app.js'))


def iso(dt):
    return dt.isoformat().replace('+00:00', 'Z')


def commit(sha, days_ago, msg='work', author='ann'):
    return {'sha': sha * 40 if len(sha) == 1 else sha.ljust(40, '0'), 'message': msg, 'author': author,
            'date': iso(datetime.now(timezone.utc) - timedelta(days=days_ago, hours=1))}


TREE = OWN_REPO


class ActivityTests(SimpleTestCase):
    def run_activity(self, commits, files, days=30):
        with patch.object(github_client, 'list_repo_tree', return_value=TREE), \
             patch.object(github_client, 'list_commits', return_value=commits) as lc, \
             patch.object(github_client, 'get_commit_files', side_effect=lambda o, n, sha: files[sha[0]]):
            self.lc = lc
            return compute_activity('o', 'r', days)

    def groups(self, res):
        return {g['id']: g for g in res['groups']}

    def test_buckets_merge_skip_authors_recent(self):
        commits = [commit('a', 1, author='ann'), commit('b', 2, msg='Merge pull request #1', author='bob'),
                   commit('c', 20, author='bob'), commit('d', 21, author='ann')]
        files = {'a': ['backend/tasks/models.py', 'backend/tasks/views.py'], 'b': ['backend/api/http.py'],
                 'c': ['backend/tasks/views.py', 'docs/x.md'], 'd': ['backend/tasks/models.py']}
        res = self.run_activity(commits, files)
        self.assertEqual(res['analyzedCommits'], 3)  # merge skipped
        self.assertFalse(res['truncated'])
        self.assertIn('since', self.lc.call_args.kwargs)
        t = self.groups(res)['backend-tasks']
        self.assertEqual(t['totalCommits'], 3)
        self.assertEqual(sum(w['commits'] for w in t['weekly']), 3)
        self.assertEqual(sum(w['filesChanged'] for w in t['weekly']), 4)
        self.assertEqual(t['authors'], ['ann', 'bob'])  # ann 2, bob 1
        self.assertEqual([c['sha7'] for c in t['recentCommits']], ['aaaaaaa', 'ccccccc', 'ddddddd'])
        self.assertTrue(t['lastChangeAt'].endswith('Z'))
        # weekly buckets are contiguous 7-day-spaced Mondays
        ws = [datetime.fromisoformat(w['weekStart']).date() for w in t['weekly']]
        self.assertTrue(all(w.weekday() == 0 for w in ws))
        self.assertTrue(all((b - a).days == 7 for a, b in zip(ws, ws[1:])))
        self.assertEqual(self.groups(res)['backend-api']['totalCommits'], 0)  # merge commit ignored
        self.assertEqual(self.groups(res)['backend-api']['trend'], 'quiet')

    def test_couplings(self):
        commits = [commit('a', 1), commit('b', 2), commit('c', 3)]
        files = {'a': ['backend/tasks/models.py', 'backend/reviews/views.py'],
                 'b': ['backend/tasks/views.py', 'backend/reviews/models.py', 'docs/x.md'],
                 'c': ['backend/api/http.py']}
        res = self.run_activity(commits, files)
        top = res['couplings'][0]
        self.assertEqual(top, {'a': 'backend-reviews', 'b': 'backend-tasks', 'count': 2})
        self.assertIn({'a': 'backend-tasks', 'b': 'docs', 'count': 1}, res['couplings'])
        self.assertEqual(len(res['couplings']), 3)  # api alone -> no pair

    def test_cap_at_60_commits(self):
        commits = [commit('a', i / 10, ) for i in range(1, 71)]
        commits = [dict(c, sha='%040d' % i) for i, c in enumerate(commits)]
        res = self.run_activity(commits, {str(i): ['backend/api/http.py'] for i in range(10)})
        self.assertTrue(res['truncated'])
        self.assertEqual(res['analyzedCommits'], 60)

    def test_trend_labels(self):
        # window 30d: last half = last 15 days
        commits = ([commit('a', 2), commit('a', 3), commit('a', 4)]            # tasks: 3 recent, 0 old -> rising
                   + [commit('b', 20), commit('b', 25), commit('b', 5)]       # reviews: 1 recent, 2 old -> steady
                   + [commit('c', 22), commit('c', 27)]                       # api: only old -> quiet
                   + [commit('d', 1)])                                        # config: single commit -> quiet
        files = {'a': ['backend/tasks/models.py'], 'b': ['backend/reviews/models.py'],
                 'c': ['backend/api/http.py'], 'd': ['backend/config/urls.py']}
        commits = [dict(c, sha=c['sha'][0] + str(i).ljust(39, '0')) for i, c in enumerate(commits)]
        g = self.groups(self.run_activity(commits, files))
        self.assertEqual(g['backend-tasks']['trend'], 'rising')
        self.assertEqual(g['backend-reviews']['trend'], 'steady')
        self.assertEqual(g['backend-api']['trend'], 'quiet')
        self.assertEqual(g['backend-config']['trend'], 'quiet')


class ViewTests(TestCase):
    URL = '/api/v1/integrations/architecture/'

    def setUp(self):
        cache.clear()
        p = [patch.object(github_client, 'list_repo_tree', return_value=TREE),
             patch.object(github_client, 'list_commits', return_value=[commit('a', 1)]),
             patch.object(github_client, 'get_commit_files', return_value=['backend/tasks/models.py'])]
        self.mocks = [x.start() for x in p]
        self.addCleanup(patch.stopall)

    def get(self, **q):
        q.setdefault('url', 'https://github.com/acme/widgets')
        return self.client.get(self.URL, q)

    def test_contract(self):
        r = self.get()
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d['repo'], {'owner': 'acme', 'name': 'widgets', 'url': 'https://github.com/acme/widgets'})
        self.assertEqual((d['days'], d['truncated'], d['analyzedCommits']), (30, False, 1))
        self.assertIn('generatedAt', d)
        self.assertEqual(d['couplings'], [])
        g = {x['id']: x for x in d['groups']}['backend-tasks']
        for k in ['id', 'name', 'kind', 'fileCount', 'samplePaths', 'weekly', 'totalCommits', 'lastChangeAt',
                  'authors', 'recentCommits', 'trend']:
            self.assertIn(k, g)

    def test_validation(self):
        self.assertEqual(self.client.get(self.URL).status_code, 400)
        self.assertEqual(self.get(url='https://example.com/a/b').status_code, 400)
        self.assertEqual(self.get(days='abc').status_code, 400)
        self.assertIn('error', self.get(url='nope').json())

    def test_days_clamped(self):
        self.assertEqual(self.get(days='1').json()['days'], 7)
        self.assertEqual(self.get(days='999').json()['days'], 180)

    def test_error_mapping(self):
        self.mocks[0].side_effect = github_client.GitHubError(404, 'Not Found')
        self.assertEqual(self.get().status_code, 404)
        self.mocks[0].side_effect = github_client.GitHubError(403, 'rate limit exceeded')
        r = self.get()
        self.assertEqual(r.status_code, 502)
        self.assertIn('rate limit', r.json()['error'])

    def test_cache_and_refresh(self):
        r1 = self.get()
        self.get()
        self.assertEqual(self.mocks[0].call_count, 1)  # second call served from cache
        self.get(days=60)
        self.assertEqual(self.mocks[0].call_count, 2)  # different days -> different key
        self.get(refresh='1')
        self.assertEqual(self.mocks[0].call_count, 3)
        # ETag round trip: unchanged cached payload -> 304
        r = self.client.get(self.URL, {'url': 'https://github.com/acme/widgets'},
                            HTTP_IF_NONE_MATCH=self.get()['ETag'])
        self.assertEqual(r.status_code, 304)
        self.assertEqual(r1.status_code, 200)
