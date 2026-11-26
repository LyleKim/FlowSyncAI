import logging

from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .decorators import api_view

logger = logging.getLogger(__name__)


@api_view
@require_http_methods(['GET'])
def health(request):
    """Liveness + DB check for load balancers/compose. No auth, no data."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except DatabaseError:
        logger.exception('health check: database unavailable')
        return JsonResponse({'status': 'error', 'db': 'error'}, status=503)
    return JsonResponse({'status': 'ok', 'db': 'ok'})
