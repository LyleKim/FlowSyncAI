import time

from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from ai_services.services import groq_api_key
from api.decorators import api_view
from api.http import conditional_json_response, json_error, parse_json_body
from api.idempotency import finalize_idempotent_response, replay_idempotent_response

from . import areas, folders
from .architecture import group_paths
from .github_client import GitHubError
from .models import FolderDescription
from .views_aliases import _repo_or_404

DESCRIBE_INTERVAL = 120  # seconds; also covers an in-flight run (worst case 4 batches x 30s timeout)


def _paths(repo, refresh=False):
    try:
        return areas.get_paths(repo.owner, repo.name, refresh), None
    except GitHubError as e:
        return None, json_error(f'GitHub request failed: {e.message}', status=502, code='github_unavailable')


@api_view
@require_http_methods(['GET'])
def folder_tree(request, repo_id):
    repo, err = _repo_or_404(repo_id)
    if err:
        return err
    paths, err = _paths(repo, request.GET.get('refresh') == '1')
    if err:
        return err
    descs = {d.path: d for d in repo.folder_descriptions.all()}
    return conditional_json_response(request, {
        'repoId': repo.id, 'treeHash': folders.tree_hash(paths),
        **folders.build_tree(paths, group_paths(paths), descs, repo.name),
    })


@api_view
@require_http_methods(['POST'])
def describe(request, repo_id):
    repo, err = _repo_or_404(repo_id)
    if err:
        return err
    body, error_response = parse_json_body(request)
    if error_response or not isinstance(body, dict):
        return json_error('Invalid JSON', status=400, code='invalid_json')
    scope = f'integrations:describe:POST:{repo.id}'
    replay_response, key = replay_idempotent_response(request, scope)
    if replay_response:
        return replay_response
    if not groq_api_key():
        return json_error('AI is not configured (GROQ_API_KEY missing)', status=503, code='ai_unavailable')

    lock = f'describe:{repo.id}'
    # ponytail: per-process cache lock (locmem); use a DB claim like pr_sync if run with several workers
    if not cache.add(lock, time.time(), DESCRIBE_INTERVAL):
        since = time.time() - (cache.get(lock) or time.time())
        return json_error('Describe was run recently', status=429, code='describe_throttled',
                          retryAfterSeconds=max(1, int(DESCRIBE_INTERVAL - since)))
    paths, err = _paths(repo)
    if err:
        cache.delete(lock)
        return err
    out = folders.describe_repo(repo, paths, group_paths(paths), force=body.get('force') is True)
    if out['failed'] and not out['generated']:
        cache.delete(lock)
        return json_error('AI description failed', status=502, code='ai_failed', failed=out['failed'])
    return finalize_idempotent_response(request, scope, key, 200, out)


@api_view
@require_http_methods(['PATCH', 'DELETE'])
def folder_description(request, repo_id):
    repo, err = _repo_or_404(repo_id)
    if err:
        return err
    if request.method == 'DELETE':
        path = (request.GET.get('path') or '').strip().strip('/')
        deleted, _ = FolderDescription.objects.filter(repo=repo, path=path).delete()
        if not deleted:
            return json_error('No description for this folder', status=404, code='description_not_found')
        return HttpResponse(status=204)

    body, error_response = parse_json_body(request)
    if error_response or not isinstance(body, dict):
        return json_error('Invalid JSON', status=400, code='invalid_json')
    path = body.get('path')
    path = path.strip().strip('/') if isinstance(path, str) else ''
    text = body.get('text')
    text = ' '.join(text.split()) if isinstance(text, str) else ''
    if not 0 < len(text) <= folders.TEXT_MAX:
        return json_error(f'text must be 1-{folders.TEXT_MAX} characters', status=400, code='invalid_text')
    paths, err = _paths(repo)
    if err:
        return err
    if not folders.is_folder(paths, path):
        return json_error('Folder not found in the current tree', status=404, code='folder_not_found')
    d, _ = FolderDescription.objects.update_or_create(repo=repo, path=path, defaults={
        'text': text, 'source': 'manual', 'tree_hash': folders.tree_hash(paths),
        'generated_at': timezone.now(), 'model': ''})
    return JsonResponse({'path': path, 'description': folders.serialize_description(d)})
