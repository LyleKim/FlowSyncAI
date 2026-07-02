from django.db import models


class IdempotencyRecord(models.Model):
    """POST 재시도 시 동일 응답을 반환하기 위한 멱등성 키 저장."""

    key = models.CharField(max_length=255, verbose_name='멱등성 키')
    scope = models.CharField(max_length=100, verbose_name='요청 범위')
    response_status = models.PositiveSmallIntegerField(verbose_name='응답 상태 코드')
    response_body = models.TextField(verbose_name='응답 본문(JSON)')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='생성 일시')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['key', 'scope'], name='uniq_idempotency_key_scope'),
        ]
        indexes = [
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.scope}:{self.key}'
