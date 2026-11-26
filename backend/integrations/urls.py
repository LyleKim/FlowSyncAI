from django.urls import include, path

urlpatterns = [
    path('', include('integrations.urls_prs')),   # feature 1: PR review-request sync
    path('', include('integrations.urls_arch')),  # feature 2: architecture groups
    path('', include('integrations.urls_sync')),  # repo sync orchestration
    path('', include('integrations.urls_queue')),  # my review-request queue
    path('', include('integrations.urls_aliases')),  # area aliases
    path('', include('integrations.urls_areas')),  # area list/detail
    path('', include('integrations.urls_folders')),  # folder tree + AI folder descriptions
]
