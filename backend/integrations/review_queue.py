from datetime import timedelta

from django.db.models import Prefetch, Q

from .models import PullRequest, PullRequestReview, PullRequestReviewer, WatchedRepo
from .pr_sync import serialize_repo_status

GROUP_ORDER = {'waiting': 0, 'awaiting_author': 1, 'closed': 2}


def _z(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ') if dt else None


def _areas_for(pr):
    """Hook for include=areas (filled in by the areas task)."""
    return None


def _item(pr, lk, rows, review, cutoff, include_areas):
    """-> item dict, or None when the PR is outside the queue."""
    active = [r for r in rows if r.is_active]
    pool = active or rows
    requested_at = max(r.requested_at for r in pool)
    direct = [r for r in pool if r.login_key == lk] or [r for r in rows if r.login_key == lk]
    team = None if direct else max(pool, key=lambda r: r.requested_at)
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
        'requestedAt': _z(requested_at),
        # ingest falls back to the PR's createdAt when GitHub gave no request event
        'requestedAtSource': 'pr_created' if requested_at == pr.pr_created_at else 'event',
        'reRequested': group == 'waiting' and review is not None,
        'myReview': {'state': review.state, 'submittedAt': _z(review.submitted_at)} if review else None,
        'size': {'additions': pr.additions, 'deletions': pr.deletions, 'changedFiles': pr.changed_files},
        'closedAt': _z(pr.closed_at),
        'mergedAt': _z(pr.merged_at),
        'closedReason': closed_reason,
        'mergedWithoutMyReview': pr.state == 'merged' and review is None,
        'areas': _areas_for(pr) if include_areas else None,
        'updatedAt': _z(pr.pr_updated_at),
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
    for pr in prs:
        # a team row only counts when it is a real team row (direct rows have no team_slug)
        rows = [r for r in pr.reviewers.all() if r.login_key == lk or (r.team_slug and r.team_slug in teams)]
        if not rows:
            continue
        item = _item(pr, lk, rows, next(iter(pr.reviews.all()), None), cutoff, include_areas)
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
