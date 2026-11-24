from django.db import transaction
from django.utils import timezone

from tasks.models import Task

from . import github_client
from .models import SeenPullRequest, WatchedRepo


def _sync_repo(repo):
    login = repo.github_login or github_client.get_authenticated_login()
    prs = github_client.search_review_requested_prs(login, repo.owner, repo.name)
    # 방어: 검색 결과가 감시 대상 레포 밖의 PR이면 버린다 (검색 한정자 주입 대비)
    own = f'{repo.owner}/{repo.name}'.lower()
    prs = [pr for pr in prs if pr['repo'].lower() == own]
    seen = set(repo.seen_prs.values_list('number', flat=True))
    created = skipped = 0
    for pr in prs:
        if pr['number'] in seen:
            skipped += 1
            continue
        title = f"[PR] #{pr['number']} {pr['title']}" + (' (draft)' if pr.get('draft') else '')
        with transaction.atomic():
            _, is_new = SeenPullRequest.objects.get_or_create(repo=repo, number=pr['number'])
            if not is_new:
                skipped += 1
                continue
            Task.objects.get_or_create(
                id=f"pr-{repo.owner}-{repo.name}-{pr['number']}",
                defaults={
                    'title': title[:255],
                    'description': (
                        f"{pr['html_url']}\nAuthor: {pr['author']}\n"
                        'Auto-created from GitHub review request'
                    ),
                    'creator': pr['author'] or 'Unknown',
                    'category': 'Review',
                    'status': 'todo',
                    'source_url': pr['html_url'],
                },
            )
        created += 1
    return created, skipped


def sync_review_requests():
    result = {'created': 0, 'skipped': 0, 'errors': []}
    for repo in WatchedRepo.objects.all():
        try:
            created, skipped = _sync_repo(repo)
        except ValueError as e:  # 저장돼 있던 잘못된 githubLogin
            result['errors'].append(f'{repo}: {e}')
            continue
        except github_client.GitHubError as e:
            msg = e.message
            if e.status == 401 or (not repo.github_login and e.status in (403, 404)):
                msg = f'{msg} (a valid GITHUB_TOKEN is required, or set githubLogin)'
            result['errors'].append(f'{repo}: {msg}')
            continue
        result['created'] += created
        result['skipped'] += skipped
        repo.last_synced_at = timezone.now()
        repo.save(update_fields=['last_synced_at'])
    return result
