from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import conditional_json_response, json_error

from . import areas
from .architecture import group_paths
from .folders import serialize_description
from .github_client import GitHubError
from .models import WatchedRepo


def _descs(repo):
    return {d.path: d for d in repo.folder_descriptions.all()}


def _context(request, repo_id):
    """-> (ctx, error_response). ctx = repo, days, groups, activity payload."""
    try:
        repo = WatchedRepo.objects.get(pk=repo_id)
    except WatchedRepo.DoesNotExist:
        return None, json_error('Repository not found', status=404, code='repo_not_found')
    try:
        days = min(180, max(7, int(request.GET.get('days', 30))))
    except ValueError:
        return None, json_error('days must be an integer', status=400, code='invalid_days')
    refresh = request.GET.get('refresh') == '1'
    try:
        activity, paths = areas.get_activity(repo, days, refresh)
        groups = group_paths(paths)
    except GitHubError as e:
        return None, json_error(f'GitHub request failed: {e.message}', status=502, code='github_unavailable')
    return (repo, days, groups, activity), None


def _area(data, group, aliases, waiting, descs):
    prefix = areas.path_prefix(group)
    alias = aliases.get(prefix)
    return {
        'description': serialize_description(descs.get(prefix)) if group.prefix else None,
        **{k: v for k, v in data.items() if k != 'recentCommits'},
        'displayName': alias.display_name if alias else data['name'],
        'alias': {'id': alias.id, 'displayName': alias.display_name,
                  'updatedAt': areas.iso_z(alias.updated_at)} if alias else None,
        'pathPrefix': prefix,
        'reviewWaiting': waiting.get(group.id, {'prCount': 0, 'oldestRequestedAt': None}),
    }


@api_view
@require_http_methods(['GET'])
def area_list(request, repo_id):
    ctx, err = _context(request, repo_id)
    if err:
        return err
    repo, days, groups, activity = ctx
    by_id = {g.id: g for g in groups}
    aliases = {a.path_prefix: a for a in repo.area_aliases.all()}
    waiting = areas.review_waiting_by_area(repo, groups, timezone.now())
    descs = _descs(repo)
    return conditional_json_response(request, {
        'repoId': repo.id, 'generatedAt': activity['generatedAt'], 'days': days,
        'truncated': activity['truncated'], 'analyzedCommits': activity['analyzedCommits'],
        'areas': [_area(d, by_id[d['id']], aliases, waiting, descs)
                  for d in activity['groups'] if d['id'] in by_id],
        'couplings': activity['couplings'],
    })


@api_view
@require_http_methods(['GET'])
def area_detail(request, repo_id, area_id):
    ctx, err = _context(request, repo_id)
    if err:
        return err
    repo, days, groups, activity = ctx
    data = next((d for d in activity['groups'] if d['id'] == area_id), None)
    group = next((g for g in groups if g.id == area_id), None)
    if data is None or group is None:
        return json_error('Area not found', status=404, code='area_not_found')
    now = timezone.now()
    aliases = {a.path_prefix: a for a in repo.area_aliases.all()}
    waiting = areas.review_waiting_by_area(repo, groups, now)
    return conditional_json_response(request, {
        **_area(data, group, aliases, waiting, _descs(repo)),
        'recentCommits': data['recentCommits'],
        'waitingPullRequests': areas.waiting_prs_for_area(repo, groups, area_id, now),
        'coupledWith': [{'areaId': c['b'] if c['a'] == area_id else c['a'], 'count': c['count']}
                        for c in activity['couplings'] if area_id in (c['a'], c['b'])],
    })
