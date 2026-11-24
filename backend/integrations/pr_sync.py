import logging
from datetime import timedelta, timezone as dt_tz

from django.db.models import Q
from django.utils import timezone

from . import github_client
from .models import WatchedRepo
from .pr_ingest import ingest_prs, tracked_open_numbers
from .task_mirror import mirror_repo

logger = logging.getLogger(__name__)

MIN_INTERVAL = timedelta(seconds=30)


def iso_z(dt):
    """UTC `YYYY-MM-DDTHH:MM:SSZ` (contract format); None passes through."""
    return dt.astimezone(dt_tz.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if dt else None


def serialize_repo_status(repo):
    err = None
    if repo.last_error_kind:
        err = {'kind': repo.last_error_kind, 'message': repo.last_error_message,
               'resetAt': iso_z(repo.last_error_reset_at)}
    return {'repoId': repo.id, 'repo': str(repo), 'lastAttemptAt': iso_z(repo.last_attempt_at),
            'lastSuccessAt': iso_z(repo.last_synced_at), 'lastError': err, 'truncated': repo.truncated}


def _sync_one(repo, now):
    """-> (created, skipped); raises GitHubError. Failure leaves PR data and last_synced_at alone."""
    data = github_client.fetch_repo_pull_requests(
        repo.owner, repo.name, tracked_open=tracked_open_numbers(repo))
    res = ingest_prs(repo, data['prs'], now)
    WatchedRepo.objects.filter(pk=repo.pk).filter(  # never move lastSuccessAt backwards
        Q(last_synced_at__isnull=True) | Q(last_synced_at__lt=now)).update(
        last_synced_at=now)
    WatchedRepo.objects.filter(pk=repo.pk).update(
        last_error_kind='', last_error_message='', last_error_reset_at=None,
        truncated=bool(data['truncated']))
    try:  # legacy kanban mirror: its failure must not undo the ingest or last_synced_at
        mirror_repo(repo)
    except Exception:
        logger.exception('task mirror failed for %s', repo)
    return res.created, res.updated


def sync_repos(repo_id=None, now=None):
    now = now or timezone.now()
    out = {'created': 0, 'skipped': 0, 'errors': [], 'throttled': [], 'repos': []}
    repos = WatchedRepo.objects.order_by('id')
    if repo_id is not None:
        repos = repos.filter(pk=repo_id)
    for repo in repos:
        # atomic claim: the DB serializes concurrent callers, only one wins per interval
        claimed = WatchedRepo.objects.filter(pk=repo.pk).filter(
            Q(last_attempt_at__isnull=True) | Q(last_attempt_at__lt=now - MIN_INTERVAL)
        ).update(last_attempt_at=now)
        if not claimed:
            out['throttled'].append(repo.id)
        else:
            try:
                created, skipped = _sync_one(repo, now)
                out['created'] += created
                out['skipped'] += skipped
            except Exception as e:  # one repo must never break the call
                err = e if isinstance(e, github_client.GitHubError) else github_client.GitHubError(
                    0, str(e) or e.__class__.__name__)
                WatchedRepo.objects.filter(pk=repo.pk).update(
                    last_error_kind=err.kind, last_error_message=err.message, last_error_reset_at=err.reset_at)
                out['errors'].append(f'{repo}: {err.message}')
        try:
            repo.refresh_from_db()
        except WatchedRepo.DoesNotExist:  # deleted mid-sync
            continue
        out['repos'].append(serialize_repo_status(repo))
    return out


def sync_review_requests():
    return sync_repos()
