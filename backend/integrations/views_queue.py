from django.db.models import Max
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from api.decorators import api_view
from api.http import conditional_json_response, json_error

from .models import PullRequest, WatchedRepo
from .review_queue import build_queue


@api_view
@require_http_methods(['GET'])
def queue_list(request):
    login = (request.GET.get('login') or '').strip()
    if not login:
        return json_error('login is required', status=400, code='login_required')
    raw = request.GET.get('closedWithinDays', '7')
    try:
        days = int(raw)
    except ValueError:
        days = 0
    if not 1 <= days <= 30:
        return json_error('closedWithinDays must be an integer between 1 and 30', status=400,
                          code='invalid_closed_within_days')
    teams = [t.strip() for t in (request.GET.get('teams') or '').split(',') if t.strip()]
    teams = [t.lower() for t in teams]
    include_areas = 'areas' in (request.GET.get('include') or '').split(',')
    payload = build_queue(login, teams, days, include_areas, timezone.now())
    stamps = [PullRequest.objects.aggregate(m=Max('synced_at'))['m'],
              WatchedRepo.objects.aggregate(m=Max('last_attempt_at'))['m']]
    stamps = [s for s in stamps if s]
    return conditional_json_response(request, payload, last_modified=max(stamps) if stamps else None)
