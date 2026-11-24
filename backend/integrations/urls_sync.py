from django.urls import path

from . import views_sync

urlpatterns = [
    path('sync-prs/', views_sync.sync_prs),
]
