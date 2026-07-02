import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from api.http import json_error, parse_json_body
from .models import ActivityLog
from .forms import ActivityLogForm


def serialize_activity(log):
    return {
        'id': str(log.id),
        'taskId': log.task_id,
        'actionType': log.action_type,
        'actorName': log.actor_name,
        'message': log.message,
        'createdAt': log.created_at.isoformat() if log.created_at else None,
    }


def map_body_to_model(body):
    return {
        'task_id': body.get('taskId') or body.get('task_id'),
        'action_type': body.get('actionType') or body.get('action_type'),
        'actor_name': body.get('actorName') or body.get('actor_name', 'NULL'),
        'message': body.get('message', ''),
    }


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def activity_list_create(request):
    if request.method == 'GET':
        logs = ActivityLog.objects.all()[:50]
        return JsonResponse([serialize_activity(log) for log in logs], safe=False)

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response

    form = ActivityLogForm(map_body_to_model(body))
    if not form.is_valid():
        return json_error('Validation failed', status=400, details={'fields': form.errors})

    log = form.save()
    return JsonResponse(serialize_activity(log), status=201)
