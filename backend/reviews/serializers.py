import uuid

from .models import RoleReview


def map_review_body_to_model(body, instance=None):
    return {
        'id': body.get('id') or (instance.id if instance else f"rev-{uuid.uuid4().hex[:8]}"),
        'task_id': body.get('taskId') or body.get('task_id') or (instance.task_id if instance else ''),
        'role': body.get('role', instance.role if instance else ''),
        'reviewer_name': body.get('reviewer_name', instance.reviewer_name if instance else ''),
        'reviewer_id': body.get('reviewerId') or body.get('reviewer_id') or (instance.reviewer_id if instance else ''),
        'comment': body.get('comment', instance.comment if instance else ''),
        'is_accepted': body.get('isAccepted', body.get('is_accepted', instance.is_accepted if instance else False)),
        'accepted_at': body.get('acceptedAt', body.get('accepted_at', instance.accepted_at if instance else '')),
        'urgency': body.get('urgency', instance.urgency if instance else 'normal'),
        'next_reviewer_tag': body.get('nextReviewerTag', body.get('next_reviewer_tag', instance.next_reviewer_tag if instance else '')),
    }


def serialize_review(review):
    return {
        'id': review.id,
        'role': review.role,
        'comment': review.comment,
        'reviewerId': review.reviewer_id or review.reviewer_name,
        'isAccepted': review.is_accepted,
        'acceptedAt': review.accepted_at or None,
        'urgency': review.urgency,
        'nextReviewerTag': review.next_reviewer_tag or None,
        'createdAt': review.created_at.isoformat() if review.created_at else None,
    }


def review_payload_matches(existing, body):
    model_data = map_review_body_to_model(body, instance=existing)
    for field, value in model_data.items():
        if getattr(existing, field) != value:
            return False
    return True


def _review_fields_changed(review, model_data):
    for field, value in model_data.items():
        if getattr(review, field) != value:
            return True
    return False


def create_review_from_body(body):
    """
    검토 생성.
    반환: (review, errors, outcome)
    outcome: 'created' | 'replayed' | None(실패)
    """
    from .forms import RoleReviewForm

    review_id = (body.get('id') or '').strip()
    if review_id:
        existing = RoleReview.objects.filter(pk=review_id).first()
        if existing:
            if review_payload_matches(existing, body):
                return existing, None, 'replayed'
            return None, {
                'id': ['동일 ID의 검토가 이미 다른 내용으로 존재합니다.']
            }, None

    form = RoleReviewForm(map_review_body_to_model(body))
    if not form.is_valid():
        return None, form.errors, None

    return form.save(), None, 'created'


def update_review_from_body(review, body):
    from .forms import RoleReviewForm

    model_data = map_review_body_to_model(body, instance=review)
    if not _review_fields_changed(review, model_data):
        return review, None

    form = RoleReviewForm(model_data, instance=review)
    if not form.is_valid():
        return None, form.errors

    return form.save(), None
