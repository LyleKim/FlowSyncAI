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
            self.assertEqual(gh.get_authenticated_login(), 'me')
        kw = get.call_args.kwargs
        self.assertEqual(kw['headers']['Authorization'], 'Bearer tok')
        self.assertEqual(kw['timeout'], 10)

    def test_no_token(self, get):
        get.return_value = resp(body={'login': 'me'})
        with mock.patch.dict('os.environ', {}, clear=True):
            gh.get_authenticated_login()
        self.assertNotIn('Authorization', get.call_args.kwargs['headers'])

    def test_search(self, get):
        get.return_value = resp(body={'items': [{
            'number': 3, 'title': 't', 'html_url': 'u', 'created_at': 'c', 'updated_at': 'x',
            'repository_url': 'https://api.github.com/repos/o/r', 'user': {'login': 'a'}, 'draft': True}]})
        out = gh.search_review_requested_prs('me', 'o', 'r')
        self.assertEqual(out, [{'number': 3, 'title': 't', 'html_url': 'u', 'repo': 'o/r', 'author': 'a',
                                'created_at': 'c', 'updated_at': 'x', 'draft': True}])
        self.assertEqual(get.call_args.kwargs['params']['q'], 'is:pr is:open review-requested:me repo:o/r')

    def test_search_no_repo(self, get):
        get.return_value = resp(body={'items': []})
        self.assertEqual(gh.search_review_requested_prs('me'), [])
        self.assertNotIn('repo:', get.call_args.kwargs['params']['q'])

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
            gh.get_authenticated_login()
        self.assertEqual((c.exception.status, c.exception.message), (404, 'Not Found'))

    def test_rate_limit(self, get):
        for status in (403, 429):
            get.return_value = resp(status, {'message': 'API rate limit exceeded'},
                                    {'X-RateLimit-Remaining': '0'})
            with self.assertRaises(gh.GitHubError) as c:
                gh.get_authenticated_login()
            self.assertEqual(c.exception.status, status)
            self.assertIn('rate limit', c.exception.message)
