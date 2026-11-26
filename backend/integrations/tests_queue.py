from datetime import datetime, timedelta, timezone as tz

from django.test import TestCase

from .models import PullRequest, PullRequestReview, PullRequestReviewer, WatchedRepo

URL = '/api/v1/integrations/review-queue/'
NOW = datetime.now(tz.utc).replace(microsecond=0)
ITEM_KEYS = {'id', 'repoId', 'repo', 'number', 'title', 'url', 'author', 'isDraft', 'prState', 'group',
             'requestKind', 'viaTeam', 'requestedAt', 'requestedAtSource', 'reRequested', 'myReview', 'size',
             'closedAt', 'mergedAt', 'closedReason', 'mergedWithoutMyReview', 'areas', 'updatedAt'}


def ago(**kw):
    return NOW - timedelta(**kw)


def make_pr(repo, n, state='open', reviewers=(), reviews=(), estimated=True, **kw):
    """reviewers: (login, requested_at[, is_active[, team_slug]]); reviews: (login, state, submitted_at)."""
    vals = dict(title=f't{n}', url=f'https://github.com/{repo}/pull/{n}', author='jun-ho', state=state,
                pr_created_at=ago(days=10), pr_updated_at=ago(hours=n))
    vals.update(kw)
    pr = PullRequest.objects.create(repo=repo, number=n, additions=120, deletions=14, changed_files=6, **vals)
    for r in reviewers:
        login, at, active, team = (tuple(r) + (True, ''))[:4] if len(r) < 4 else r
        PullRequestReviewer.objects.create(pr=pr, login=login, login_key=login.lower(), team_slug=team,
                                           requested_at=at, is_active=active,
                                           requested_at_estimated=(at == pr.pr_created_at and estimated))
    for login, st, at in reviews:
        PullRequestReview.objects.create(pr=pr, login=login, login_key=login.lower(), state=st, submitted_at=at)
    return pr


class QueueTests(TestCase):
    def setUp(self):
        self.repo = WatchedRepo.objects.create(url='https://github.com/acme/api', owner='acme', name='api')

    def get(self, login='minji-park', **q):
        return self.client.get(URL, {'login': login, **q})

    def items(self, **q):
        return self.get(**q).json()['items']

    def test_waiting_item_shape_and_order(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=1))])
        make_pr(self.repo, 2, reviewers=[('minji-park', ago(days=3))], pr_created_at=ago(days=3))
        body = self.get().json()
        self.assertEqual([i['number'] for i in body['items']], [2, 1])
        i = body['items'][1]
        self.assertEqual(set(i), ITEM_KEYS)
        self.assertEqual((i['id'], i['group'], i['requestKind'], i['viaTeam']),
                         ('acme/api#1:minji-park', 'waiting', 'direct', None))
        self.assertEqual(i['size'], {'additions': 120, 'deletions': 14, 'changedFiles': 6})
        self.assertEqual((i['requestedAtSource'], i['reRequested'], i['myReview'], i['areas']),
                         ('event', False, None, None))
        self.assertEqual(body['items'][0]['requestedAtSource'], 'pr_created')
        # an event time equal to the PR's createdAt is still an event
        make_pr(self.repo, 3, reviewers=[('minji-park', ago(days=10))], estimated=False)
        by = {i['number']: i for i in self.items()}
        self.assertEqual(by[3]['requestedAtSource'], 'event')
        self.assertTrue(i['requestedAt'].endswith('Z'))
        self.assertEqual((i['closedAt'], i['mergedAt'], i['closedReason'], i['mergedWithoutMyReview']),
                         (None, None, None, False))
        self.assertEqual(self.get(include='areas').json()['items'][1]['areas'], None)

    def test_login_case_and_whitespace_insensitive(self):
        make_pr(self.repo, 1, reviewers=[('Minji-Park', ago(days=1))])
        a, b = self.get(' Minji-Park ').json(), self.get('minji-park').json()
        self.assertEqual(a, b)
        self.assertEqual(a['login'], 'Minji-Park')

    def test_comment_review_with_request_still_listed_is_awaiting_author(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=2))],
                reviews=[('minji-park', 'COMMENTED', ago(days=1))])
        i = self.items()[0]
        self.assertEqual((i['group'], i['reRequested']), ('awaiting_author', False))
        self.assertEqual(i['myReview']['state'], 'COMMENTED')

    def test_comment_review_with_request_removed_is_awaiting_author(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=2), False)],
                reviews=[('minji-park', 'COMMENTED', ago(days=1))])
        self.assertEqual(self.items()[0]['group'], 'awaiting_author')

    def test_rerequest_after_review_is_waiting_and_flagged(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(hours=1))],
                reviews=[('minji-park', 'CHANGES_REQUESTED', ago(days=1))])
        i = self.items()[0]
        self.assertEqual((i['group'], i['reRequested']), ('waiting', True))
        self.assertEqual(i['myReview']['state'], 'CHANGES_REQUESTED')

    def test_request_withdrawn_without_review(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=2), False)])
        i = self.items()[0]
        self.assertEqual((i['group'], i['closedReason'], i['closedAt']), ('closed', 'request_withdrawn', None))

    def test_merged_within_window_and_mergedWithoutMyReview(self):
        rq = [('minji-park', ago(days=9))]
        make_pr(self.repo, 1, 'merged', rq, merged_at=ago(days=1), closed_at=ago(days=1))
        make_pr(self.repo, 2, 'merged', rq, [('minji-park', 'APPROVED', ago(days=2))],
                merged_at=ago(days=1), closed_at=ago(days=1))
        make_pr(self.repo, 3, 'merged', rq, merged_at=ago(days=8), closed_at=ago(days=8))
        by = {i['number']: i for i in self.items()}
        self.assertEqual(set(by), {1, 2})
        self.assertEqual((by[1]['mergedWithoutMyReview'], by[1]['closedReason'], by[1]['group']),
                         (True, 'merged', 'closed'))
        self.assertFalse(by[2]['mergedWithoutMyReview'])
        self.assertEqual({i['number'] for i in self.items(closedWithinDays=30)}, {1, 2, 3})

    def test_closed_unmerged_uses_closed_at(self):
        make_pr(self.repo, 1, 'closed', [('minji-park', ago(days=9))], closed_at=ago(days=2))
        i = self.items()[0]
        self.assertEqual((i['closedReason'], i['mergedAt']), ('closed', None))
        self.assertTrue(i['closedAt'].endswith('Z'))

    def test_draft_always_included_with_flag(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=1))], is_draft=True)
        self.assertTrue(self.items()[0]['isDraft'])

    def test_team_requests_only_with_teams_param(self):
        make_pr(self.repo, 1, reviewers=[('', ago(days=1), True, 'acme/backend')])
        make_pr(self.repo, 2, reviewers=[('', ago(days=1), True, 'acme/backend'), ('minji-park', ago(days=2))])
        self.assertEqual([i['number'] for i in self.items()], [2])
        by = {i['number']: i for i in self.items(teams='acme/backend')}
        self.assertEqual((by[1]['requestKind'], by[1]['viaTeam']), ('team', 'acme/backend'))
        self.assertEqual((by[2]['requestKind'], by[2]['viaTeam']), ('direct', None))
        self.assertEqual(len(by), 2)

    def test_inactive_direct_with_active_team_is_team(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=3), False),
                                         ('', ago(days=1), True, 'acme/backend')])
        i = self.items(teams='acme/backend')[0]
        self.assertEqual((i['group'], i['requestKind'], i['viaTeam']), ('waiting', 'team', 'acme/backend'))

    def test_counts_equal_items_by_group(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=1))])
        make_pr(self.repo, 2, reviewers=[('minji-park', ago(days=2))],
                reviews=[('minji-park', 'APPROVED', ago(days=1))])
        make_pr(self.repo, 3, reviewers=[('minji-park', ago(days=2), False)])
        make_pr(self.repo, 4, 'merged', [('minji-park', ago(days=5))], merged_at=ago(days=1))
        b = self.get().json()
        self.assertEqual(b['counts'], {'waiting': 1, 'awaitingAuthor': 1, 'closed': 2})
        self.assertEqual([i['group'] for i in b['items']], ['waiting', 'awaiting_author', 'closed', 'closed'])
        self.assertEqual([i['number'] for i in b['items'][2:]], [3, 4])  # updatedAt desc

    def test_repos_block_reports_status(self):
        reset = ago(minutes=-20)
        self.repo.last_synced_at = self.repo.last_attempt_at = ago(minutes=5)
        self.repo.save()
        WatchedRepo.objects.create(url='https://github.com/acme/web', owner='acme', name='web',
                                   last_attempt_at=ago(minutes=1), last_error_kind='rate_limit',
                                   last_error_message='rate limit exceeded', last_error_reset_at=reset)
        repos = self.get().json()['repos']
        self.assertEqual(set(repos[0]), {'repoId', 'repo', 'lastAttemptAt', 'lastSuccessAt', 'lastError', 'truncated'})
        self.assertEqual((repos[0]['repo'], repos[0]['lastError']), ('acme/api', None))
        for k in ('lastAttemptAt', 'lastSuccessAt'):
            self.assertTrue(repos[0][k].endswith('Z') and len(repos[0][k]) == 20, repos[0][k])
        self.assertTrue(repos[1]['lastAttemptAt'].endswith('Z'))
        self.assertTrue(repos[1]['lastError']['resetAt'].endswith('Z'))
        self.assertEqual(repos[1]['lastError']['kind'], 'rate_limit')
        self.assertIsNotNone(repos[1]['lastError']['resetAt'])
        self.assertIsNone(repos[1]['lastSuccessAt'])

    def test_no_repos(self):
        WatchedRepo.objects.all().delete()
        r = self.get()
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['repos'], r.json()['items']), ([], []))

    def test_unknown_login_flag(self):
        make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=1))])
        b = self.get('nobody').json()
        self.assertEqual((b['items'], b['knownLogin']), ([], False))
        self.assertTrue(self.get('Jun-Ho').json()['knownLogin'])  # PR author
        self.assertEqual(self.get('Jun-Ho').json()['items'], [])

    def test_etag_304_and_changes(self):
        pr = make_pr(self.repo, 1, reviewers=[('minji-park', ago(days=1))])
        r = self.get()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r['Cache-Control'], 'private, must-revalidate')
        etag = r['ETag']
        self.assertNotIn('generatedAt', r.json())
        self.assertEqual(self.client.get(URL, {'login': 'minji-park'}, HTTP_IF_NONE_MATCH=etag).status_code, 304)
        PullRequest.objects.filter(pk=pr.pk).update(title='changed')
        r2 = self.client.get(URL, {'login': 'minji-park'}, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(r2.status_code, 200)
        self.assertNotEqual(r2['ETag'], etag)

    def test_400s(self):
        for q in ({}, {'login': ''}, {'login': '  '}):
            r = self.client.get(URL, q)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'login_required'))
        for v in ('abc', '0', '31', '1.5'):
            r = self.get(closedWithinDays=v)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'invalid_closed_within_days'))

    def test_no_n_plus_one(self):
        def fill(lo, hi):
            for n in range(lo, hi):
                make_pr(self.repo, n, reviewers=[('minji-park', ago(days=1)), ('other', ago(days=1))],
                        reviews=[('minji-park', 'COMMENTED', ago(days=2))])
        fill(1, 3)
        with self.assertNumQueries(9):
            self.get()
        fill(3, 53)
        with self.assertNumQueries(9):
            self.get()
