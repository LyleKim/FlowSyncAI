from django.db import models

class RoleReview(models.Model):
    id = models.CharField(max_length=100, primary_key=True, verbose_name="검토 ID")
    task_id = models.CharField(max_length=100, verbose_name="대상 작업 ID")
    role = models.CharField(max_length=100, verbose_name="리뷰 역할군")
    reviewer_name = models.CharField(max_length=100, blank=True, default="", verbose_name="검토자 이름")
    reviewer_id = models.CharField(max_length=100, blank=True, default="", verbose_name="검토자 ID")
    comment = models.TextField(blank=True, default="", verbose_name="검토 의견")
    is_accepted = models.BooleanField(default=False, verbose_name="수락 여부")
    accepted_at = models.CharField(max_length=100, blank=True, default="", verbose_name="수락 일시")
    urgency = models.CharField(max_length=20, default="normal", verbose_name="긴급도")
    next_reviewer_tag = models.CharField(max_length=255, blank=True, default="", verbose_name="다음 검토자 지정 (태그)")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="리뷰 일시")

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role}] {self.reviewer_id or self.reviewer_name} - Approved: {self.is_accepted}"

