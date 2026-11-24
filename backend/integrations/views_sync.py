from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import json_error, parse_json_body

from .pr_sync import sync_repos


@api_view
@require_http_methods(['POST'])
def sync_prs(request):
    body, error_response = parse_json_body(request)
    if error_response:
        return json_error('Invalid JSON', status=400, code='invalid_json')
    if not isinstance(body, dict):
        return json_error('Invalid JSON', status=400, code='invalid_json')
    repo_id = body.get('repoId')
    if repo_id is not None and (isinstance(repo_id, bool) or not isinstance(repo_id, int)):
        return json_error('repoId must be an integer', status=400, code='invalid_repo_id')
    return JsonResponse(sync_repos(repo_id))
