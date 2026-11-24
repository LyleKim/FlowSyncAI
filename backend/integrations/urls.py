from django.urls import include, path

urlpatterns = [
    path('', include('integrations.urls_prs')),   # feature 1: PR review-request sync
    path('', include('integrations.urls_arch')),  # feature 2: architecture groups
]
