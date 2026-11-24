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


_PR_FIELDS = ['title', 'url', 'author', 'is_draft', 'state', 'pr_created_at', 'pr_updated_at', 'closed_at',
              'merged_at', 'additions', 'deletions', 'changed_files', 'files', 'files_truncated', 'synced_at']


def _pr_values(d, now):
    return {
        'title': d['title'], 'url': d['url'], 'author': d.get('author') or '',
        'is_draft': bool(d.get('is_draft')), 'state': d['state'],
        'pr_created_at': _dt(d['created_at']), 'pr_updated_at': _dt(d['updated_at']),
        'closed_at': _dt(d.get('closed_at')), 'merged_at': _dt(d.get('merged_at')),
        'additions': d.get('additions') or 0, 'deletions': d.get('deletions') or 0,
        'changed_files': d.get('changed_files') or 0,
        'files': json.dumps(d.get('files') or []),
        'files_truncated': bool(d.get('files_truncated')), 'synced_at': now}


def ingest_prs(repo, prs, now):
    res = IngestResult()
    prs = list({d['number']: d for d in prs}.values())  # dedupe by number, last wins
    with transaction.atomic():
        existing = {p.number: p for p in PullRequest.objects.filter(
            repo=repo, number__in=[d['number'] for d in prs])}
        to_update, pairs = [], []
        for d in prs:
            vals = _pr_values(d, now)
            pr = existing.get(d['number'])
            if pr:
                for k, v in vals.items():
                    setattr(pr, k, v)
                to_update.append(pr)
                res.updated += 1
            else:
                # per-row create: MySQL bulk_create does not return pks
                pr = PullRequest.objects.create(repo=repo, number=d['number'], **vals)
                existing[pr.number] = pr
                res.created += 1
            pairs.append((pr, d))
        if to_update:
            PullRequest.objects.bulk_update(to_update, _PR_FIELDS)

        ids = [pr.id for pr, _ in pairs]
        reviewers = {}  # pr_id -> {(login_key, team_slug): row}
        for r in PullRequestReviewer.objects.filter(pr_id__in=ids):
            reviewers.setdefault(r.pr_id, {})[(r.login_key, r.team_slug)] = r
        reviews = {(r.pr_id, r.login_key): r for r in PullRequestReview.objects.filter(pr_id__in=ids)}
        new_rv, upd_rv, new_rw, upd_rw = [], [], [], []
        for pr, d in pairs:
            if d['state'] == 'open':
                created_at = _dt(d['created_at'])
                seen = set()
                for r in d.get('review_requests') or []:
                    k = ((r.get('login') or '').strip().lower(), r.get('team_slug') or '')
                    if k == ('', '') or k in seen:
                        continue
                    seen.add(k)
                    ev = _dt(r.get('requested_at'))
                    at, est = ev or created_at, ev is None
                    row = reviewers.get(pr.id, {}).get(k)
                    if row is None:
                        new_rv.append(PullRequestReviewer(pr=pr, login=r.get('login') or '', login_key=k[0],
                                                          team_slug=k[1], requested_at=at,
                                                          requested_at_estimated=est))
                    elif not row.is_active:  # re-request
                        row.is_active, row.removed_at, row.requested_at = True, None, at
                        row.requested_at_estimated = est
                        upd_rv.append(row)
                    elif ev and ev > row.requested_at:  # re-request while the row stayed active
                        row.requested_at, row.requested_at_estimated = ev, False
                        upd_rv.append(row)
                for k, row in reviewers.get(pr.id, {}).items():
                    if row.is_active and k not in seen:
                        row.is_active, row.removed_at = False, now
                        upd_rv.append(row)
            for r in d.get('latest_reviews') or []:
                login = r.get('login') or ''
                if not login or not r.get('submitted_at'):
                    continue
                lk = login.strip().lower()
                row = reviews.get((pr.id, lk))
                if row is None:
                    row = PullRequestReview(pr=pr, login=login, login_key=lk, state=r['state'],
                                            submitted_at=_dt(r['submitted_at']))
                    reviews[(pr.id, lk)] = row
                    new_rw.append(row)
                else:
                    row.login, row.state, row.submitted_at = login, r['state'], _dt(r['submitted_at'])
                    if row.pk is not None:
                        upd_rw.append(row)
        PullRequestReviewer.objects.bulk_create(new_rv)
        PullRequestReviewer.objects.bulk_update(upd_rv, ['is_active', 'removed_at', 'requested_at', 'requested_at_estimated'])
        PullRequestReview.objects.bulk_create(new_rw)
        PullRequestReview.objects.bulk_update(upd_rw, ['login', 'state', 'submitted_at'])
    return res
