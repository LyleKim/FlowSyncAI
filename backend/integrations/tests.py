from unittest import mock

from django.test import SimpleTestCase

from integrations import github_client as gh


def resp(status=200, body=None, headers=None):
    r = mock.Mock(status_code=status, headers=headers or {}, text=str(body))
    r.json.return_value = body
    return r


class ParseRepoUrlTests(SimpleTestCase):
    def test_variants(self):
        for u in ['https://github.com/o/r', 'https://github.com/o/r.git', 'https://github.com/o/r/',
                  'https://github.com/o/r/pulls', 'http://www.github.com/o/r.git']:
            self.assertEqual(gh.parse_repo_url(u), ('o', 'r'), u)

    def test_dots_in_name(self):
        self.assertEqual(gh.parse_repo_url('https://github.com/o/my.repo.git'), ('o', 'my.repo'))

    def test_invalid(self):
        for u in ['', None, 'https://gitlab.com/o/r', 'https://github.com/o', 'nonsense']:
            with self.assertRaises(ValueError):
                gh.parse_repo_url(u)


@mock.patch('integrations.github_client.requests.get')
class ClientTests(SimpleTestCase):
    def test_token_header(self, get):
        get.return_value = resp(body={'login': 'me'})
        with mock.patch.dict('os.environ', {'GITHUB_TOKEN': 'tok'}):
            self.assertEqual(gh._get('/user')['login'], 'me')
        kw = get.call_args.kwargs
        self.assertEqual(kw['headers']['Authorization'], 'Bearer tok')
        self.assertEqual(kw['timeout'], 10)

    def test_no_token(self, get):
        get.return_value = resp(body={'login': 'me'})
        with mock.patch.dict('os.environ', {}, clear=True):
            gh._get('/user')
        self.assertNotIn('Authorization', get.call_args.kwargs['headers'])

    def test_tree_default_branch(self, get):
        get.side_effect = [resp(body={'default_branch': 'main'}),
                           resp(body={'tree': [{'path': 'a.py', 'type': 'blob'}, {'path': 'd', 'type': 'tree'}]})]
        self.assertEqual(gh.list_repo_tree('o', 'r'), ['a.py'])
        self.assertIn('/git/trees/main', get.call_args.args[0])

    def test_tree_ref_and_truncated(self, get):
        get.return_value = resp(body={'tree': [], 'truncated': True})
        with self.assertRaises(gh.GitHubError):
            gh.list_repo_tree('o', 'r', ref='dev')
        self.assertEqual(get.call_count, 1)

    def _commit(self, i):
        return {'sha': str(i), 'commit': {'message': f'm{i}\nbody', 'author': {'name': 'N', 'date': 'd'}},
                'author': None}

    def test_commits_pagination(self, get):
        get.side_effect = [resp(body=[self._commit(i) for i in range(100)]),
                           resp(body=[self._commit(100)])]
        out = gh.list_commits('o', 'r', since='s')
        self.assertEqual(len(out), 101)
        self.assertEqual(out[0], {'sha': '0', 'message': 'm0', 'author': 'N', 'date': 'd'})
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args.kwargs['params']['since'], 's')

    def test_commits_max_pages(self, get):
        get.return_value = resp(body=[self._commit(i) for i in range(100)])
        self.assertEqual(len(gh.list_commits('o', 'r', max_pages=2)), 200)

    def test_commit_files(self, get):
        get.return_value = resp(body={'files': [{'filename': 'a'}, {'filename': 'b'}]})
        self.assertEqual(gh.get_commit_files('o', 'r', 'abc'), ['a', 'b'])

    def test_errors(self, get):
        get.return_value = resp(404, {'message': 'Not Found'})
        with self.assertRaises(gh.GitHubError) as c:
            gh._get('/user')
        self.assertEqual((c.exception.status, c.exception.message), (404, 'Not Found'))

    def test_rate_limit(self, get):
        for status in (403, 429):
            get.return_value = resp(status, {'message': 'API rate limit exceeded'},
                                    {'X-RateLimit-Remaining': '0'})
            with self.assertRaises(gh.GitHubError) as c:
                gh._get('/user')
            self.assertEqual(c.exception.status, status)
            self.assertIn('rate limit', c.exception.message)


import copy
import json
from datetime import datetime, timezone
from pathlib import Path

FIXTURE = json.loads((Path(__file__).parent / 'testdata' / 'graphql_repo_prs.json').read_text())


def gql(open_nodes=(), recent_nodes=(), has_next=False, **extra):
    return {'data': {'repository': {
        'open': {'pageInfo': {'hasNextPage': has_next, 'endCursor': 'c'}, 'nodes': list(open_nodes)},
        'recent': {'nodes': list(recent_nodes)}, **extra}}}


def pr_node(number=1, **kw):
    n = copy.deepcopy(FIXTURE['data']['repository']['open']['nodes'][1])
    n['number'] = number
    n.update(kw)
    return n


@mock.patch('integrations.github_client.requests.post')
class GraphQLClientTests(SimpleTestCase):
    def setUp(self):
        p = mock.patch.dict('os.environ', {'GITHUB_TOKEN': 'tok'})
        p.start()
        self.addCleanup(p.stop)

    def test_normalizes_fixture(self, post):
        post.return_value = resp(body=FIXTURE)
        out = gh.fetch_repo_pull_requests('acme', 'widgets')
        self.assertFalse(out['truncated'])
        by = {p['number']: p for p in out['prs']}
        self.assertEqual(set(by), {42, 40, 39, 38})
        p = by[42]
        self.assertEqual(p['author'], 'alice')
        self.assertEqual(p['state'], 'open')
        self.assertEqual(p['files'], ['backend/integrations/github_client.py', 'backend/integrations/tests.py'])
        self.assertEqual(p['review_requests'], [
            {'kind': 'user', 'login': 'bob', 'team_slug': '', 'requested_at': '2026-11-20T01:05:00Z'},
            {'kind': 'team', 'login': '', 'team_slug': 'backend', 'requested_at': '2026-11-21T02:00:00Z'},
        ])
        self.assertEqual(p['latest_reviews'],
                         [{'login': 'carol', 'state': 'COMMENTED', 'submitted_at': '2026-11-22T10:00:00Z'}])
        self.assertEqual(by[38]['state'], 'merged')
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer tok')
        self.assertEqual(post.call_args.kwargs['timeout'], 10)

    def test_pagination_and_truncation(self, post):
        post.return_value = resp(body=gql([pr_node(1)], has_next=True))
        out = gh.fetch_repo_pull_requests('o', 'r', max_open=1)
        self.assertTrue(out['truncated'])
        self.assertEqual(post.call_count, 1)
        post.reset_mock()
        post.side_effect = [resp(body=gql([pr_node(1)], has_next=True)), resp(body=gql([pr_node(2)]))]
        out = gh.fetch_repo_pull_requests('o', 'r', max_open=250)
        self.assertFalse(out['truncated'])
        self.assertEqual(post.call_count, 2)
        self.assertEqual({p['number'] for p in out['prs']}, {1, 2})

    def test_ghost_author_and_null_reviewer(self, post):
        n = pr_node(1, author=None)
        n['reviewRequests']['nodes'] = [
            {'requestedReviewer': None},
            {'requestedReviewer': {'__typename': 'Bot', 'login': 'b'}},
            {'requestedReviewer': {'__typename': 'Mannequin', 'login': 'm'}},
            {'requestedReviewer': {'__typename': 'User', 'login': 'u'}},
        ]
        post.return_value = resp(body=gql([n]))
        p = gh.fetch_repo_pull_requests('o', 'r')['prs'][0]
        self.assertEqual(p['author'], '')
        self.assertEqual([r['login'] for r in p['review_requests']], ['u'])

    def test_files_truncated_flag(self, post):
        n = pr_node(1)
        n['files'] = {'nodes': [{'path': f'f{i}'} for i in range(100)], 'pageInfo': {'hasNextPage': True}}
        post.return_value = resp(body=gql([n]))
        p = gh.fetch_repo_pull_requests('o', 'r')['prs'][0]
        self.assertTrue(p['files_truncated'])
        self.assertEqual(len(p['files']), 100)

    def test_tracked_missing_triggers_single_extra_query(self, post):
        post.side_effect = [resp(body=gql([pr_node(1)])), resp(body=gql(pr9=pr_node(9, state='CLOSED')))]
        out = gh.fetch_repo_pull_requests('o', 'r', tracked_open=[1, 9])
        self.assertEqual(post.call_count, 2)
        self.assertEqual({p['number'] for p in out['prs']}, {1, 9})
        post.reset_mock()
        post.side_effect = None
        post.return_value = resp(body=gql([pr_node(9)]))
        gh.fetch_repo_pull_requests('o', 'r', tracked_open=[9])
        self.assertEqual(post.call_count, 1)

    def test_graphql_errors_array_raises(self, post):
        body = gql([pr_node(1)])
        body['errors'] = [{'message': 'boom'}]
        post.return_value = resp(body=body)
        with self.assertRaises(gh.GitHubError) as c:
            gh.fetch_repo_pull_requests('o', 'r')
        self.assertEqual(c.exception.kind, 'unknown')

    def test_error_kinds(self, post):
        def kind(r):
            post.return_value = r
            with self.assertRaises(gh.GitHubError) as c:
                gh.fetch_repo_pull_requests('o', 'r')
            return c.exception
        self.assertEqual(kind(resp(401, {'message': 'bad'})).kind, 'auth')
        e = kind(resp(403, {'message': 'x'}, {'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1800000000'}))
        self.assertEqual(e.kind, 'rate_limit')
        self.assertEqual(e.reset_at, datetime.fromtimestamp(1800000000, timezone.utc))
        self.assertEqual(kind(resp(200, {'errors': [{'type': 'RATE_LIMITED', 'message': 'r'}]})).kind, 'rate_limit')
        self.assertEqual(kind(resp(200, {'errors': [{'type': 'NOT_FOUND', 'message': 'n'}]})).kind, 'not_found')
        self.assertEqual(kind(resp(404, {'message': 'n'})).kind, 'not_found')
        self.assertEqual(kind(resp(502, {'message': 'u'})).kind, 'upstream')
        self.assertEqual(kind(resp(418, {'message': 't'})).kind, 'unknown')

    def test_no_token_fails_before_call(self, post):
        with mock.patch.dict('os.environ', {}, clear=True):
            with self.assertRaises(gh.GitHubError) as c:
                gh.fetch_repo_pull_requests('o', 'r')
        self.assertEqual((c.exception.status, c.exception.kind), (401, 'auth'))
        post.assert_not_called()


@mock.patch('integrations.github_client.requests.post')
class GraphQLFixRound1Tests(SimpleTestCase):
    def setUp(self):
        p = mock.patch.dict('os.environ', {'GITHUB_TOKEN': 'tok'})
        p.start()
        self.addCleanup(p.stop)

    def _fallback(self, post, errors):
        fb = gql(pr8=pr_node(8), pr9=None)
        fb['errors'] = errors
        post.side_effect = [resp(body=gql([pr_node(1)])), resp(body=fb)]
        return gh.fetch_repo_pull_requests('o', 'r', tracked_open=[8, 9])

    def test_tracked_not_found_alias_is_skipped(self, post):
        out = self._fallback(post, [{'type': 'NOT_FOUND', 'path': ['repository', 'pr9'], 'message': 'x'}])
        self.assertEqual({p['number'] for p in out['prs']}, {1, 8})

    def test_tracked_other_error_still_raises(self, post):
        with self.assertRaises(gh.GitHubError):
            self._fallback(post, [{'type': 'FORBIDDEN', 'path': ['repository', 'pr9'], 'message': 'x'}])
        with self.assertRaises(gh.GitHubError):  # NOT_FOUND on a non-alias path is not tolerated
            self._fallback(post, [{'type': 'NOT_FOUND', 'path': ['repository'], 'message': 'x'}])

    def test_non_json_and_null_data_are_upstream(self, post):
        bad = resp(body=None)
        bad.json.side_effect = ValueError('no json')
        for r in (bad, resp(body={'data': None})):
            post.return_value = r
            with self.assertRaises(gh.GitHubError) as c:
                gh.fetch_repo_pull_requests('o', 'r')
            self.assertEqual(c.exception.kind, 'upstream')

    def test_null_files(self, post):
        post.return_value = resp(body=gql([pr_node(1, files=None)]))
        p = gh.fetch_repo_pull_requests('o', 'r')['prs'][0]
        self.assertEqual((p['files'], p['files_truncated']), ([], False))
