from django.core.cache import cache
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import conditional_json_response, json_error

from . import github_client
from . import areas
from .activity import compute_activity

CACHE_SECONDS = 300


@api_view
@require_http_methods(['GET'])
def architecture(request):
    url = request.GET.get('url', '')
    try:
        owner, name = github_client.parse_repo_url(url)
    except ValueError as e:
        return json_error(str(e) if url else 'url is required', status=400)
    try:
        days = min(180, max(7, int(request.GET.get('days', 30))))
    except ValueError:
        return json_error('days must be an integer', status=400)

    key = f'arch:{owner.lower()}/{name.lower()}:{days}'
    payload = None if request.GET.get('refresh') == '1' else cache.get(key)
    if payload is None:
        try:
            payload = compute_activity(owner, name, days, paths=areas.get_paths(owner, name, refresh=request.GET.get('refresh') == '1'))
        except github_client.GitHubError as e:
            if e.status == 404:
                return json_error('Repository not found (or private; set GITHUB_TOKEN)', status=404)
            return json_error(f'GitHub request failed: {e.message}', status=502)
        payload = {'repo': {'owner': owner, 'name': name, 'url': f'https://github.com/{owner}/{name}'}, **payload}
        cache.set(key, payload, CACHE_SECONDS)
    return conditional_json_response(request, payload)
