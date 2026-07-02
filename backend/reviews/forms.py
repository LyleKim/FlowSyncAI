from django import forms
from .models import RoleReview

class RoleReviewForm(forms.ModelForm):
    class Meta:
        model = RoleReview
        fields = [
            'id', 'task_id', 'role', 'reviewer_name', 'reviewer_id',
            'comment', 'is_accepted', 'accepted_at', 'urgency', 'next_reviewer_tag'
        ]

    def clean_role(self):
        role = self.cleaned_data.get('role')
        if role:
            role = role.strip()
        if not role:
            raise forms.ValidationError("리뷰 역할군은 필수 항목입니다.")
        return role

    def clean_comment(self):
        comment = self.cleaned_data.get('comment', '')
        return comment.strip() if comment else ''

    def clean_next_reviewer_tag(self):
        tag = self.cleaned_data.get('next_reviewer_tag', '')
        return tag.strip() if tag else ''

