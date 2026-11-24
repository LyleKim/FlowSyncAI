import json
import uuid

from reviews.models import RoleReview
from reviews.serializers import serialize_review


def _parse_roles(raw_roles):
    if isinstance(raw_roles, list):
        return raw_roles
    if not raw_roles:
        return []
    try:
        parsed = json.loads(raw_roles)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def serialize_subtask(subtask):
    return {'id': subtask.id, 'title': subtask.title, 'completed': subtask.completed}


def task_kind(task):
    # id 접두사가 유일한 기준 (수동 작업이 PR URL을 sourceUrl로 가져도 manual)
    return 'pr' if task.id.startswith('pr-') else 'manual'


def serialize_task(task, reviews=None):
    """프론트엔드 Task 타입(camelCase)에 맞춘 직렬화."""
    if reviews is None:
        reviews = list(RoleReview.objects.filter(task_id=task.id))
    latest_review_at = max((r.created_at for r in reviews), default=None)

    # "미반영 검토 존재 여부"는 저장된 플래그가 아니라, 가장 최근 리뷰 시각과
    # 체크리스트를 마지막으로 (재)생성한 시각을 비교해서 그때그때 계산한다.
    has_unreflected_review = bool(
        latest_review_at
        and (not task.checklist_generated_at or latest_review_at > task.checklist_generated_at)
    )

    is_pr = task_kind(task) == 'pr'

    return {
        'id': task.id,
        'title': task.title,
        'description': task.description,
        'status': task.status,
        'priority': task.priority,
        'category': task.category,
        # PR Task: 작성자 != 담당자 (작성자는 author)
        'assigneeId': (task.assignee_id or '') if is_pr else (task.creator or task.assignee_id),
        'kind': 'pr' if is_pr else 'manual',
        'author': (task.creator or '') if is_pr else None,
        'subtasks': [serialize_subtask(subtask) for subtask in task.subtasks.all()],
        'createdAt': task.created_at.isoformat() if task.created_at else None,
        'roles': _parse_roles(task.roles),
        'sourceUrl': task.source_url,
        'roleReviews': [serialize_review(review) for review in reviews],
        'hasUnreflectedReview': has_unreflected_review,
        'lastReviewAddedAt': latest_review_at.isoformat() if latest_review_at else None,
    }


def map_body_to_model_data(body, instance=None):
    """프론트엔드 camelCase 요청을 Django 모델 필드로 변환."""
    assignee = body.get('assigneeId')
    if assignee is None and instance:
        # PR Task의 creator는 작성자이므로 담당자 폴백으로 쓰지 않는다
        assignee = (
            instance.assignee_id if task_kind(instance) == 'pr'
            else instance.creator or instance.assignee_id
        )
    assignee = (assignee or '').strip()

    # PR 작성자(creator)는 Task API로 바뀌지 않는다
    pr_instance = instance is not None and task_kind(instance) == 'pr'

    data = {
        'id': body.get('id') or (instance.id if instance else f"task-{uuid.uuid4().hex[:8]}"),
        'title': body.get('title', instance.title if instance else ''),
        'description': body.get('description', instance.description if instance else ''),
        'creator': instance.creator if pr_instance else (
            assignee or (instance.creator if instance else 'Unknown')),
        'status': body.get('status', instance.status if instance else 'todo'),
        'priority': body.get('priority', instance.priority if instance else 'medium'),
        'category': body.get('category', instance.category if instance else ''),
        'assignee_id': assignee or (instance.assignee_id if instance else ''),
    }

    if 'roles' in body:
        data['roles'] = json.dumps(body['roles'] if body['roles'] is not None else [])
    elif instance:
        data['roles'] = instance.roles
    else:
        data['roles'] = '[]'

    return data
