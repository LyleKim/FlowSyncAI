from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import json_error, parse_json_body
from api.idempotency import finalize_idempotent_response, replay_idempotent_response

from . import areas
from .github_client import GitHubError
from .models import AreaAlias, WatchedRepo
from .pr_sync import iso_z


def _repo_or_404(repo_id):
    try:
        return WatchedRepo.objects.get(pk=repo_id), None
    except WatchedRepo.DoesNotExist:
        return None, json_error('Repository not found', status=404, code='repo_not_found')


def _groups(repo):
    try:
        return areas.get_groups(repo.owner, repo.name)
    except GitHubError:
        return None  # tree unreadable -> status 'unknown', never a failure


def _one(alias, groups):
    return areas.serialize_alias(alias, areas.alias_status([alias], groups)[alias.id])


def _name(body):
    n = body.get('displayName')
    n = n.strip() if isinstance(n, str) else ''
    return n if 0 < len(n) <= 80 else None


@api_view
@require_http_methods(['GET', 'POST'])
def alias_list_create(request, repo_id):
    repo, err = _repo_or_404(repo_id)
    if err:
        return err
    if request.method == 'GET':
        items = list(repo.area_aliases.order_by('id'))
        st = areas.alias_status(items, _groups(repo))
        return JsonResponse([areas.serialize_alias(a, st[a.id]) for a in items], safe=False)

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response
    if not isinstance(body, dict):
        return json_error('Invalid JSON', status=400)
    scope = f'integrations:area-aliases:POST:{repo.id}'
    replay_response, key = replay_idempotent_response(request, scope)
    if replay_response:
        return replay_response

    prefix = body.get('pathPrefix')
    prefix = prefix.strip().strip('/').strip() if isinstance(prefix, str) else ''
    if not prefix or len(prefix) > 300:
        return json_error('pathPrefix is required', status=400, code='invalid_path_prefix')
    name = _name(body)
    if name is None:
        return json_error('displayName must be 1-80 characters', status=400, code='invalid_name')

    groups = _groups(repo)
    try:
        with transaction.atomic():
            alias = AreaAlias.objects.create(repo=repo, path_prefix=prefix, display_name=name)
    except IntegrityError:
        existing = AreaAlias.objects.get(repo=repo, path_prefix=prefix)
        return json_error('Alias already exists for this path', status=409,
                          code='alias_exists', existing=_one(existing, groups))
    return finalize_idempotent_response(request, scope, key, 201, _one(alias, groups))


@api_view
@require_http_methods(['PATCH', 'DELETE'])
def alias_detail(request, repo_id, alias_id):
    repo, err = _repo_or_404(repo_id)
    if err:
        return err
    alias = get_object_or_404(AreaAlias, pk=alias_id, repo=repo)
    if request.method == 'DELETE':
        alias.delete()
        return HttpResponse(status=204)

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response
    if not isinstance(body, dict):
        return json_error('Invalid JSON', status=400)
    expected = body.get('expectedUpdatedAt')
    # exact match of the serialized (second-precision Z) string the client echoes back
    if expected is not None and expected != iso_z(alias.updated_at):
        return json_error('Alias was modified', status=409, code='conflict', current=_one(alias, _groups(repo)))
    name = _name(body)
    if name is None:
        return json_error('displayName must be 1-80 characters', status=400, code='invalid_name')
    alias.display_name = name
    alias.save()
    return JsonResponse(_one(alias, _groups(repo)))
