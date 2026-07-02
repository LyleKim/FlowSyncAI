import json

from django.http import JsonResponse

from .models import IdempotencyRecord

IDEMPOTENCY_HEADER = 'HTTP_IDEMPOTENCY_KEY'


def get_idempotency_key(request):
    return (request.META.get(IDEMPOTENCY_HEADER) or '').strip() or None


def get_stored_response(key, scope):
    try:
        record = IdempotencyRecord.objects.get(key=key, scope=scope)
    except IdempotencyRecord.DoesNotExist:
        return None
    return record.response_status, json.loads(record.response_body)


def store_idempotent_response(key, scope, status, body):
    IdempotencyRecord.objects.update_or_create(
        key=key,
        scope=scope,
        defaults={
            'response_status': status,
            'response_body': json.dumps(body, ensure_ascii=False),
        },
    )


def replay_idempotent_response(request, scope):
    """Idempotency-Key가 있고 저장된 응답이 있으면 JsonResponse를 반환."""
    key = get_idempotency_key(request)
    if not key:
        return None, None

    stored = get_stored_response(key, scope)
    if not stored:
        return None, key

    status, body = stored
    return JsonResponse(body, status=status), key


def finalize_idempotent_response(request, scope, key, status, body):
    """처리 결과를 저장하고 JsonResponse를 반환."""
    if key:
        store_idempotent_response(key, scope, status, body)
    return JsonResponse(body, status=status)
