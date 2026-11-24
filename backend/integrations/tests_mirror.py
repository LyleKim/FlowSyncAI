from datetime import datetime, timezone

from django.test import TestCase

from integrations.models import PullRequest, PullRequestReviewer, SeenPullRequest, WatchedRepo
from integrations.task_mirror import mirror_repo
from tasks.models import Task

NOW = datetime(2026, 11, 24, tzinfo=timezone.utc)


class MirrorTests(TestCase):
    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r', github_login='Me')
        self.pr = PullRequest.objects.create(
            repo=self.repo, number=1, title='Fix bug', url='https://github.com/o/r/pull/1', author='alice',
            state='open', pr_created_at=NOW, pr_updated_at=NOW)
        PullRequestReviewer.objects.create(pr=self.pr, login='me', login_key='me', requested_at=NOW)

    def task(self):
        return Task.objects.get(pk='pr-o-r-1')

    def set_pr(self, **kw):
        PullRequest.objects.filter(pk=self.pr.pk).update(**kw)

    def test_creates_task_with_legacy_fields(self):
        mirror_repo(self.repo)
        t = self.task()
        self.assertEqual((t.title, t.creator, t.category, t.status, t.source_url),
                         ('[PR] #1 Fix bug', 'alice', 'Review', 'todo', 'https://github.com/o/r/pull/1'))
        self.assertIn('https://github.com/o/r/pull/1', t.description)
        self.assertIn('Auto-created from GitHub review request', t.description)

    def test_idempotent_and_deleted_task_not_recreated(self):
        mirror_repo(self.repo)
        mirror_repo(self.repo)
        self.assertEqual(Task.objects.count(), 1)
        Task.objects.all().delete()
        mirror_repo(self.repo)
        self.assertEqual(Task.objects.count(), 0)
        self.assertEqual(SeenPullRequest.objects.count(), 1)

    def test_draft_suffix_follows_pr_state(self):
        self.set_pr(is_draft=True)
        mirror_repo(self.repo)
        self.assertEqual(self.task().title, '[PR] #1 Fix bug (draft)')
        self.set_pr(is_draft=False)
        mirror_repo(self.repo)
        self.assertEqual(self.task().title, '[PR] #1 Fix bug')

    def test_merged_pr_marks_task_done(self):
        for state in ('merged', 'closed'):
            Task.objects.all().delete()
            SeenPullRequest.objects.all().delete()
            self.set_pr(state='open')
            mirror_repo(self.repo)
            self.set_pr(state=state)
            mirror_repo(self.repo)
            self.assertEqual(self.task().status, 'done')

    def test_open_pr_status_not_overwritten(self):
        mirror_repo(self.repo)
        Task.objects.filter(pk='pr-o-r-1').update(status='inprogress')
        mirror_repo(self.repo)
        self.assertEqual(self.task().status, 'inprogress')

    def test_ignores_prs_without_legacy_login_reviewer(self):
        WatchedRepo.objects.filter(pk=self.repo.pk).update(github_login='')
        self.repo.refresh_from_db()
        mirror_repo(self.repo)
        self.assertEqual(Task.objects.count(), 0)
        WatchedRepo.objects.filter(pk=self.repo.pk).update(github_login='other')
        self.repo.refresh_from_db()
        mirror_repo(self.repo)
        self.assertEqual(Task.objects.count(), 0)
