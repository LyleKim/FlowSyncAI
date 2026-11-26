"""Legacy compat layer (removed in Task 13): mirrors PRs onto the old kanban Task cards."""
from django.db import transaction
from django.db.models import Q

from tasks.models import Task

from .models import PullRequest, SeenPullRequest

DRAFT = ' (draft)'


def mirror_repo(repo):
    login = (repo.github_login or '').strip().lower()
    if not login:
        return
    seen = set(repo.seen_prs.values_list('number', flat=True))
    mine = Q(reviewers__is_active=True, reviewers__login_key=login, reviewers__team_slug='')
    for pr in repo.prs.filter(mine | Q(number__in=seen)).distinct():
        tid = f'pr-{repo.owner}-{repo.name}-{pr.number}'
        if pr.number not in seen:
            if pr.state != 'open':
                continue
            with transaction.atomic():
                _, is_new = SeenPullRequest.objects.get_or_create(repo=repo, number=pr.number)
                if is_new:
                    Task.objects.get_or_create(id=tid, defaults={
                        'title': (f'[PR] #{pr.number} {pr.title}' + (DRAFT if pr.is_draft else ''))[:255],
                        'description': f'{pr.url}\nAuthor: {pr.author}\nAuto-created from GitHub review request',
                        'creator': pr.author or 'Unknown', 'category': 'Review', 'status': 'todo',
                        'source_url': pr.url})
            continue
        task = Task.objects.filter(pk=tid).first()
        if task is None:  # deleted by the user: never re-create
            continue
        base = task.title[:-len(DRAFT)] if task.title.endswith(DRAFT) else task.title
        title = base + (DRAFT if pr.is_draft else '')
        status = 'done' if pr.state in ('merged', 'closed') else task.status
        if (title, status) != (task.title, task.status):
            task.title, task.status = title[:255], status
            task.save(update_fields=['title', 'status', 'updated_at'])
