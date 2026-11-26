from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from integrations.models import (
    AreaAlias, PullRequest, PullRequestReviewer, WatchedRepo,
)


def make_repo(url='https://github.com/o/r'):
    return WatchedRepo.objects.create(url=url, owner='o', name='r')


def make_pr(repo, number=1):
    now = timezone.now()
    return PullRequest.objects.create(
        repo=repo, number=number, title='t', url='https://github.com/o/r/pull/1',
        author='a', state='open', pr_created_at=now, pr_updated_at=now,
    )


class ModelConstraintTests(TestCase):
    def test_watched_repo_url_still_unique(self):
        make_repo()
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_repo()

    def test_pr_unique_per_repo_number(self):
        repo = make_repo()
        make_pr(repo)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_pr(repo)
        make_pr(repo, 2)

    def test_reviewer_unique_per_login_and_team(self):
        pr = make_pr(make_repo())
        now = timezone.now()

        def add(team):
            return PullRequestReviewer.objects.create(
                pr=pr, login='bob', login_key='bob', team_slug=team, requested_at=now)

        add('')
        add('o/team')
        with self.assertRaises(IntegrityError), transaction.atomic():
            add('o/team')

    def test_alias_unique_per_prefix(self):
        repo = make_repo()
        AreaAlias.objects.create(repo=repo, path_prefix='backend/', display_name='B')
        with self.assertRaises(IntegrityError), transaction.atomic():
            AreaAlias.objects.create(repo=repo, path_prefix='backend/', display_name='C')

    def test_cascade_delete_repo_removes_prs_reviewers_aliases(self):
        repo = make_repo()
        pr = make_pr(repo)
        PullRequestReviewer.objects.create(
            pr=pr, login='bob', login_key='bob', requested_at=timezone.now())
        AreaAlias.objects.create(repo=repo, path_prefix='x/', display_name='X')
        repo.delete()
        self.assertEqual(PullRequest.objects.count(), 0)
        self.assertEqual(PullRequestReviewer.objects.count(), 0)
        self.assertEqual(AreaAlias.objects.count(), 0)


class GitPathCaseTests(TestCase):
    """Git paths are case-sensitive; MySQL's default utf8mb4_0900_ai_ci collation is not."""

    def test_paths_differing_only_in_case_are_distinct(self):
        from .models import AreaAlias, FolderDescription
        repo = WatchedRepo.objects.create(url='https://github.com/acme/case', owner='acme', name='case')
        for p in ('Docs', 'docs'):
            FolderDescription.objects.create(repo=repo, path=p, text=p, generated_at=timezone.now())
            AreaAlias.objects.create(repo=repo, path_prefix=p, display_name=p)
        self.assertEqual(FolderDescription.objects.get(repo=repo, path='docs').text, 'docs')
        self.assertEqual(AreaAlias.objects.get(repo=repo, path_prefix='Docs').display_name, 'Docs')
