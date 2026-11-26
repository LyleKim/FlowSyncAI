"""Characterization tests: pin current behavior of the tasks API."""
import json
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from django.utils.http import http_date

from reviews.models import RoleReview
from tasks.models import SubTask, Task

T = '/api/v1/tasks/'


class ApiMixin:
    def req(self, method, url, body=None, **headers):
        kw = {'content_type': 'application/json'}
        if body is not None:
            kw['data'] = json.dumps(body)
        return getattr(self.client, method)(url, **kw, **headers)

    def mk(self, **over):
        body = {'id': 't1', 'title': 'Task 1', **over}
        r = self.req('post', T, body)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()


class TaskCrudTests(ApiMixin, TestCase):
    def test_create_defaults_and_shape(self):
        data = self.mk()
        self.assertEqual(set(data), {
            'id', 'title', 'description', 'status', 'priority', 'category',
            'assigneeId', 'subtasks', 'createdAt', 'roles', 'roleReviews',
            'hasUnreflectedReview', 'lastReviewAddedAt', 'sourceUrl', 'kind', 'author'})
        self.assertEqual(data['status'], 'todo')
        self.assertEqual(data['priority'], 'medium')
        self.assertEqual(data['assigneeId'], 'Unknown')  # creator fallback
        self.assertEqual(data['roles'], [])
        self.assertEqual(data['subtasks'], [])
        self.assertFalse(data['hasUnreflectedReview'])
        self.assertIsNone(data['lastReviewAddedAt'])

    def test_create_generates_id_and_nested_subtasks_roles(self):
        r = self.req('post', T, {'title': 'x', 'roles': ['dev'], 'assigneeId': 'bob',
                                 'subtasks': [{'id': 's1', 'title': 'a', 'completed': True}]})
        self.assertEqual(r.status_code, 201)
        d = r.json()
        self.assertTrue(d['id'].startswith('task-'))
        self.assertEqual(d['roles'], ['dev'])
        self.assertEqual(d['assigneeId'], 'bob')
        self.assertEqual(d['subtasks'], [{'id': 's1', 'title': 'a', 'completed': True}])

    def test_create_blank_title_400(self):
        r = self.req('post', T, {'title': '  '})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['error'], 'Validation failed')
        self.assertIn('title', r.json()['details']['fields'])

    def test_create_invalid_json_400(self):
        r = self.client.post(T, data='{bad', content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json(), {'error': 'Invalid JSON'})

    def test_create_same_id_replay_200_only_if_assignee_matches_else_409(self):
        # ODDITY: resending the identical body (no assigneeId) is 409, because
        # creator defaults to 'Unknown' but assignee_id to '' and the compare disagrees.
        self.mk()
        self.assertEqual(self.req('post', T, {'id': 't1', 'title': 'Task 1'}).status_code, 409)
        self.req('post', T, {'id': 't3', 'title': 'x', 'assigneeId': 'bob'})
        r = self.req('post', T, {'id': 't3', 'title': 'x', 'assigneeId': 'bob'})
        self.assertEqual(r.status_code, 200)
        r = self.req('post', T, {'id': 't1', 'title': 'Other'})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(Task.objects.count(), 2)

    def test_list_and_get(self):
        self.mk()
        self.mk(id='t2', title='Task 2')
        r = self.client.get(T)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t['id'] for t in r.json()], ['t2', 't1'])  # newest first
        r = self.client.get(T + 't1/')
        self.assertEqual(r.json()['title'], 'Task 1')
        self.assertIn('ETag', r)
        self.assertEqual(self.client.get(T + 'nope/').status_code, 404)

    def test_patch_scalar_only(self):
        self.mk(subtasks=[{'id': 's1', 'title': 'a'}])
        r = self.req('patch', T + 't1/', {'title': ' New ', 'status': 'review',
                                          'subtasks': [], 'roles': ['qa']})
        d = r.json()
        self.assertEqual((d['title'], d['status'], d['roles']), ('New', 'review', ['qa']))
        self.assertEqual(len(d['subtasks']), 1)  # subtasks in body ignored
        self.assertEqual(self.req('patch', T + 't1/', {'title': ' '}).status_code, 400)

    def test_patch_assignee_id_sets_creator_and_assignee(self):
        self.mk()
        d = self.req('patch', T + 't1/', {'assigneeId': 'alice'}).json()
        self.assertEqual(d['assigneeId'], 'alice')
        t = Task.objects.get(pk='t1')
        self.assertEqual((t.creator, t.assignee_id), ('alice', 'alice'))

    def test_delete_cascades_subtasks(self):
        self.mk(subtasks=[{'id': 's1', 'title': 'a'}])
        r = self.req('delete', T + 't1/')
        self.assertEqual(r.json(), {'message': 'Task deleted successfully'})
        self.assertEqual(SubTask.objects.count(), 0)
        self.assertEqual(self.req('delete', T + 't1/').status_code, 404)

    def test_method_not_allowed(self):
        self.assertEqual(self.req('put', T).status_code, 405)


class TaskIdempotencyAndEtagTests(ApiMixin, TestCase):
    def test_idempotency_key_replays_stored_response(self):
        h = {'HTTP_IDEMPOTENCY_KEY': 'k1'}
        r1 = self.req('post', T, {'title': 'A'}, **h)
        r2 = self.req('post', T, {'title': 'A'}, **h)
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)  # stored status replayed
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(Task.objects.count(), 1)

    def test_idempotency_key_replays_even_if_body_differs(self):
        h = {'HTTP_IDEMPOTENCY_KEY': 'k1'}
        r1 = self.req('post', T, {'title': 'A'}, **h)
        r2 = self.req('post', T, {'title': 'B'}, **h)
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(Task.objects.count(), 1)

    def test_no_key_creates_each_time(self):
        self.req('post', T, {'title': 'A'})
        self.req('post', T, {'title': 'A'})
        self.assertEqual(Task.objects.count(), 2)

    def test_idempotency_scope_per_endpoint(self):
        h = {'HTTP_IDEMPOTENCY_KEY': 'k1'}
        self.mk()
        r = self.req('post', T + 't1/subtasks/', {'title': 's'}, **h)
        self.assertEqual(r.status_code, 201)  # same key, different scope: not replayed from tasks
        r2 = self.req('post', T + 't1/subtasks/', {'title': 's'}, **h)
        self.assertEqual(r.json(), r2.json())
        self.assertEqual(SubTask.objects.count(), 1)

    def test_etag_304_and_changes_after_mutation(self):
        self.mk()
        r = self.client.get(T)
        etag = r['ETag']
        self.assertTrue(etag.startswith('"'))
        self.assertIn('Last-Modified', r)
        self.assertEqual(r['Cache-Control'], 'private, must-revalidate')
        r304 = self.client.get(T, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(r304.status_code, 304)
        self.assertEqual(r304['ETag'], etag)
        self.req('patch', T + 't1/', {'title': 'changed'})
        r = self.client.get(T, HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(r['ETag'], etag)

    def test_if_modified_since_304(self):
        self.mk()
        lm = self.client.get(T)['Last-Modified']
        # ODDITY: updated_at has microseconds, HTTP date has seconds, so the
        # echoed Last-Modified never yields 304 (only If-None-Match does).
        self.assertEqual(self.client.get(T, HTTP_IF_MODIFIED_SINCE=lm).status_code, 200)
        later = http_date(timezone.now().timestamp() + 60)
        self.assertEqual(self.client.get(T, HTTP_IF_MODIFIED_SINCE=later).status_code, 304)

    def test_empty_list_has_no_last_modified(self):
        r = self.client.get(T)
        self.assertEqual(r.json(), [])
        self.assertNotIn('Last-Modified', r)


class SubtaskTests(ApiMixin, TestCase):
    def setUp(self):
        self.mk()
        self.u = T + 't1/subtasks/'

    def test_post_get_patch_delete(self):
        r = self.req('post', self.u, {'id': 's1', 'title': 'a'})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json(), {'id': 's1', 'title': 'a', 'completed': False})
        self.assertEqual(self.req('post', self.u, {'id': 's1', 'title': 'a'}).status_code, 200)
        self.assertEqual(self.req('post', self.u, {'id': 's1', 'title': 'zzz'}).status_code, 409)
        self.assertEqual(self.req('post', self.u, {'title': ''}).status_code, 400)
        self.assertEqual(len(self.client.get(self.u).json()), 1)
        r = self.req('patch', self.u + 's1/', {'completed': True})
        self.assertEqual(r.json(), {'id': 's1', 'title': 'a', 'completed': True})
        self.assertEqual(self.req('patch', self.u + 's1/', {'title': ' '}).status_code, 400)
        r = self.req('delete', self.u + 's1/')
        self.assertEqual(r.json(), {'message': 'Subtask deleted successfully'})
        self.assertEqual(self.req('patch', self.u + 's1/', {}).status_code, 404)

    def test_subtask_of_other_task_404(self):
        self.mk(id='t2', title='x', subtasks=[{'id': 's9', 'title': 'q'}])
        self.assertEqual(self.req('patch', self.u + 's9/', {}).status_code, 404)

    def test_post_unknown_task_404(self):
        self.assertEqual(self.req('post', T + 'zz/subtasks/', {'title': 'a'}).status_code, 404)

    def test_put_replaces_and_stamps_checklist_generated_at(self):
        self.req('post', self.u, {'id': 's1', 'title': 'old'})
        self.assertIsNone(Task.objects.get(pk='t1').checklist_generated_at)
        r = self.req('put', self.u, [{'id': 's2', 'title': 'new'}, {'id': 's3', 'title': 'n3', 'completed': True}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual([s['id'] for s in r.json()], ['s2', 's3'])
        self.assertEqual(SubTask.objects.filter(task_id='t1').count(), 2)
        self.assertIsNotNone(Task.objects.get(pk='t1').checklist_generated_at)

    def test_put_updates_existing_id_and_requires_list(self):
        self.req('post', self.u, {'id': 's1', 'title': 'old'})
        r = self.req('put', self.u, [{'id': 's1', 'title': 'upd'}])
        self.assertEqual(r.json(), [{'id': 's1', 'title': 'upd', 'completed': False}])
        r = self.req('put', self.u, {'title': 'x'})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.req('put', self.u, [{'title': ' '}]).status_code, 400)

    def test_put_empty_list_clears_and_stamps(self):
        self.req('post', self.u, {'id': 's1', 'title': 'old'})
        self.assertEqual(self.req('put', self.u, []).json(), [])
        self.assertIsNotNone(Task.objects.get(pk='t1').checklist_generated_at)

    def test_put_invalid_item_partially_saved_no_rollback(self):
        # ODDITY: validation failure mid-list leaves earlier items saved (no transaction).
        r = self.req('put', self.u, [{'id': 'ok', 'title': 'fine'}, {'id': 'bad', 'title': ''}])
        self.assertEqual(r.status_code, 400)
        self.assertTrue(SubTask.objects.filter(pk='ok').exists())
        self.assertIsNone(Task.objects.get(pk='t1').checklist_generated_at)


class UnreflectedReviewTests(ApiMixin, TestCase):
    def review(self, **kw):
        r = self.req('post', T + 't1/reviews/', {'role': 'dev', 'comment': 'c', **kw})
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_computed_flags(self):
        self.mk()
        self.review(id='r1')
        d = self.client.get(T + 't1/').json()
        self.assertTrue(d['hasUnreflectedReview'])  # review, never generated
        self.assertEqual(d['lastReviewAddedAt'], d['roleReviews'][0]['createdAt'])

        self.req('put', T + 't1/subtasks/', [])
        self.assertFalse(self.client.get(T + 't1/').json()['hasUnreflectedReview'])

        self.review(id='r2')
        self.assertTrue(self.client.get(T + 't1/').json()['hasUnreflectedReview'])

    def test_flag_compares_timestamps(self):
        self.mk()
        self.review(id='r1')
        t = Task.objects.get(pk='t1')
        t.checklist_generated_at = RoleReview.objects.get(pk='r1').created_at + timedelta(seconds=1)
        t.save()
        self.assertFalse(self.client.get(T + 't1/').json()['hasUnreflectedReview'])
        t.checklist_generated_at = timezone.now() - timedelta(days=1)
        t.save()
        self.assertTrue(self.client.get(T + 't1/').json()['hasUnreflectedReview'])

    def test_create_with_embedded_roleReviews(self):
        d = self.mk(roleReviews=[{'id': 'r1', 'role': 'qa', 'comment': 'x'}])
        self.assertEqual(d['roleReviews'][0]['id'], 'r1')
        self.assertTrue(d['hasUnreflectedReview'])
        self.assertEqual(d['status'], 'todo')  # embedded reviews do NOT flip status


class ListQueryCountTests(ApiMixin, TestCase):
    def test_list_query_count_independent_of_task_count(self):
        for i in range(5):
            self.mk(id=f't{i}')
            RoleReview.objects.create(id=f'r{i}', task_id=f't{i}', role='qa', comment='x')
        with self.assertNumQueries(4):  # tasks, subtasks, reviews, last-modified
            self.client.get(T)


class TaskKindTests(ApiMixin, TestCase):
    def pr(self, **over):
        return Task.objects.create(
            id='pr-o-r-1', title='PR', creator='alice', **over
        )

    def test_serialized_task_has_kind(self):
        self.pr()
        self.mk()
        by_id = {t['id']: t for t in self.client.get(T).json()}
        self.assertEqual(by_id['pr-o-r-1']['kind'], 'pr')
        self.assertEqual(by_id['t1']['kind'], 'manual')

    def test_pr_task_assignee_is_not_author(self):
        self.pr()
        self.mk(assigneeId='bob')
        by_id = {t['id']: t for t in self.client.get(T).json()}
        self.assertEqual(by_id['pr-o-r-1']['assigneeId'], '')
        self.assertEqual(by_id['pr-o-r-1']['author'], 'alice')
        self.assertEqual(by_id['t1']['assigneeId'], 'bob')
        self.assertIsNone(by_id['t1']['author'])

    def test_pr_task_author_empty_when_creator_blank(self):
        Task.objects.create(id='pr-o-r-2', title='PR', creator='')
        t = self.client.get(T + 'pr-o-r-2/').json()
        self.assertEqual(t['author'], '')
        self.assertEqual(t['assigneeId'], '')

    def test_manual_task_with_pr_source_url_stays_manual(self):
        self.mk(sourceUrl='https://github.com/o/r/pull/9')
        self.assertEqual(self.client.get(T + 't1/').json()['kind'], 'manual')

    def test_patch_title_only_on_pr_task_keeps_assignee_and_author(self):
        self.pr()
        r = self.req('patch', T + 'pr-o-r-1/', {'title': 'new'}).json()
        self.assertEqual((r['assigneeId'], r['author'], r['title']), ('', 'alice', 'new'))
        r = self.client.get(T + 'pr-o-r-1/').json()
        self.assertEqual((r['assigneeId'], r['author']), ('', 'alice'))

    def test_patch_title_only_on_manual_task_unchanged_behavior(self):
        self.mk(assigneeId='bob')
        r = self.req('patch', T + 't1/', {'title': 'new'}).json()
        self.assertEqual((r['assigneeId'], r['author']), ('bob', None))

    def test_patch_explicit_assignee_on_pr_task_is_stored(self):
        self.pr()
        r = self.req('patch', T + 'pr-o-r-1/', {'assigneeId': 'carol'}).json()
        self.assertEqual(r['assigneeId'], 'carol')
        self.assertEqual(self.client.get(T + 'pr-o-r-1/').json()['assigneeId'], 'carol')

    def test_patch_explicit_assignee_on_pr_task_keeps_author(self):
        self.pr()
        r = self.req('patch', T + 'pr-o-r-1/', {'assigneeId': 'carol'}).json()
        self.assertEqual((r['assigneeId'], r['author']), ('carol', 'alice'))

    def test_patch_title_only_on_pr_task_with_preset_assignee(self):
        self.pr(assignee_id='bob')
        r = self.req('patch', T + 'pr-o-r-1/', {'title': 'new'}).json()
        self.assertEqual((r['assigneeId'], r['author']), ('bob', 'alice'))

    def test_patch_empty_assignee_on_pr_task_clears_it_keeps_author(self):
        self.pr(assignee_id='bob')
        r = self.req('patch', T + 'pr-o-r-1/', {'assigneeId': ''}).json()
        self.assertEqual((r['assigneeId'], r['author']), ('', 'alice'))
        self.assertEqual(self.client.get(T + 'pr-o-r-1/').json()['assigneeId'], '')

    def test_kind_filter(self):
        self.pr()
        self.mk()
        ids = lambda q: [t['id'] for t in self.client.get(T + q).json()]
        self.assertEqual(ids('?kind=manual'), ['t1'])
        self.assertEqual(ids('?kind=pr'), ['pr-o-r-1'])
        self.assertEqual(sorted(ids('')), ['pr-o-r-1', 't1'])
        r = self.client.get(T + '?kind=x')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['code'], 'invalid_kind')

    def test_kind_filter_has_independent_etag(self):
        self.pr()
        self.mk()
        etags = {}
        for q in ('', '?kind=pr', '?kind=manual'):
            etags[q] = self.client.get(T + q)['ETag']
        self.assertEqual(len(set(etags.values())), 3)
        for q, e in etags.items():
            self.assertEqual(self.client.get(T + q, HTTP_IF_NONE_MATCH=e).status_code, 304)
        self.assertEqual(
            self.client.get(T + '?kind=pr', HTTP_IF_NONE_MATCH=etags['?kind=manual']).status_code, 200
        )

    def test_kind_filter_last_modified_is_per_filter(self):
        Task.objects.create(id='t-old', title='old')
        Task.objects.filter(pk='t-old').update(updated_at=timezone.now() - timedelta(days=1))
        self.pr()
        since = http_date(timezone.now().timestamp() - 3600)
        self.assertEqual(self.client.get(T + '?kind=manual', HTTP_IF_MODIFIED_SINCE=since).status_code, 304)
        self.assertEqual(self.client.get(T + '?kind=pr', HTTP_IF_MODIFIED_SINCE=since).status_code, 200)
