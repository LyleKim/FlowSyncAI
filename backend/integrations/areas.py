"""Area helpers: cached repo tree -> groups, path-prefix identity, alias status."""
import json
from collections import Counter

from django.core.cache import cache
from django.db.models import Prefetch

from . import github_client
from .activity import compute_activity
from .architecture import Locator, group_paths
from .models import PullRequest, PullRequestReviewer
from .pr_sync import iso_z

CACHE_SECONDS = 300


def get_paths(owner, name, refresh=False):
    key = f'tree:{owner.lower()}/{name.lower()}'
    paths = None if refresh else cache.get(key)
    if paths is None:
        paths = github_client.list_repo_tree(owner, name)  # GitHubError propagates
        cache.set(key, paths, CACHE_SECONDS)
    return paths


def get_groups(owner, name, refresh=False):
    return group_paths(get_paths(owner, name, refresh))


def path_prefix(group):
    return '/'.join(group.prefix) if group.prefix else '@' + group.id


def alias_status(aliases, groups):
    if groups is None:
        return {a.id: 'unknown' for a in aliases}
    prefixes = {path_prefix(g) for g in groups}
    return {a.id: 'connected' if a.path_prefix in prefixes else 'disconnected' for a in aliases}


def serialize_alias(alias, status):
    return {'id': alias.id, 'repoId': alias.repo_id, 'pathPrefix': alias.path_prefix,
            'displayName': alias.display_name, 'status': status,
            'createdAt': iso_z(alias.created_at), 'updatedAt': iso_z(alias.updated_at)}


# ---- PR files -> areas -------------------------------------------------------------------------

def pr_files(pr):
    try:
        files = json.loads(pr.files or '[]')
    except ValueError:
        return []
    return files if isinstance(files, list) else []


def map_pr_files(groups, files, locate=None):
    """-> {'primaryAreaId', 'touched': [{'areaId','fileCount'}], 'unmapped'}. `locate` may be a prebuilt Locator."""
    locate = locate or Locator(groups)
    counts, unmapped = Counter(), 0
    for f in files:
        gid = locate(f)
        if gid:
            counts[gid] += 1
        else:
            unmapped += 1
    touched = [{'areaId': g, 'fileCount': n} for g, n in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]
    return {'primaryAreaId': touched[0]['areaId'] if touched else None, 'touched': touched, 'unmapped': unmapped}


def _open_prs_with_active_reviewers(repo):
    return (PullRequest.objects.filter(repo=repo, state='open', reviewers__is_active=True).distinct()
            .prefetch_related(Prefetch('reviewers', PullRequestReviewer.objects.filter(is_active=True),
                                       to_attr='active_reviewers')))


def _oldest(pr):
    return min(r.requested_at for r in pr.active_reviewers)


def review_waiting_by_area(repo, groups, now):
    """area id -> {'prCount','oldestRequestedAt'}; each open non-draft PR with an active reviewer counts once,
    in its primary area."""
    locate, out = Locator(groups), {}
    for pr in _open_prs_with_active_reviewers(repo).filter(is_draft=False):
        primary = map_pr_files(groups, pr_files(pr), locate)['primaryAreaId']
        if primary is None:
            continue
        cur = out.setdefault(primary, {'prCount': 0, 'oldestRequestedAt': None})
        cur['prCount'] += 1
        at = _oldest(pr)
        if cur['oldestRequestedAt'] is None or at < cur['oldestRequestedAt']:
            cur['oldestRequestedAt'] = at
    return {k: {'prCount': v['prCount'], 'oldestRequestedAt': iso_z(v['oldestRequestedAt'])}
            for k, v in out.items()}


def display_names(repo, groups):
    """area id -> alias display name, else the group's name."""
    by_prefix = {a.path_prefix: a for a in repo.area_aliases.all()}
    return {g.id: by_prefix[path_prefix(g)].display_name if path_prefix(g) in by_prefix else g.name
            for g in groups}


def waiting_prs_for_area(repo, groups, area_id, now):
    """Open PRs with an active reviewer that touch `area_id` (any role, drafts included)."""
    locate, names, out = Locator(groups), display_names(repo, groups), []
    for pr in _open_prs_with_active_reviewers(repo):
        m = map_pr_files(groups, pr_files(pr), locate)
        if not any(t['areaId'] == area_id for t in m['touched']):
            continue
        out.append((_oldest(pr), pr.number, {
            'repo': f'{repo.owner}/{repo.name}', 'number': pr.number, 'title': pr.title, 'url': pr.url,
            'author': pr.author, 'isDraft': pr.is_draft,
            'requestedReviewers': sorted(r.login or r.team_slug for r in pr.active_reviewers),
            'oldestRequestedAt': iso_z(_oldest(pr)),
            'size': {'additions': pr.additions, 'deletions': pr.deletions, 'changedFiles': pr.changed_files},
            'primaryAreaId': m['primaryAreaId'], 'isPrimary': m['primaryAreaId'] == area_id,
            'touchedAreas': [{'areaId': t['areaId'], 'displayName': names[t['areaId']],
                              'fileCount': t['fileCount']} for t in m['touched']],
            'unmapped': m['unmapped'], 'filesTruncated': pr.files_truncated,
        }))
    return [item for _, _, item in sorted(out, key=lambda x: x[:2])]


def get_activity(repo, days, refresh=False):
    """5-min cached compute_activity -> (payload, paths). Cached together with the tree it was computed from,
    so groups derived from `paths` always match payload ids even if the tree cache expires independently."""
    key = f'areas-activity:{repo.owner.lower()}/{repo.name.lower()}:{days}'
    hit = None if refresh else cache.get(key)
    if hit is None:
        paths = get_paths(repo.owner, repo.name, refresh)
        hit = {'paths': paths, 'payload': compute_activity(repo.owner, repo.name, days, paths=paths)}
        cache.set(key, hit, CACHE_SECONDS)
    return hit['payload'], hit['paths']
