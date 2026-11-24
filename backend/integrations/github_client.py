"""The only module that talks to GitHub. Returns plain dicts/lists.

GITHUB_TOKEN env is optional (public repos) but required for review-requested
search and private repos. All functions raise GitHubError on non-2xx.
"""
import os
import re
from urllib.parse import quote

import requests

API = 'https://api.github.com'
TIMEOUT = 10


class GitHubError(Exception):
    def __init__(self, status, message):
        super().__init__(f'GitHub {status}: {message}')
        self.status = status
        self.message = message


def _get(path, params=None):
    headers = {'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    resp = requests.get(API + path, headers=headers, params=params, timeout=TIMEOUT)
    if resp.status_code >= 300:
        try:
            msg = resp.json().get('message') or resp.text
        except Exception:
            msg = resp.text
        if resp.status_code in (403, 429) and (
            resp.headers.get('X-RateLimit-Remaining') == '0' or 'rate limit' in str(msg).lower()
        ):
            msg = f'rate limit exceeded ({msg}); set GITHUB_TOKEN or retry later'
        raise GitHubError(resp.status_code, msg)
    return resp.json()


_URL_RE = re.compile(r'^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?(?:/.*)?$')


def parse_repo_url(url):
    """'https://github.com/o/r[.git][/pulls...]' -> (owner, name). ValueError if not a repo URL."""
    m = _URL_RE.match((url or '').strip())
    if not m:
        raise ValueError(f'Not a GitHub repository URL: {url!r}')
    return m.group(1), m.group(2)


_LOGIN_RE = re.compile(r'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')


def validate_login(login):
    """GitHub 사용자명 형식(영숫자/하이픈, 최대 39자)이 아니면 ValueError."""
    if not _LOGIN_RE.match(login or ''):
        raise ValueError(f'Invalid GitHub login: {login!r}')
    return login


def get_authenticated_login():
    """GET /user -> login string (needs token)."""
    return _get('/user')['login']


def search_review_requested_prs(login, owner=None, name=None):
    """Open PRs where `login` is review-requested (optionally within owner/name).

    -> [{number, title, html_url, repo 'owner/name', author, created_at, updated_at, draft}]
    """
    validate_login(login)  # q 에 그대로 들어가므로 `repo:` 같은 검색 한정자 주입을 막는다
    q = f'is:pr is:open review-requested:{login}'
    if owner and name:
        q += f' repo:{owner}/{name}'
    data = _get('/search/issues', {'q': q, 'per_page': 100})
    return [
        {
            'number': i['number'],
            'title': i['title'],
            'html_url': i['html_url'],
            'repo': i['repository_url'].split('/repos/', 1)[-1],
            'author': (i.get('user') or {}).get('login', ''),
            'created_at': i['created_at'],
            'updated_at': i['updated_at'],
            'draft': bool(i.get('draft')),
        }
        for i in data.get('items', [])
    ]


def list_repo_tree(owner, name, ref=None):
    """All file (blob) paths at `ref` (default branch if None) -> list[str].

    Raises GitHubError(200, ...) if GitHub truncated the tree (huge repo).
    """
    if not ref:
        ref = _get(f'/repos/{owner}/{name}')['default_branch']
    data = _get(f'/repos/{owner}/{name}/git/trees/{quote(ref, safe="")}', {'recursive': 1})
    if data.get('truncated'):
        raise GitHubError(200, 'repository tree too large (truncated by GitHub)')
    return [t['path'] for t in data.get('tree', []) if t.get('type') == 'blob']


def list_commits(owner, name, since=None, until=None, max_pages=5):
    """Commits on default branch, newest first, 100/page up to max_pages.

    since/until: ISO 8601 strings. -> [{sha, message (first line), author, date (iso)}]
    """
    params = {'per_page': 100}
    if since:
        params['since'] = since
    if until:
        params['until'] = until
    out = []
    for page in range(1, max_pages + 1):
        items = _get(f'/repos/{owner}/{name}/commits', {**params, 'page': page})
        for c in items:
            commit = c['commit']
            out.append({
                'sha': c['sha'],
                'message': commit['message'].split('\n', 1)[0],
                'author': (c.get('author') or {}).get('login') or commit['author']['name'],
                'date': commit['author']['date'],
            })
        if len(items) < 100:
            break
    return out


def get_commit_files(owner, name, sha):
    """Changed file paths of one commit -> list[str]."""
    return [f['filename'] for f in _get(f'/repos/{owner}/{name}/commits/{sha}').get('files', [])]
