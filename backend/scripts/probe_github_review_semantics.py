"""Read-only GitHub GraphQL probe for docs/ux/08 unverified items 5-8 (schema/ETag/cost).

Usage: GITHUB_TOKEN=... python backend/scripts/probe_github_review_semantics.py --schema owner/name
Only GraphQL queries (no mutations) are sent. The token is read from the env, used only in
the Authorization header, and never printed or written to disk.
Writes backend/integrations/testdata/graphql_repo_prs.json (response body only, no headers).
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

URL = 'https://api.github.com/graphql'
OUT = Path(__file__).resolve().parent.parent / 'integrations' / 'testdata' / 'graphql_repo_prs.json'

REVIEWER = '__typename ... on User{login} ... on Team{slug organization{login}}'
PR_FIELDS = (
    'number title url isDraft state createdAt updatedAt closedAt mergedAt additions deletions changedFiles '
    'author{login} files(first:100){nodes{path} pageInfo{hasNextPage}} '
    f'reviewRequests(first:30){{nodes{{requestedReviewer{{{REVIEWER}}}}}}} '
    'latestReviews(first:30){nodes{author{login} state submittedAt}} '
    f'timelineItems(itemTypes:[REVIEW_REQUESTED_EVENT], last:30){{nodes{{... on ReviewRequestedEvent{{createdAt requestedReviewer{{{REVIEWER}}}}}}}}}'
)
PR_QUERY = (
    'query($owner:String!,$name:String!,$recent:Int!){ '
    'repository(owner:$owner,name:$name){ '
    f'open: pullRequests(states:OPEN, first:50, orderBy:{{field:UPDATED_AT,direction:DESC}}){{ pageInfo{{hasNextPage endCursor}} nodes{{{PR_FIELDS}}} }} '
    f'recent: pullRequests(states:[MERGED,CLOSED], first:$recent, orderBy:{{field:UPDATED_AT,direction:DESC}}){{ nodes{{{PR_FIELDS}}} }} }} '
    'rateLimit{cost remaining resetAt} }'
)
SCHEMA_QUERY = '''{
 pr: __type(name:"PullRequest"){fields{name}}
 ev: __type(name:"ReviewRequestedEvent"){fields{name}}
 repo: __type(name:"Repository"){fields{name args{name}}}
}'''


def post(token, query, variables=None, etag=None):
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': 'flowsync-probe'}
    if etag:
        headers['If-None-Match'] = etag
    req = urllib.request.Request(URL, json.dumps({'query': query, 'variables': variables or {}}).encode(), headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.headers, json.load(r)
    except urllib.error.HTTPError as e:  # 304 lands here
        return e.code, e.headers, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--schema', required=True, metavar='OWNER/NAME', help='public repo to probe')
    owner, name = ap.parse_args().schema.split('/', 1)
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        sys.exit('GITHUB_TOKEN is required (read-only probe); refusing to run.')

    _, _, s = post(token, SCHEMA_QUERY)
    d = s['data']
    names = lambda t: {f['name'] for f in d[t]['fields']}
    print('| check | result |\n|---|---|')
    for f in ('reviewRequests', 'latestReviews', 'timelineItems'):
        print(f'| PullRequest.{f} | {f in names("pr")} |')
    for f in ('createdAt', 'requestedReviewer'):
        print(f'| ReviewRequestedEvent.{f} | {f in names("ev")} |')
    pr_args = next((f['args'] for f in d['repo']['fields'] if f['name'] == 'pullRequests'), [])
    print(f'| Repository.pullRequests args | {sorted(a["name"] for a in pr_args)} |')

    status, headers, body = post(token, PR_QUERY, {'owner': owner, 'name': name, 'recent': 20})
    if body is None or 'errors' in body:
        sys.exit(f'query failed (status {status}): {json.dumps((body or {}).get("errors"))[:500]}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(body, indent=2, ensure_ascii=False) + '\n')  # body only, never headers
    print(f'| rateLimit | {body["data"]["rateLimit"]} |\n| fixture | {OUT} |')

    etag = headers.get('ETag')
    print(f'| response ETag header | {etag!r} |')
    if etag:
        status2, _, _ = post(token, PR_QUERY, {'owner': owner, 'name': name, 'recent': 20}, etag=etag)
        print(f'| If-None-Match re-request status | {status2} (304 = ETag supported) |')


if __name__ == '__main__':
    main()
