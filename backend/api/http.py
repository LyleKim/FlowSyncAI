import json
from django.http import JsonResponse


def json_error(message, status=400, **details):
    payload = {'error': message}
    if details:
        payload.update(details)
    return JsonResponse(payload, status=status)


def parse_json_body(request):
    try:
        return json.loads(request.body or b'{}'), None
    except json.JSONDecodeError:
        return None, json_error('Invalid JSON', status=400)


def method_not_allowed():
    return json_error('Method not allowed', status=405)
