"""The only module that talks to GitHub. Returns plain dicts/lists.

GITHUB_TOKEN env is optional (public repos) but required for review-requested
search and private repos. All functions raise GitHubError on non-2xx.
"""
import os
import re
from datetime import datetime, timezone
from urllib.parse import quote

import requests

API = 'https://api.github.com'
TIMEOUT = 10


class GitHubError(Exception):
    def __init__(self, status, message, kind='unknown', reset_at=None):
        super().__init__(f'GitHub {status}: {message}')
        self.status = status
        self.message = message
        self.kind = kind  # auth | rate_limit | not_found | upstream | unknown
        self.reset_at = reset_at


def _kind_for_status(status, headers, msg):
    """-> (kind, reset_at) from an HTTP failure."""
    if status in (403, 429) and (
        headers.get('X-RateLimit-Remaining') == '0' or 'rate limit' in str(msg).lower()
    ):
        try:
            return 'rate_limit', datetime.fromtimestamp(int(headers.get('X-RateLimit-Reset')), timezone.utc)
        except (TypeError, ValueError):
            return 'rate_limit', None
    if status == 401:
        return 'auth', None
    if status == 404:
        return 'not_found', None
    if status >= 500:
        return 'upstream', None
    return 'unknown', None


def _error_from_response(resp):
    try:
        msg = resp.json().get('message') or resp.text
    except Exception:
        msg = resp.text
    kind, reset_at = _kind_for_status(resp.status_code, resp.headers, msg)
    if kind == 'rate_limit':
        msg = f'rate limit exceeded ({msg}); set GITHUB_TOKEN or retry later'
    return GitHubError(resp.status_code, msg, kind, reset_at)


def _get(path, params=None):
    headers = {'Accept': 'application/vnd.github+json'}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        resp = requests.get(API + path, headers=headers, params=params, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise GitHubError(0, f'network error: {e}', kind='upstream')
    if resp.status_code >= 300:
        raise _error_from_response(resp)
    try:
        return resp.json()
    except ValueError:
        raise GitHubError(resp.status_code, 'invalid JSON from GitHub', kind='upstream')


_REVIEWER = '{ __typename ... on User{login} ... on Team{slug organization{login}} }'
PR_FIELDS = """
fragment PRFields on PullRequest {
  number title url isDraft state createdAt updatedAt closedAt mergedAt
  additions deletions changedFiles author{login}
  files(first:100){nodes{path} pageInfo{hasNextPage}}
  reviewRequests(first:30){nodes{requestedReviewer REVIEWER}}
  latestReviews(first:30){nodes{author{login} state submittedAt}}
  timelineItems(itemTypes:[REVIEW_REQUESTED_EVENT], last:30){nodes{... on ReviewRequestedEvent{createdAt requestedReviewer REVIEWER}}}
}""".replace('REVIEWER', _REVIEWER)

PR_QUERY = """
query($owner:String!, $name:String!, $after:String, $recent:Int!) {
  repository(owner:$owner, name:$name) {
    open: pullRequests(states:OPEN, first:50, after:$after, orderBy:{field:UPDATED_AT, direction:DESC}) {
      pageInfo{hasNextPage endCursor}
      nodes{...PRFields}
    }
    recent: pullRequests(states:[MERGED,CLOSED], first:$recent, orderBy:{field:UPDATED_AT, direction:DESC}) {
      nodes{...PRFields}
    }
  }
}""" + PR_FIELDS


def _post_graphql(query, variables, tolerate_alias_not_found=False):
    """POST one GraphQL query -> `data` dict. Raises GitHubError (with kind) on any failure."""
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        raise GitHubError(401, 'GITHUB_TOKEN is not set', kind='auth')
    try:
        resp = requests.post(API + '/graphql', json={'query': query, 'variables': variables},
                             headers={'Authorization': f'Bearer {token}'}, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise GitHubError(0, f'network error: {e}', kind='upstream')
    if resp.status_code >= 300:
        raise _error_from_response(resp)
    try:
        body = resp.json()
        if not isinstance(body, dict):
            raise ValueError
    except ValueError:
        raise GitHubError(resp.status_code, 'invalid JSON from GitHub', kind='upstream')
    errors = body.get('errors') or []
    if tolerate_alias_not_found:  # unresolvable pr<N> aliases come back null + NOT_FOUND; skip them
        errors = [e for e in errors if not (
            e.get('type') == 'NOT_FOUND' and re.fullmatch(r'pr\d+', str((e.get('path') or [''])[-1])))]
    if errors:  # partial `data` is discarded on purpose
        err = errors[0]
        kind = {'RATE_LIMITED': 'rate_limit', 'NOT_FOUND': 'not_found'}.get(err.get('type'), 'unknown')
        raise GitHubError(resp.status_code, err.get('message', 'GraphQL error'), kind)
    if not isinstance(body.get('data'), dict):
        raise GitHubError(resp.status_code, 'GraphQL response had no data', kind='upstream')
    return body['data']


def _reviewer_key(r):
    """('user', login) | ('team', 'org/slug' lowercased) | None for null/Bot/Mannequin."""
    if not r:
        return None
    if r.get('__typename') == 'User':
        return 'user', r['login']
    if r.get('__typename') == 'Team':
        return 'team', f"{r['organization']['login']}/{r['slug']}".strip().lower()
    return None


def _normalize_pr(n):
    try:
        return _normalize_pr_unsafe(n)
    except (KeyError, TypeError, AttributeError) as e:
        raise GitHubError(0, f'unexpected pull request shape: {e!r}', kind='upstream')


def _normalize_pr_unsafe(n):
    requested = {}  # latest ReviewRequestedEvent per reviewer; ISO-8601 Z strings sort lexicographically
    for ev in (n.get('timelineItems') or {}).get('nodes', []):
        k = _reviewer_key(ev.get('requestedReviewer')) if ev else None
        if k and ev['createdAt'] > requested.get(k, ''):
            requested[k] = ev['createdAt']
    files = n.get('files') or {}
    reqs = []
    for node in n['reviewRequests']['nodes']:
        k = _reviewer_key(node['requestedReviewer'])
        if k:
            reqs.append({'kind': k[0], 'login': k[1] if k[0] == 'user' else '',
                         'team_slug': k[1] if k[0] == 'team' else '', 'requested_at': requested.get(k)})
    return {
        'number': n['number'], 'title': n['title'], 'url': n['url'],
        'author': (n['author'] or {}).get('login', ''),
        'is_draft': n['isDraft'], 'state': n['state'].lower(),
        'created_at': n['createdAt'], 'updated_at': n['updatedAt'],
        'closed_at': n['closedAt'], 'merged_at': n['mergedAt'],
        'additions': n['additions'], 'deletions': n['deletions'], 'changed_files': n['changedFiles'],
        'files': [f['path'] for f in files.get('nodes') or []][:100],
        'files_truncated': bool((files.get('pageInfo') or {}).get('hasNextPage')),
        'review_requests': reqs,
        'latest_reviews': [
            {'login': (r['author'] or {}).get('login', ''), 'state': r['state'], 'submitted_at': r['submittedAt']}
            for r in n['latestReviews']['nodes']
        ],
    }


def fetch_repo_pull_requests(owner, name, tracked_open=(), max_open=250, recent_closed=30):
    """Open PRs + recent merged/closed + any `tracked_open` numbers missing from those.

    -> {'prs': [PRDict], 'truncated': bool}; truncated = more open PRs existed beyond max_open.
    """
    prs, after, truncated, recent, n_open = {}, None, False, [], 0
    while True:
        repo = _post_graphql(PR_QUERY, {'owner': owner, 'name': name, 'after': after,
                                        'recent': recent_closed})['repository']
        if after is None:
            recent = repo['recent']['nodes']
        for n in repo['open']['nodes']:
            prs[n['number']] = _normalize_pr(n)
        n_open += len(repo['open']['nodes'])
        info = repo['open']['pageInfo']
        if not info['hasNextPage']:
            break
        if n_open >= max_open:
            truncated = True
            break
        after = info['endCursor']
    for n in recent:
        prs.setdefault(n['number'], _normalize_pr(n))
    missing = sorted(set(tracked_open) - set(prs))
    if missing:  # one aliased query for all of them
        body = ' '.join(f'pr{i}: pullRequest(number:{int(i)}){{...PRFields}}' for i in missing)
        q = 'query($owner:String!, $name:String!){ repository(owner:$owner, name:$name){ ' + body + ' } }' + PR_FIELDS
        repo = _post_graphql(q, {'owner': owner, 'name': name},
                              tolerate_alias_not_found=True)['repository']
        for i in missing:
            if repo.get(f'pr{i}'):  # null = deleted/transferred; skipped
                prs[i] = _normalize_pr(repo[f'pr{i}'])
    return {'prs': list(prs.values()), 'truncated': truncated}


_URL_RE = re.compile(r'^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?(?:/.*)?$')


def parse_repo_url(url):
    """'https://github.com/o/r[.git][/pulls...]' -> (owner, name). ValueError if not a repo URL."""
    m = _URL_RE.match((url or '').strip())
    if not m:
        raise ValueError(f'Not a GitHub repository URL: {url!r}')
    return m.group(1), m.group(2)


def list_repo_tree(owner, name, ref=None):
    """All file (blob) paths at `ref` (default branch if None) -> list[str].

    Raises GitHubError(200, ...) if GitHub truncated the tree (huge repo).
    """
    try:
        if not ref:
            ref = _get(f'/repos/{owner}/{name}')['default_branch']
        data = _get(f'/repos/{owner}/{name}/git/trees/{quote(ref, safe="")}', {'recursive': 1})
        if data.get('truncated'):
            raise GitHubError(200, 'repository tree too large (truncated by GitHub)')
        return [t['path'] for t in data.get('tree', []) if t.get('type') == 'blob']
    except (KeyError, TypeError, AttributeError) as e:
        raise GitHubError(200, f'unexpected GitHub response shape: {e!r}', kind='upstream')


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
