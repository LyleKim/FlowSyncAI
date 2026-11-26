import json
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from . import folders, github_client
from .architecture import group_paths
from .models import FolderDescription, WatchedRepo
from .tests_arch import TREE, commit
from .views_folders import DESCRIBE_INTERVAL

TREE_URL = '/api/v1/integrations/watched-repos/{}/tree/'
DESCRIBE_URL = '/api/v1/integrations/watched-repos/{}/describe/'
FOLDER_URL = '/api/v1/integrations/watched-repos/{}/tree/folders/'


def groq_reply(paths, text='이 폴더는 {p} 기능을 구현하는 것으로 보입니다.'):
    content = json.dumps({'descriptions': [{'path': p, 'text': text.format(p=p)} for p in paths]})
    return content


class TreeBuildTests(SimpleTestCase):
    def test_nodes_counts_area_ids_and_noise(self):
        paths = ['README.md', 'backend/tasks/models.py', 'backend/tasks/views.py', 'backend/tasks/sub/x.py',
                 'frontend/node_modules/a/i.js', 'frontend/src/App.tsx']
        t = folders.build_tree(paths, group_paths(paths), {}, 'api')
        root = t['root']
        self.assertEqual((root['path'], root['name'], root['fileCount']), ('', 'api', 5))
        self.assertEqual([c['path'] for c in root['children']], ['backend', 'frontend'])
        be = root['children'][0]
        self.assertEqual((be['fileCount'], be['areaId'], be['description']), (3, None, None))
        tasks = be['children'][0]
        self.assertEqual((tasks['path'], tasks['name'], tasks['fileCount'], tasks['areaId']),
                         ('backend/tasks', 'tasks', 3, 'backend-tasks'))
        fe = root['children'][1]
        self.assertEqual([c['path'] for c in fe['children']], ['frontend/src'])  # node_modules dropped
        self.assertFalse(t['truncated'])
        self.assertEqual(t['folderCount'], 5)

    def test_depth_and_node_limits_set_truncated(self):
        deep = ['/'.join(f'd{i}' for i in range(10)) + '/f.py']
        t = folders.build_tree(deep, [], {}, 'r')
        self.assertTrue(t['truncated'])
        self.assertEqual(t['folderCount'], folders.MAX_DEPTH)
        wide = [f'p{i:04d}/f.py' for i in range(folders.MAX_NODES + 5)] + ['p0003/g.py']
        t = folders.build_tree(wide, [], {}, 'r')
        self.assertEqual((t['truncated'], t['folderCount']), (True, folders.MAX_NODES))
        self.assertIn('p0003', [c['path'] for c in t['root']['children']])  # bigger folder kept first

    def test_get_file_text_decodes_contents_api(self):
        import base64
        with patch.object(github_client, '_get', return_value={'content': base64.b64encode('안녕'.encode()).decode()}) as g:
            self.assertEqual(github_client.get_file_text('o', 'r', 'README.md'), '안녕')
        self.assertEqual(g.call_args.args[0], '/repos/o/r/contents/README.md')

    def test_tree_hash_order_independent(self):
        self.assertEqual(folders.tree_hash(['a', 'b']), folders.tree_hash(['b', 'a']))
        self.assertNotEqual(folders.tree_hash(['a']), folders.tree_hash(['a', 'b']))

    def test_candidates_put_area_folders_first_and_cap(self):
        paths = TREE + [f'x{i}/a.py' for i in range(60)]
        cands, limited = folders.candidates(paths, group_paths(paths))
        self.assertTrue(limited)
        self.assertEqual(len(cands), folders.DESCRIBE_LIMIT)
        self.assertIn('backend/tasks', cands[:5])
        self.assertNotIn('', cands)

    def test_prompt_has_names_only_and_korean_hedging(self):
        p = folders.build_prompt('acme/api', {'readme': '# Hi', 'packageName': 'web'},
                                 [('backend/tasks', ['models.py'], ['migrations'])])
        for s in ('backend/tasks', 'models.py', 'migrations', '# Hi', 'web', '파일 이름', '추정', '모른다'):
            self.assertIn(s, p)


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.repo = WatchedRepo.objects.create(url='https://github.com/acme/api', owner='acme', name='api')
        self.tree = patch.object(github_client, 'list_repo_tree', return_value=TREE).start()
        self.file = patch.object(github_client, 'get_file_text', side_effect=lambda o, n, p: (
            '{"name": "flowsync-web"}' if p == 'package.json' else '# FlowSync\n할 일 앱')).start()
        patch.object(github_client, 'list_commits', return_value=[commit('a', 1)]).start()
        patch.object(github_client, 'get_commit_files', return_value=['backend/tasks/models.py']).start()
        self.llm = patch('integrations.folders.run_json_completion',
                         side_effect=lambda prompt: groq_reply(
                             [ln[len('- 경로: '):] for ln in prompt.splitlines() if ln.startswith('- 경로: ')])
                         ).start()
        self.addCleanup(patch.stopall)

    def release_throttle(self):
        WatchedRepo.objects.filter(pk=self.repo.pk).update(describe_started_at=None)

    def describe(self, body=None, **headers):
        return self.client.post(DESCRIBE_URL.format(self.repo.id), json.dumps(body or {}),
                                content_type='application/json', **headers)

    def tree_get(self, **headers):
        return self.client.get(TREE_URL.format(self.repo.id), **headers)

    def find(self, node, path):
        if node['path'] == path:
            return node
        for c in node['children']:
            hit = self.find(c, path)
            if hit:
                return hit
        return None


class TreeViewTests(Base):
    def test_shape_etag_and_errors(self):
        r = self.tree_get()
        d = r.json()
        self.assertEqual(set(d), {'repoId', 'treeHash', 'truncated', 'folderCount', 'limits', 'root'})
        self.assertEqual(d['limits'], {'maxDepth': folders.MAX_DEPTH, 'maxNodes': folders.MAX_NODES})
        node = self.find(d['root'], 'backend/tasks')
        self.assertEqual(set(node), {'path', 'name', 'fileCount', 'children', 'areaId', 'description'})
        self.assertEqual(self.tree_get(HTTP_IF_NONE_MATCH=r['ETag']).status_code, 304)
        self.assertEqual(self.client.get(TREE_URL.format(999)).json()['code'], 'repo_not_found')
        cache.clear()
        self.tree.side_effect = github_client.GitHubError(502, 'down')
        r = self.tree_get()
        self.assertEqual((r.status_code, r.json()['code']), (502, 'github_unavailable'))


@override_settings(GROQ_API_KEY='k')
class DescribeTests(Base):
    def test_generates_saves_and_shows_in_tree_and_areas(self):
        r = self.describe()
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        self.assertEqual(set(d), {'repoId', 'treeHash', 'model', 'generated', 'skippedUnchanged',
                                  'skippedManual', 'failed', 'limited'})
        self.assertIn('backend/tasks', d['generated'])
        fd = FolderDescription.objects.get(repo=self.repo, path='backend/tasks')
        self.assertEqual((fd.source, fd.tree_hash, fd.model), ('ai', d['treeHash'], d['model']))
        node = self.find(self.tree_get().json()['root'], 'backend/tasks')
        self.assertEqual(node['description']['source'], 'ai')
        self.assertIn('backend/tasks', node['description']['text'])
        areas_ = {a['id']: a for a in self.client.get(
            f'/api/v1/integrations/watched-repos/{self.repo.id}/areas/').json()['areas']}
        self.assertEqual(areas_['backend-tasks']['description']['text'], fd.text)
        self.assertIsNone(areas_['docs']['description'])  # special area: no folder
        detail = self.client.get(f'/api/v1/integrations/watched-repos/{self.repo.id}/areas/backend-tasks/')
        self.assertEqual(detail.json()['description']['source'], 'ai')

    def test_prompt_sends_names_not_source(self):
        self.describe()
        prompt = self.llm.call_args_list[0].args[0]
        self.assertIn('models.py', prompt)
        self.assertIn('# FlowSync', prompt)  # README head
        self.assertIn('flowsync-web', prompt)  # package.json name only
        fetched = [c.args[2] for c in self.file.call_args_list]
        self.assertTrue(all(p.lower().startswith('readme') or p in ('package.json', 'pyproject.toml')
                            for p in fetched), fetched)

    def test_skip_unchanged_force_and_manual_kept(self):
        first = self.describe().json()
        n = len(first['generated'])
        FolderDescription.objects.filter(repo=self.repo, path='backend/tasks').update(source='manual', text='수동')
        self.release_throttle()
        again = self.describe().json()
        self.assertEqual((again['generated'], again['skippedUnchanged'], again['skippedManual']), ([], n - 1, 1))
        self.release_throttle()
        forced = self.describe({'force': True}).json()
        self.assertEqual((len(forced['generated']), forced['skippedManual']), (n - 1, 1))
        self.assertEqual(FolderDescription.objects.get(repo=self.repo, path='backend/tasks').text, '수동')

    def test_throttle_idempotency_and_partial_failure(self):
        first = self.describe(HTTP_IDEMPOTENCY_KEY='k1')
        calls = self.llm.call_count
        self.assertGreater(calls, 1)  # batched
        replay = self.describe(HTTP_IDEMPOTENCY_KEY='k1')  # replayed, not throttled, no new LLM call
        self.assertEqual((replay.status_code, replay.json(), self.llm.call_count), (200, first.json(), calls))
        r = self.describe()
        self.assertEqual((r.status_code, r.json()['code']), (429, 'describe_throttled'))
        self.assertIn('retryAfterSeconds', r.json())

    def test_throttle_is_shared_across_workers(self):
        # the claim lives in the DB, not in a per-process cache: clearing locmem must not release it
        self.assertEqual(self.describe().status_code, 200)
        cache.clear()
        self.assertEqual(self.describe().json()['code'], 'describe_throttled')
        # and it expires after the interval
        WatchedRepo.objects.filter(pk=self.repo.pk).update(
            describe_started_at=timezone.now() - timedelta(seconds=DESCRIBE_INTERVAL + 1))
        self.assertEqual(self.describe().status_code, 200)

    def test_all_batches_fail_is_502_and_releases_throttle(self):
        self.llm.side_effect = RuntimeError('groq down')
        r = self.describe()
        self.assertEqual((r.status_code, r.json()['code']), (502, 'ai_failed'))
        self.llm.side_effect = lambda prompt: '{"descriptions": []}'
        self.assertEqual(self.describe().status_code, 502)  # not throttled; model returned nothing usable

    def test_github_failure_is_502(self):
        self.tree.side_effect = github_client.GitHubError(502, 'down')
        r = self.describe()
        self.assertEqual((r.status_code, r.json()['code']), (502, 'github_unavailable'))


class NoKeyTests(Base):
    @override_settings(GROQ_API_KEY=None)
    @patch.dict('os.environ', {'GROQ_API_KEY': ''})
    def test_missing_key_is_503_and_tree_still_works(self):
        r = self.describe()
        self.assertEqual((r.status_code, r.json()['code']), (503, 'ai_unavailable'))
        self.assertEqual(self.llm.call_count, 0)
        self.assertEqual(self.tree_get().status_code, 200)


class ManualEditTests(Base):
    def patch_(self, body):
        return self.client.patch(FOLDER_URL.format(self.repo.id), json.dumps(body), content_type='application/json')

    def test_patch_then_delete(self):
        r = self.patch_({'path': '/backend/tasks/', 'text': '  할 일 API 폴더  '})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['path'], 'backend/tasks')
        self.assertEqual((r.json()['description']['text'], r.json()['description']['source']),
                         ('할 일 API 폴더', 'manual'))
        node = self.find(self.tree_get().json()['root'], 'backend/tasks')
        self.assertEqual(node['description']['source'], 'manual')
        url = FOLDER_URL.format(self.repo.id)
        self.assertEqual(self.client.delete(url + '?path=backend/tasks').status_code, 204)
        r = self.client.delete(url + '?path=backend/tasks')
        self.assertEqual((r.status_code, r.json()['code']), (404, 'description_not_found'))

    def test_patch_errors(self):
        self.assertEqual(self.patch_({'path': 'nope', 'text': 'x'}).json()['code'], 'folder_not_found')
        self.assertEqual(self.patch_({'path': 'backend/tasks', 'text': ''}).json()['code'], 'invalid_text')
        self.assertEqual(self.patch_({'path': 'backend/tasks', 'text': 'x' * 301}).status_code, 400)
        self.assertEqual(self.patch_({'path': '', 'text': 'x'}).json()['code'], 'folder_not_found')
