"""Area helpers: cached repo tree -> groups, path-prefix identity, alias status."""
from django.core.cache import cache

from . import github_client
from .architecture import group_paths
from .pr_sync import iso_z

CACHE_SECONDS = 300


def get_paths(owner, name, refresh=False):
    key = f'tree:{owner.lower()}/{name.lower()}'
    paths = None if refresh else cache.get(key)
    if paths is None:
        paths = github_client.list_repo_tree(owner, name)  # GitHubError propagates
        cache.set(key, paths, CACHE_SECONDS)
    return paths


def get_groups(owner, name, refresh=False):
    return group_paths(get_paths(owner, name, refresh))


def path_prefix(group):
    return '/'.join(group.prefix) if group.prefix else '@' + group.id


def alias_status(aliases, groups):
    if groups is None:
        return {a.id: 'unknown' for a in aliases}
    prefixes = {path_prefix(g) for g in groups}
    return {a.id: 'connected' if a.path_prefix in prefixes else 'disconnected' for a in aliases}


def serialize_alias(alias, status):
    return {'id': alias.id, 'repoId': alias.repo_id, 'pathPrefix': alias.path_prefix,
            'displayName': alias.display_name, 'status': status,
            'createdAt': iso_z(alias.created_at), 'updatedAt': iso_z(alias.updated_at)}
