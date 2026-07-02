from django import forms
from .models import ActivityLog

class ActivityLogForm(forms.ModelForm):
    class Meta:
        model = ActivityLog
        fields = ['task_id', 'action_type', 'actor_name', 'message']

    def clean_action_type(self):
        action_type = self.cleaned_data.get('action_type')
        if action_type:
            action_type = action_type.strip()
        # Custom validation can be added here if needed, but ModelForm automatically
        # checks choices defined on the field (ACTION_CHOICES)
        return action_type

    def clean_actor_name(self):
        actor_name = self.cleaned_data.get('actor_name')
        if actor_name:
            actor_name = actor_name.strip()
        return actor_name or 'NULL'

    def clean_message(self):
        message = self.cleaned_data.get('message')
        if message:
            message = message.strip()
        if not message:
            raise forms.ValidationError("활동 메시지는 필수 항목입니다.")
        return message
