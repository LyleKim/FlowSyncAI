from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.shortcuts import get_object_or_404

from api.http import json_error, parse_json_body
from api.idempotency import finalize_idempotent_response, replay_idempotent_response
from .models import RoleReview
from .serializers import (
    serialize_review,
    create_review_from_body,
    update_review_from_body,
)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def review_list_create(request):
    if request.method == 'GET':
        task_id = request.GET.get('task_id') or request.GET.get('taskId')
        reviews = RoleReview.objects.all()
        if task_id:
            reviews = reviews.filter(task_id=task_id)
        return JsonResponse([serialize_review(review) for review in reviews], safe=False)

    replay_response, idempotency_key = replay_idempotent_response(request, 'reviews:POST')
    if replay_response:
        return replay_response

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response

    review, errors, outcome = create_review_from_body(body)
    if errors:
        status = 409 if (body.get('id') and RoleReview.objects.filter(pk=body['id']).exists()) else 400
        return json_error('Validation failed', status=status, details={'fields': errors})

    response_body = serialize_review(review)
    status = 201 if outcome == 'created' else 200
    return finalize_idempotent_response(
        request, 'reviews:POST', idempotency_key, status, response_body
    )


@csrf_exempt
@require_http_methods(['GET', 'PATCH', 'PUT', 'DELETE'])
def review_detail(request, pk):
    review = get_object_or_404(RoleReview, pk=pk)

    if request.method == 'GET':
        return JsonResponse(serialize_review(review))

    if request.method == 'DELETE':
        review.delete()
        return JsonResponse({'message': 'Review deleted successfully'}, status=200)

    body, error_response = parse_json_body(request)
    if error_response:
        return error_response

    updated_review, errors = update_review_from_body(review, body)
    if errors:
        return json_error('Validation failed', status=400, details={'fields': errors})

    return JsonResponse(serialize_review(updated_review))
