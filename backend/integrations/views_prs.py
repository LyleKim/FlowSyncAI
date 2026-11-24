from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import json_error, parse_json_body
from api.idempotency import finalize_idempotent_response, replay_idempotent_response

from .github_client import parse_repo_url
from .models import WatchedRepo
from .pr_sync import iso_z, serialize_repo_status

SCOPE = 'integrations:watched-repos:POST'


def serialize_repo(repo):
    st = serialize_repo_status(repo)
    return {
        'id': repo.id,
        'url': repo.url,
        'owner': repo.owner,
        'name': repo.name,
        'githubLogin': repo.github_login,
        'lastSyncedAt': st['lastSuccessAt'],  # legacy alias of lastSuccessAt
        'lastAttemptAt': st['lastAttemptAt'],
        'lastSuccessAt': st['lastSuccessAt'],
        'lastError': st['lastError'],
        'truncated': st['truncated'],
        'createdAt': iso_z(repo.created_at),
        'updatedAt': iso_z(repo.updated_at),
    }


@api_view
@require_http_methods(['GET', 'POST'])
def watched_repo_list_create(request):
    if request.method == 'GET':
        return JsonResponse([serialize_repo(r) for r in WatchedRepo.objects.order_by('id')], safe=False)

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response
    if not isinstance(body, dict):
        return json_error('Invalid JSON', status=400)

    replay_response, key = replay_idempotent_response(request, SCOPE)
    if replay_response:
        return replay_response

    try:
        owner, name = parse_repo_url(body.get('url'))
    except ValueError as e:
        return json_error(str(e), status=400, code='invalid_url')
    url = f'https://github.com/{owner}/{name}'
    login = str(body.get('githubLogin') or '').strip()

    try:
        with transaction.atomic():
            repo = WatchedRepo.objects.create(url=url, owner=owner, name=name, github_login=login)
    except IntegrityError:
        existing = WatchedRepo.objects.get(url=url)
        return json_error('Repository already watched', status=409,
                          code='already_connected', existing=serialize_repo(existing))
    return finalize_idempotent_response(request, SCOPE, key, 201, serialize_repo(repo))


@api_view
@require_http_methods(['DELETE'])
def watched_repo_detail(request, pk):
    get_object_or_404(WatchedRepo, pk=pk).delete()
    return HttpResponse(status=204)

