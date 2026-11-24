import json
from dataclasses import dataclass

from django.db import transaction
from django.utils.dateparse import parse_datetime

from .models import PullRequest, PullRequestReview, PullRequestReviewer


@dataclass
class IngestResult:
    created: int = 0
    updated: int = 0


def _dt(s):
    return parse_datetime(s) if s else None


def tracked_open_numbers(repo):
    return list(PullRequest.objects.filter(repo=repo, state='open').values_list('number', flat=True))


def _sync_reviewers(pr, d, now):
    created_at = _dt(d['created_at'])
    seen = set()
    for r in d.get('review_requests') or []:
        key = ((r.get('login') or '').strip().lower(), r.get('team_slug') or '')
        if key == ('', ''):
            continue
        seen.add(key)
        at = _dt(r.get('requested_at')) or created_at
        row, made = PullRequestReviewer.objects.get_or_create(
            pr=pr, login_key=key[0], team_slug=key[1],
            defaults={'login': r.get('login') or '', 'requested_at': at})
        if not made and not row.is_active:  # re-request
            row.is_active, row.removed_at, row.requested_at = True, None, at
            row.save()
    for row in PullRequestReviewer.objects.filter(pr=pr, is_active=True):
        if (row.login_key, row.team_slug) not in seen:
            row.is_active, row.removed_at = False, now
            row.save()


def _sync_reviews(pr, d):
    for r in d.get('latest_reviews') or []:
        login = r.get('login') or ''
        if not login or not r.get('submitted_at'):
            continue
        PullRequestReview.objects.update_or_create(
            pr=pr, login_key=login.strip().lower(),
            defaults={'login': login, 'state': r['state'], 'submitted_at': _dt(r['submitted_at'])})


def ingest_prs(repo, prs, now):
    res = IngestResult()
    with transaction.atomic():
        for d in prs:
            pr, made = PullRequest.objects.update_or_create(repo=repo, number=d['number'], defaults={
                'title': d['title'], 'url': d['url'], 'author': d.get('author') or '',
                'is_draft': bool(d.get('is_draft')), 'state': d['state'],
                'pr_created_at': _dt(d['created_at']), 'pr_updated_at': _dt(d['updated_at']),
                'closed_at': _dt(d.get('closed_at')), 'merged_at': _dt(d.get('merged_at')),
                'additions': d.get('additions') or 0, 'deletions': d.get('deletions') or 0,
                'changed_files': d.get('changed_files') or 0,
                'files': json.dumps(d.get('files') or []),
                'files_truncated': bool(d.get('files_truncated'))})
            if made:
                res.created += 1
            else:
                res.updated += 1
            if d['state'] == 'open':
                _sync_reviewers(pr, d, now)
            _sync_reviews(pr, d)
    return res
