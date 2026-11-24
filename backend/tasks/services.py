import json
import uuid
from collections import defaultdict

from django.db.models import Max

from reviews.models import RoleReview
from reviews.serializers import map_review_body_to_model
from reviews.forms import RoleReviewForm

from .models import Task, SubTask
from .forms import TaskForm, SubTaskForm
from .serializers import map_body_to_model_data, serialize_task


def tasks_for_kind(kind=None):
    qs = Task.objects.all()
    if kind == 'pr':
        return qs.filter(id__startswith='pr-')
    if kind == 'manual':
        return qs.exclude(id__startswith='pr-')
    return qs


def serialize_task_list(kind=None):
    tasks = list(tasks_for_kind(kind).prefetch_related('subtasks'))
    by_task = defaultdict(list)
    for review in RoleReview.objects.filter(task_id__in=[t.id for t in tasks]):
        by_task[review.task_id].append(review)
    return [serialize_task(task, by_task[task.id]) for task in tasks]


def get_tasks_last_modified(kind=None):
    """목록 캐시 검증용 Last-Modified (가장 최근 task.updated_at). 작업 없으면 None."""
    return tasks_for_kind(kind).aggregate(latest=Max('updated_at'))['latest']


def _normalize_roles_value(roles):
    if isinstance(roles, list):
        return json.dumps(roles, sort_keys=True)
    if isinstance(roles, str):
        try:
            return json.dumps(json.loads(roles or '[]'), sort_keys=True)
        except (TypeError, json.JSONDecodeError):
            return roles or '[]'
    return '[]'


def _normalized_subtasks(subtasks):
    return sorted(
        [
            {
                'id': item.get('id', ''),
                'title': item.get('title', ''),
                'completed': bool(item.get('completed', False)),
            }
            for item in (subtasks or [])
        ],
        key=lambda item: item['id'],
    )


def _existing_subtasks(task):
    return sorted(
        [
            {'id': subtask.id, 'title': subtask.title, 'completed': subtask.completed}
            for subtask in task.subtasks.all()
        ],
        key=lambda item: item['id'],
    )


def task_payload_matches(existing, body):
    """POST 재시도 시 동일 리소스인지 판별."""
    assignee = (body.get('assigneeId') or existing.creator or existing.assignee_id or '').strip()

    scalar_matches = all([
        existing.title == body.get('title', existing.title),
        existing.description == body.get('description', existing.description),
        existing.status == body.get('status', existing.status),
        existing.priority == body.get('priority', existing.priority),
        existing.category == body.get('category', existing.category),
        (existing.creator or '') == (assignee or existing.creator or ''),
        (existing.assignee_id or '') == (assignee or existing.assignee_id or ''),
    ])

    if not scalar_matches:
        return False

    if 'roles' in body:
        if _normalize_roles_value(existing.roles) != _normalize_roles_value(body.get('roles')):
            return False

    if 'subtasks' in body:
        if _existing_subtasks(existing) != _normalized_subtasks(body.get('subtasks')):
            return False

    return True


def _task_scalar_fields_changed(task, model_data):
    for field in (
        'title', 'description', 'creator', 'status', 'priority', 'category',
        'assignee_id', 'roles',
    ):
        if getattr(task, field) != model_data.get(field):
            return True
    return False


def save_subtasks(task, subtasks_data, *, replace=False):
    incoming_ids = []

    for subtask_data in subtasks_data or []:
        subtask_id = subtask_data.get('id') or f"sub-{uuid.uuid4().hex[:8]}"
        incoming_ids.append(subtask_id)

        try:
            subtask_instance = SubTask.objects.get(id=subtask_id, task=task)
        except SubTask.DoesNotExist:
            subtask_instance = None

        form = SubTaskForm(
            {
                'id': subtask_id,
                'task': task.id,
                'title': subtask_data.get('title', ''),
                'completed': subtask_data.get('completed', False),
            },
            instance=subtask_instance,
        )
        if not form.is_valid():
            return form.errors
        form.save()

    if replace:
        task.subtasks.exclude(id__in=incoming_ids).delete()

    return None


def subtask_payload_matches(existing, body):
    """POST 재시도 시 동일 리소스인지 판별."""
    return (
        existing.title == body.get('title', existing.title)
        and existing.completed == body.get('completed', existing.completed)
    )


def create_subtask_from_body(task, body):
    """
    하위 작업 생성.
    반환: (subtask, errors, outcome)
    outcome: 'created' | 'replayed' | None(실패)
    """
    subtask_id = (body.get('id') or '').strip()
    if subtask_id:
        existing = SubTask.objects.filter(pk=subtask_id, task=task).first()
        if existing:
            if subtask_payload_matches(existing, body):
                return existing, None, 'replayed'
            return None, {
                'id': ['동일 ID의 하위 작업이 이미 다른 내용으로 존재합니다.']
            }, None

    form = SubTaskForm({
        'id': subtask_id or f"sub-{uuid.uuid4().hex[:8]}",
        'task': task.id,
        'title': body.get('title', ''),
        'completed': body.get('completed', False),
    })
    if not form.is_valid():
        return None, form.errors, None

    return form.save(), None, 'created'


def update_subtask_from_body(subtask, body):
    """하위 작업 수정(PATCH). 자신의 필드만 다룬다."""
    form = SubTaskForm(
        {
            'id': subtask.id,
            'task': subtask.task_id,
            'title': body.get('title', subtask.title),
            'completed': body.get('completed', subtask.completed),
        },
        instance=subtask,
    )
    if not form.is_valid():
        return None, form.errors

    return form.save(), None


def save_role_reviews(task, reviews_data):
    for review_data in reviews_data or []:
        review_id = review_data.get('id') or f"rev-{uuid.uuid4().hex[:8]}"
        review_data = {**review_data, 'id': review_id, 'taskId': task.id}

        try:
            review_instance = RoleReview.objects.get(id=review_id)
        except RoleReview.DoesNotExist:
            review_instance = None

        form = RoleReviewForm(
            map_review_body_to_model(review_data, instance=review_instance),
            instance=review_instance,
        )
        if not form.is_valid():
            return form.errors
        form.save()

    return None


def create_task_from_body(body):
    """
    작업 생성.
    반환: (task, errors, outcome)
    outcome: 'created' | 'replayed' | None(실패)
    """
    task_id = (body.get('id') or '').strip()
    if task_id:
        existing = Task.objects.prefetch_related('subtasks').filter(pk=task_id).first()
        if existing:
            if task_payload_matches(existing, body):
                return existing, None, 'replayed'
            return None, {
                'id': ['동일 ID의 작업이 이미 다른 내용으로 존재합니다.']
            }, None

    model_data = map_body_to_model_data(body)
    form = TaskForm(model_data)
    if not form.is_valid():
        return None, form.errors, None

    task = form.save()

    subtask_errors = save_subtasks(task, body.get('subtasks', []))
    if subtask_errors:
        task.delete()
        return None, subtask_errors, None

    if 'roleReviews' in body:
        review_errors = save_role_reviews(task, body.get('roleReviews', []))
        if review_errors:
            task.delete()
            return None, review_errors, None

    return task, None, 'created'


def update_task_from_body(task, body):
    """
    작업 수정(PATCH).
    Task 자신의 필드만 다룬다. 하위 작업/검토 기록은 각자의 리소스 엔드포인트
    (/tasks/<id>/subtasks/, /tasks/<id>/reviews/)를 통해 관리한다.
    동일 요청 재전송 시 불필요한 DB 쓰기를 건너뛰어 멱등하게 동작.
    """
    model_data = map_body_to_model_data(body, instance=task)

    if not _task_scalar_fields_changed(task, model_data):
        return task, None

    form = TaskForm(model_data, instance=task)
    if not form.is_valid():
        return None, form.errors

    return form.save(), None
