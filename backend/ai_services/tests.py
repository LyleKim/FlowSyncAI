import json
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings

from .serializers import parse_checklist_response

URL = '/api/v1/generate-checklist/'
BODY = {'title': 't', 'roleReviews': [{'role': 'dev', 'comment': 'c'}]}
GOOD = '{"checklist": [{"title": "a", "completed": false}]}'


class GenerateChecklistViewTests(TestCase):
    def post(self, body=BODY):
        return self.client.post(URL, json.dumps(body), content_type='application/json')

    @mock.patch('ai_services.services.requests.post')
    @override_settings(GROQ_API_KEY='k')
    def test_success(self, m):
        m.return_value.json.return_value = {'choices': [{'message': {'content': GOOD}}]}
        r = self.post()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['checklist'][0]['title'], 'a')

    @mock.patch('ai_services.views.run_checklist_generation', side_effect=ValueError('bad'))
    def test_value_error_is_502(self, _):
        r = self.post()
        self.assertEqual(r.status_code, 502)
        self.assertEqual(r.json()['error'], 'bad')

    @mock.patch('ai_services.services.requests.post', side_effect=RuntimeError('boom'))
    @override_settings(GROQ_API_KEY='k')
    def test_other_exception_is_500(self, _):
        self.assertEqual(self.post().status_code, 500)

    @mock.patch('ai_services.services.requests.post')
    @override_settings(GROQ_API_KEY='k')
    def test_no_choices_is_502(self, m):
        m.return_value.json.return_value = {'choices': []}
        self.assertEqual(self.post().status_code, 502)

    @override_settings(GROQ_API_KEY='')
    @mock.patch.dict('os.environ', {}, clear=True)
    def test_missing_key_is_502(self):
        self.assertEqual(self.post().status_code, 502)

    def test_validation_400(self):
        self.assertEqual(self.post({'title': ''}).status_code, 400)
        self.assertEqual(self.post({'title': 't'}).status_code, 400)


class ParseChecklistResponseTests(SimpleTestCase):
    def test_plain(self):
        self.assertEqual(parse_checklist_response(GOOD)['checklist'][0]['title'], 'a')

    def test_code_fence(self):
        self.assertIn('checklist', parse_checklist_response(f'```json\n{GOOD}\n```'))

    def test_invalid_json_raises_value_error(self):
        with self.assertRaises(ValueError):  # JSONDecodeError subclasses ValueError
            parse_checklist_response('nope')
        with self.assertRaises(ValueError):
            parse_checklist_response(None)

    def test_missing_key_or_non_dict(self):
        for raw in ('{"x": 1}', '[1]'):
            with self.assertRaises(ValueError):
                parse_checklist_response(raw)
