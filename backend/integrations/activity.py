"""Per-group commit activity over a time window (rule-based, GitHub reads via github_client only)."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from itertools import combinations

from . import github_client
from .architecture import Locator, group_paths

MAX_COMMITS = 60


def _dt(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def _week_start(d):
    return (d - timedelta(days=d.weekday())).date()


def _trend(commit_dts, mid):
    """Compare commits in the first vs last half of the window.
    quiet: <2 commits total or none in the last half; rising: last half > first half; else steady."""
    last = sum(1 for d in commit_dts if d >= mid)
    first = len(commit_dts) - last
    if len(commit_dts) < 2 or last == 0:
        return 'quiet'
    return 'rising' if last > first else 'steady'


def compute_activity(owner, name, days=30, paths=None):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    mid = since + timedelta(days=days / 2)
    groups = group_paths(paths if paths is not None else github_client.list_repo_tree(owner, name))
    locate = Locator(groups)

    commits = github_client.list_commits(owner, name, since=since.isoformat())
    commits = sorted((c for c in commits if not c['message'].startswith('Merge')),
                     key=lambda c: c['date'], reverse=True)
    truncated = len(commits) > MAX_COMMITS
    commits = commits[:MAX_COMMITS]

    weeks, w = [], _week_start(since)
    while w <= _week_start(now):
        weeks.append(w)
        w += timedelta(days=7)

    st = {g.id: {'dts': [], 'weekly': {w: [0, 0] for w in weeks}, 'authors': Counter(), 'recent': []}
          for g in groups}
    pairs = Counter()
    for c in commits:  # newest first
        d = _dt(c['date'])
        per_group = Counter(g for g in (locate(f) for f in github_client.get_commit_files(owner, name, c['sha']))
                            if g)
        for gid, nfiles in per_group.items():
            s = st[gid]
            s['dts'].append(d)
            bucket = s['weekly'].setdefault(_week_start(d), [0, 0])
            bucket[0] += 1
            bucket[1] += nfiles
            s['authors'][c['author']] += 1
            if len(s['recent']) < 5:
                s['recent'].append({'sha7': c['sha'][:7], 'message': c['message'],
                                    'author': c['author'], 'date': c['date']})
        pairs.update(combinations(sorted(per_group), 2))

    out = []
    for g in groups:
        s = st[g.id]
        out.append({
            **g.to_dict(),
            'weekly': [{'weekStart': w.isoformat(), 'commits': v[0], 'filesChanged': v[1]}
                       for w, v in sorted(s['weekly'].items())],
            'totalCommits': len(s['dts']),
            'lastChangeAt': max(s['dts']).isoformat().replace('+00:00', 'Z') if s['dts'] else None,
            'authors': [a for a, _ in sorted(s['authors'].items(), key=lambda x: (-x[1], x[0]))[:5]],
            'recentCommits': s['recent'],
            'trend': _trend(s['dts'], mid),
        })
    couplings = [{'a': a, 'b': b, 'count': n}
                 for (a, b), n in sorted(pairs.items(), key=lambda x: (-x[1], x[0]))[:10]]
    return {'generatedAt': now.isoformat().replace('+00:00', 'Z'), 'days': days, 'truncated': truncated,
            'analyzedCommits': len(commits), 'groups': out, 'couplings': couplings}
