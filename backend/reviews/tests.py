"""Characterization tests: pin current behavior of the reviews API."""
import json

from django.test import TestCase

from reviews.models import RoleReview
from tasks.models import Task

T = '/api/v1/tasks/'
R = T + 't1/reviews/'


class ReviewTests(TestCase):
    def req(self, method, url, body=None, **h):
        kw = {'content_type': 'application/json'}
        if body is not None:
            kw['data'] = json.dumps(body)
        return getattr(self.client, method)(url, **kw, **h)

    def setUp(self):
        Task.objects.create(id='t1', title='T')

    def test_first_review_flips_todo_to_inprogress_and_shape(self):
        r = self.req('post', R, {'id': 'r1', 'role': 'dev', 'comment': 'hi', 'reviewerId': 'bob',
                                 'urgency': 'high', 'nextReviewerTag': '@qa'})
        self.assertEqual(r.status_code, 201)
        d = r.json()
        created = d.pop('createdAt')
        self.assertTrue(created)
        self.assertEqual(d, {'id': 'r1', 'role': 'dev', 'comment': 'hi', 'reviewerId': 'bob',
                             'isAccepted': False, 'acceptedAt': None, 'urgency': 'high',
                             'nextReviewerTag': '@qa', 'taskStatus': 'inprogress'})
        self.assertEqual(Task.objects.get(pk='t1').status, 'inprogress')

    def test_defaults(self):
        d = self.req('post', R, {'role': 'dev'}).json()
        self.assertEqual((d['urgency'], d['isAccepted'], d['nextReviewerTag'], d['reviewerId']),
                         ('normal', False, None, ''))
        self.assertTrue(d['id'].startswith('rev-'))

    def test_second_review_does_not_change_status(self):
        self.req('post', R, {'role': 'dev'})
        Task.objects.filter(pk='t1').update(status='review')
        d = self.req('post', R, {'role': 'qa'}).json()
        self.assertEqual(d['taskStatus'], 'review')
        self.assertEqual(Task.objects.get(pk='t1').status, 'review')

    def test_first_review_does_not_flip_non_todo(self):
        Task.objects.filter(pk='t1').update(status='done')
        self.assertEqual(self.req('post', R, {'role': 'dev'}).json()['taskStatus'], 'done')

    def test_replay_same_id_200_status_not_reflipped_diff_409(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev'})
        r = self.req('post', R, {'id': 'r1', 'role': 'dev'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.req('post', R, {'id': 'r1', 'role': 'qa'}).status_code, 409)
        self.assertEqual(RoleReview.objects.count(), 1)

    def test_idempotency_key_replay(self):
        h = {'HTTP_IDEMPOTENCY_KEY': 'k'}
        r1 = self.req('post', R, {'role': 'dev'}, **h)
        r2 = self.req('post', R, {'role': 'dev'}, **h)
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 201)
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(RoleReview.objects.count(), 1)

    def test_validation_and_404(self):
        r = self.req('post', R, {'comment': 'no role'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('role', r.json()['details']['fields'])
        self.assertEqual(self.req('post', T + 'nope/reviews/', {'role': 'x'}).status_code, 404)

    def test_body_taskId_overridden_by_url(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev', 'taskId': 'other'})
        self.assertEqual(RoleReview.objects.get(pk='r1').task_id, 't1')

    def test_list_get(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev'})
        self.req('post', R, {'id': 'r2', 'role': 'qa'})
        self.assertEqual([x['id'] for x in self.client.get(R).json()], ['r1', 'r2'])

    def test_patch(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev'})
        d = self.req('patch', R + 'r1/', {'isAccepted': True, 'acceptedAt': '2024-01-01',
                                          'comment': 'ok'}).json()
        self.assertTrue(d['isAccepted'])
        self.assertEqual((d['acceptedAt'], d['comment'], d['role']), ('2024-01-01', 'ok', 'dev'))
        self.assertEqual(self.req('patch', R + 'r1/', {}).status_code, 200)  # no-op
        self.assertEqual(self.req('patch', R + 'r1/', {'role': ''}).status_code, 400)
        self.assertEqual(self.req('patch', R + 'zz/', {}).status_code, 404)

    def test_delete(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev'})
        r = self.req('delete', R + 'r1/')
        self.assertEqual(r.json(), {'message': 'Review deleted successfully'})
        self.assertEqual(RoleReview.objects.count(), 0)
        self.assertEqual(self.req('delete', R + 'r1/').status_code, 404)
        # status stays inprogress after delete
        self.assertEqual(Task.objects.get(pk='t1').status, 'inprogress')

    def test_review_in_task_payload(self):
        self.req('post', R, {'id': 'r1', 'role': 'dev'})
        d = self.client.get(T + 't1/').json()
        self.assertEqual(d['roleReviews'][0]['id'], 'r1')
        self.assertNotIn('taskStatus', d['roleReviews'][0])
