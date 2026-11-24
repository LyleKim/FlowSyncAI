from django.db import models


class WatchedRepo(models.Model):
    url = models.URLField(unique=True)
    owner = models.CharField(max_length=100)
    name = models.CharField(max_length=100)
    # whose review requests to track
    github_login = models.CharField(max_length=100, blank=True, default='')
    # last *successful* sync
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error_kind = models.CharField(max_length=20, blank=True, default='')
    last_error_message = models.TextField(blank=True, default='')
    last_error_reset_at = models.DateTimeField(null=True, blank=True)
    truncated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.owner}/{self.name}'


class SeenPullRequest(models.Model):
    """PRs already turned into Tasks; keeps deleted/completed tasks from being re-created."""
    repo = models.ForeignKey(WatchedRepo, on_delete=models.CASCADE, related_name='seen_prs')
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['repo', 'number'], name='uniq_seen_pr')]


class PullRequest(models.Model):
    STATES = [('open', 'open'), ('merged', 'merged'), ('closed', 'closed')]
    repo = models.ForeignKey(WatchedRepo, on_delete=models.CASCADE, related_name='prs')
    number = models.PositiveIntegerField()
    title = models.CharField(max_length=500)
    url = models.URLField(max_length=500)
    author = models.CharField(max_length=100)
    is_draft = models.BooleanField(default=False)
    state = models.CharField(max_length=10, choices=STATES)
    pr_created_at = models.DateTimeField()
    pr_updated_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True, blank=True)
    merged_at = models.DateTimeField(null=True, blank=True)
    additions = models.PositiveIntegerField(default=0)
    deletions = models.PositiveIntegerField(default=0)
    changed_files = models.PositiveIntegerField(default=0)
    files = models.TextField(blank=True, default='[]')  # JSON list
    files_truncated = models.BooleanField(default=False)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['repo', 'number'], name='uniq_pr_repo_number')]


class PullRequestReviewer(models.Model):
    """Review request; team requests have login=''."""
    pr = models.ForeignKey(PullRequest, on_delete=models.CASCADE, related_name='reviewers')
    login = models.CharField(max_length=100, blank=True, default='')
    login_key = models.CharField(max_length=100, db_index=True, blank=True, default='')
    team_slug = models.CharField(max_length=200, blank=True, default='')  # 'org/slug'
    requested_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    removed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=['pr', 'login_key', 'team_slug'], name='uniq_pr_reviewer')]


class PullRequestReview(models.Model):
    """Latest review per person."""
    pr = models.ForeignKey(PullRequest, on_delete=models.CASCADE, related_name='reviews')
    login = models.CharField(max_length=100)
    login_key = models.CharField(max_length=100)
    state = models.CharField(max_length=30)
    submitted_at = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['pr', 'login_key'], name='uniq_pr_review')]


class AreaAlias(models.Model):
    repo = models.ForeignKey(WatchedRepo, on_delete=models.CASCADE, related_name='area_aliases')
    path_prefix = models.CharField(max_length=300)
    display_name = models.CharField(max_length=80)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['repo', 'path_prefix'], name='uniq_area_alias')]
