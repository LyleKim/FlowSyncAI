from django.db import models


class WatchedRepo(models.Model):
    url = models.URLField(unique=True)
    owner = models.CharField(max_length=100)
    name = models.CharField(max_length=100)
    # whose review requests to track
    github_login = models.CharField(max_length=100, blank=True, default='')
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.owner}/{self.name}'


class SeenPullRequest(models.Model):
    """PRs already turned into Tasks; keeps deleted/completed tasks from being re-created."""
    repo = models.ForeignKey(WatchedRepo, on_delete=models.CASCADE, related_name='seen_prs')
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['repo', 'number'], name='uniq_seen_pr')]
