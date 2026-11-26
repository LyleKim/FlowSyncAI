import json
from datetime import datetime, timedelta, timezone

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from integrations.models import PullRequest, PullRequestReviewer, PullRequestReview, WatchedRepo
from integrations.pr_ingest import IngestResult, ingest_prs, tracked_open_numbers

T1, T2, T3 = '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z'
NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)


def req(login='', team='', at=None):
    return {'kind': 'team' if team else 'user', 'login': login, 'team_slug': team, 'requested_at': at}


def pr(number=1, **kw):
    d = {'number': number, 'title': 't', 'url': 'https://github.com/o/r/pull/1', 'author': 'me',
         'is_draft': False, 'state': 'open', 'created_at': T1, 'updated_at': T1, 'closed_at': None,
         'merged_at': None, 'additions': 1, 'deletions': 2, 'changed_files': 1, 'files': ['a.py'],
         'files_truncated': False, 'review_requests': [], 'latest_reviews': []}
    d.update(kw)
    return d


class IngestTests(TestCase):
    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/o/r', owner='o', name='r')

    def rv(self, **f):
        return PullRequestReviewer.objects.get(**f)

    def test_creates_pr_reviewers_reviews(self):
        p = pr(review_requests=[req('Alice', at=T2), req('b', at=T2)],
               latest_reviews=[{'login': 'Alice', 'state': 'APPROVED', 'submitted_at': T3}])
        self.assertEqual(ingest_prs(self.repo, [p], NOW), IngestResult(created=1, updated=0))
        self.assertEqual(PullRequest.objects.count(), 1)
        self.assertEqual(json.loads(PullRequest.objects.get().files), ['a.py'])
        self.assertEqual(PullRequestReviewer.objects.count(), 2)
        self.assertEqual(self.rv(login_key='alice').login, 'Alice')
        self.assertEqual(PullRequestReview.objects.get().login_key, 'alice')

    def test_second_ingest_updates_not_duplicates(self):
        ingest_prs(self.repo, [pr()], NOW)
        r = ingest_prs(self.repo, [pr(title='new', additions=9)], NOW)
        self.assertEqual(r, IngestResult(created=0, updated=1))
        p = PullRequest.objects.get()
        self.assertEqual((p.title, p.additions), ('new', 9))

    def test_requested_at_stable_when_still_active(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1)])], NOW)
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=None)])], NOW)
        self.assertEqual(self.rv(login_key='a').requested_at.isoformat(), '2026-11-01T00:00:00+00:00')

    def test_rerequest_while_still_active_moves_requested_at(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1)])], NOW)
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T3)],
                                  latest_reviews=[{'login': 'a', 'state': 'COMMENTED', 'submitted_at': T2}])], NOW)
        r = self.rv(login_key='a')
        self.assertEqual((r.requested_at.isoformat(), r.requested_at_estimated), ('2026-11-03T00:00:00+00:00', False))
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T2)])], NOW)  # older event: unchanged
        self.assertEqual(self.rv(login_key='a').requested_at.isoformat(), '2026-11-03T00:00:00+00:00')

    def test_rerequest_after_review_is_waiting_in_queue(self):
        from django.utils import timezone
        from integrations.review_queue import build_queue
        n = timezone.now().replace(microsecond=0)
        t = lambda d: (n - timedelta(days=d)).strftime('%Y-%m-%dT%H:%M:%SZ')
        ingest_prs(self.repo, [pr(created_at=t(5), updated_at=t(1), review_requests=[req('a', at=t(4))])], NOW)
        rev = [{'login': 'a', 'state': 'COMMENTED', 'submitted_at': t(3)}]
        ingest_prs(self.repo, [pr(created_at=t(5), updated_at=t(1), latest_reviews=rev,
                                  review_requests=[req('a', at=t(2))])], NOW)
        [item] = build_queue('a', [], 7, False, n)['items']
        self.assertEqual((item['group'], item['reRequested']), ('waiting', True))

    def test_missing_requested_at_falls_back_to_pr_created(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a')])], NOW)
        self.assertEqual(self.rv(login_key='a').requested_at.isoformat(), '2026-11-01T00:00:00+00:00')

    def test_estimated_flag_new_and_reactivated(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T2), req('b')])], NOW)
        self.assertFalse(self.rv(login_key='a').requested_at_estimated)
        self.assertTrue(self.rv(login_key='b').requested_at_estimated)
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=None)])], NOW)  # a still active: unchanged
        self.assertFalse(self.rv(login_key='a').requested_at_estimated)
        ingest_prs(self.repo, [pr(review_requests=[req('b', at=T3)])], NOW)  # b reactivated with event
        self.assertFalse(self.rv(login_key='b').requested_at_estimated)
        ingest_prs(self.repo, [pr()], NOW)
        ingest_prs(self.repo, [pr(review_requests=[req('b')])], NOW)  # reactivated without event
        self.assertTrue(self.rv(login_key='b').requested_at_estimated)
        self.assertEqual(self.rv(login_key='b').requested_at.isoformat(), '2026-11-01T00:00:00+00:00')

    def test_reviewer_removed_marks_inactive(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1), req('b', at=T1)])], NOW)
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1)])], NOW)
        b = self.rv(login_key='b')
        self.assertFalse(b.is_active)
        self.assertEqual(b.removed_at, NOW)
        self.assertTrue(self.rv(login_key='a').is_active)

    def test_rerequest_reactivates_with_new_requested_at(self):
        ingest_prs(self.repo, [pr(review_requests=[req('b', at=T1)])], NOW)
        ingest_prs(self.repo, [pr()], NOW)
        ingest_prs(self.repo, [pr(review_requests=[req('b', at=T3)])], NOW)
        b = self.rv(login_key='b')
        self.assertTrue(b.is_active)
        self.assertEqual(b.requested_at.isoformat(), '2026-11-03T00:00:00+00:00')
        self.assertIsNone(b.removed_at)

    def test_state_transition_open_to_merged(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1)])], NOW)
        ingest_prs(self.repo, [pr(state='merged', merged_at=T3, closed_at=T3)], NOW)
        p = PullRequest.objects.get()
        self.assertEqual(p.state, 'merged')
        self.assertIsNotNone(p.merged_at)
        self.assertTrue(self.rv(login_key='a').is_active)

    def test_team_and_direct_rows_coexist(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1), req(team='acme/backend', at=T1)])], NOW)
        self.assertEqual(PullRequestReviewer.objects.count(), 2)
        t = PullRequestReviewer.objects.get(team_slug='acme/backend')
        self.assertEqual((t.login, t.login_key), ('', ''))

    def test_tracked_open_numbers(self):
        ingest_prs(self.repo, [pr(1), pr(2, state='merged'), pr(3, state='closed'), pr(4)], NOW)
        self.assertEqual(sorted(tracked_open_numbers(self.repo)), [1, 4])

    def test_robust_to_empty_values(self):
        p = pr(author='', files=[], review_requests=None, latest_reviews=[
            {'login': '', 'state': 'APPROVED', 'submitted_at': T1}])
        del p['files_truncated']
        ingest_prs(self.repo, [p], NOW)
        self.assertEqual(PullRequestReview.objects.count(), 0)

    def test_dismissed_stored_and_absent_review_kept(self):
        rv = {'login': 'a', 'state': 'DISMISSED', 'submitted_at': T2}
        ingest_prs(self.repo, [pr(latest_reviews=[rv])], NOW)
        self.assertEqual(PullRequestReview.objects.get().state, 'DISMISSED')
        ingest_prs(self.repo, [pr(latest_reviews=[])], NOW)
        self.assertEqual(PullRequestReview.objects.count(), 1)

    def test_review_updated_in_place(self):
        ingest_prs(self.repo, [pr(latest_reviews=[{'login': 'a', 'state': 'COMMENTED', 'submitted_at': T1}])], NOW)
        ingest_prs(self.repo, [pr(latest_reviews=[{'login': 'a', 'state': 'APPROVED', 'submitted_at': T2}])], NOW)
        self.assertEqual(PullRequestReview.objects.get().state, 'APPROVED')

    def test_absent_pr_untouched(self):
        ingest_prs(self.repo, [pr(1, review_requests=[req('a', at=T1)]), pr(2)], NOW)
        ingest_prs(self.repo, [pr(2)], NOW)
        self.assertEqual(PullRequest.objects.get(number=1).state, 'open')
        self.assertTrue(self.rv(login_key='a').is_active)

    def test_closed_pr_leaves_reviewers_untouched(self):
        ingest_prs(self.repo, [pr(review_requests=[req('a', at=T1)])], NOW)
        ingest_prs(self.repo, [pr(state='closed', closed_at=T3)], NOW)
        a = self.rv(login_key='a')
        self.assertTrue(a.is_active)
        self.assertIsNone(a.removed_at)

    def test_review_without_submitted_at_skipped(self):
        ingest_prs(self.repo, [pr(latest_reviews=[{'login': 'a', 'state': 'PENDING', 'submitted_at': None}])], NOW)
        self.assertEqual(PullRequestReview.objects.count(), 0)

    def test_query_count_not_proportional(self):
        def snap(state='open'):
            return [pr(n, state=state, review_requests=[req(f'u{i}', at=T1) for i in range(3)],
                       latest_reviews=[{'login': f'u{i}', 'state': 'APPROVED', 'submitted_at': T2}
                                       for i in range(2)]) for n in range(1, 31)]
        # per-PR creates are allowed (MySQL bulk_create returns no pks); reviewers/reviews must be bulk
        with CaptureQueriesContext(connection) as c:
            ingest_prs(self.repo, snap(), NOW)
        self.assertLessEqual(len(c), 30 + 10)
        self.assertEqual(PullRequestReviewer.objects.count(), 90)
        with CaptureQueriesContext(connection) as c:
            ingest_prs(self.repo, snap(), NOW)
        self.assertLessEqual(len(c), 10)

    def test_duplicate_pr_number_in_snapshot(self):
        r = ingest_prs(self.repo, [pr(1, title='x'), pr(1, title='y')], NOW)
        self.assertEqual(r, IngestResult(created=1, updated=0))
        self.assertEqual(PullRequest.objects.get().title, 'y')

    def test_duplicate_reviewer_login_in_one_pr(self):
        ingest_prs(self.repo, [pr(review_requests=[req('A', at=T1), req('a', at=T1)],
                                  latest_reviews=[{'login': 'A', 'state': 'APPROVED', 'submitted_at': T2},
                                                  {'login': 'a', 'state': 'COMMENTED', 'submitted_at': T3}])], NOW)
        self.assertEqual(PullRequestReviewer.objects.count(), 1)
        self.assertEqual(PullRequestReview.objects.count(), 1)

    def test_team_row_deactivate_and_reactivate(self):
        ingest_prs(self.repo, [pr(review_requests=[req(team='o/t', at=T1)])], NOW)
        ingest_prs(self.repo, [pr()], NOW)
        t = self.rv(team_slug='o/t')
        self.assertEqual((t.is_active, t.removed_at), (False, NOW))
        ingest_prs(self.repo, [pr(review_requests=[req(team='o/t', at=T3)])], NOW)
        t = self.rv(team_slug='o/t')
        self.assertEqual((t.is_active, t.removed_at), (True, None))
        self.assertEqual(t.requested_at.isoformat(), '2026-11-03T00:00:00+00:00')

    def test_prs_not_in_snapshot_not_loaded(self):
        ingest_prs(self.repo, [pr(n) for n in range(1, 6)], NOW)
        before = {p.number: p.synced_at for p in PullRequest.objects.all()}
        ingest_prs(self.repo, [pr(1, title='z')], NOW)
        for p in PullRequest.objects.exclude(number=1):
            self.assertEqual(p.synced_at, before[p.number])
            self.assertEqual(p.title, 't')
        with CaptureQueriesContext(connection) as c:
            ingest_prs(self.repo, [pr(1)], NOW)
        self.assertIn('IN (1)', ' '.join(q['sql'] for q in c if 'integrations_pullrequest"' in q['sql'] and 'SELECT' in q['sql']))


class TeamKeyEndToEndTests(TestCase):
    def test_fixture_team_request_reaches_queue(self):
        from pathlib import Path
        from unittest import mock
        from django.utils import timezone
        from integrations import github_client as gh
        from integrations.review_queue import build_queue
        data = json.loads((Path(__file__).parent / 'testdata' / 'graphql_repo_prs.json').read_text())['data']
        repo = WatchedRepo.objects.create(url='https://github.com/acme/widgets', owner='acme', name='widgets')
        with mock.patch('integrations.github_client._post_graphql', return_value=data):
            prs = gh.fetch_repo_pull_requests('acme', 'widgets')['prs']
        ingest_prs(repo, prs, timezone.now())
        items = build_queue('nobody', ['acme/backend'], 30, False, timezone.now())['items']
        i = next(i for i in items if i['number'] == 42)
        self.assertEqual((i['requestKind'], i['viaTeam']), ('team', 'acme/backend'))
