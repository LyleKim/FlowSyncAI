from datetime import timedelta

from django.db.models import Prefetch, Q

from . import areas
from .architecture import Locator
from .github_client import GitHubError
from .models import PullRequest, PullRequestReview, PullRequestReviewer, WatchedRepo
from .pr_sync import iso_z, serialize_repo_status

GROUP_ORDER = {'waiting': 0, 'awaiting_author': 1, 'closed': 2}


def _areas_for(pr, cache):
    """include=areas: map the PR's stored files; groups are fetched once per repo (cache = {repo_id: Locator|None}).
    A repo whose tree can't be read yields None for its items."""
    if pr.repo_id not in cache:
        try:
            cache[pr.repo_id] = Locator(areas.get_groups(pr.repo.owner, pr.repo.name))
        except GitHubError:
            cache[pr.repo_id] = None
    locate = cache[pr.repo_id]
    if locate is None:
        return None
    m = areas.map_pr_files(locate.groups, areas.pr_files(pr), locate)
    return {'primaryAreaId': m['primaryAreaId'], 'touched': m['touched'], 'filesTruncated': pr.files_truncated}


def _item(pr, lk, rows, review, cutoff, areas_cache):
    """-> item dict, or None when the PR is outside the queue."""
    active = [r for r in rows if r.is_active]
    pool = active or rows
    chosen = max(pool, key=lambda r: r.requested_at)  # row whose requested_at (and estimated flag) is used
    requested_at = chosen.requested_at
    direct = any(r.login_key == lk for r in pool)
    team = None if direct else chosen
    closed_at, closed_reason = None, None
    if pr.state == 'open':
        if active:
            group = 'waiting' if review is None or review.submitted_at < requested_at else 'awaiting_author'
        elif review:
            group = 'awaiting_author'
        else:
            group, closed_reason = 'closed', 'request_withdrawn'
            if pr.pr_updated_at < cutoff:
                return None
    else:
        closed_at = pr.merged_at if pr.state == 'merged' else pr.closed_at
        if (closed_at or pr.pr_updated_at) < cutoff:
            return None
        group, closed_reason = 'closed', pr.state
    return {
        'id': f'{pr.repo}#{pr.number}:{lk}',
        'repoId': pr.repo_id, 'repo': str(pr.repo), 'number': pr.number,
        'title': pr.title, 'url': pr.url, 'author': pr.author, 'isDraft': pr.is_draft, 'prState': pr.state,
        'group': group,
        'requestKind': 'direct' if direct else 'team', 'viaTeam': team.team_slug if team else None,
        'requestedAt': iso_z(requested_at),
        'requestedAtSource': 'pr_created' if chosen.requested_at_estimated else 'event',
        'reRequested': group == 'waiting' and review is not None,
        'myReview': {'state': review.state, 'submittedAt': iso_z(review.submitted_at)} if review else None,
        'size': {'additions': pr.additions, 'deletions': pr.deletions, 'changedFiles': pr.changed_files},
        'closedAt': iso_z(pr.closed_at),
        'mergedAt': iso_z(pr.merged_at),
        'closedReason': closed_reason,
        'mergedWithoutMyReview': pr.state == 'merged' and review is None,
        'areas': _areas_for(pr, areas_cache) if areas_cache is not None else None,
        'updatedAt': iso_z(pr.pr_updated_at),
    }


def build_queue(login, teams, closed_within_days, include_areas, now):
    lk = login.strip().lower()
    cond = Q(login_key=lk) | Q(team_slug__in=teams) if teams else Q(login_key=lk)
    prs = (PullRequest.objects.filter(reviewers__in=PullRequestReviewer.objects.filter(cond)).distinct()
           .select_related('repo')
           .prefetch_related(Prefetch('reviewers', PullRequestReviewer.objects.filter(cond)),
                             Prefetch('reviews', PullRequestReview.objects.filter(login_key=lk))))
    cutoff = now - timedelta(days=closed_within_days)
    items = []
    areas_cache = {} if include_areas else None
    for pr in prs:
        # a team row only counts when it is a real team row (direct rows have no team_slug)
        rows = [r for r in pr.reviewers.all() if r.login_key == lk or (r.team_slug and r.team_slug in teams)]
        if not rows:
            continue
        item = _item(pr, lk, rows, next(iter(pr.reviews.all()), None), cutoff, areas_cache)
        if item:
            items.append(item)
    # waiting: oldest request first; others: most recently updated first
    waiting = sorted((i for i in items if i['group'] == 'waiting'), key=lambda i: (i['requestedAt'], i['id']))
    rest = sorted((i for i in items if i['group'] != 'waiting'), key=lambda i: i['id'])
    rest.sort(key=lambda i: i['updatedAt'], reverse=True)
    rest.sort(key=lambda i: GROUP_ORDER[i['group']])
    items = waiting + rest

    known = (PullRequest.objects.filter(author__iexact=lk).exists()
             or PullRequestReviewer.objects.filter(login_key=lk).exists()
             or PullRequestReview.objects.filter(login_key=lk).exists())
    # login = GitHub spelling as stored
    shown = (PullRequestReviewer.objects.filter(login_key=lk).exclude(login='').values_list('login', flat=True).first()
             or PullRequestReview.objects.filter(login_key=lk).values_list('login', flat=True).first()
             or PullRequest.objects.filter(author__iexact=lk).values_list('author', flat=True).first()
             or login.strip())
    return {
        'login': shown, 'knownLogin': known,
        'repos': [serialize_repo_status(r) for r in WatchedRepo.objects.order_by('id')],
        'counts': {'waiting': sum(i['group'] == 'waiting' for i in items),
                   'awaitingAuthor': sum(i['group'] == 'awaiting_author' for i in items),
                   'closed': sum(i['group'] == 'closed' for i in items)},
        'items': items,
    }
