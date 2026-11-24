from django.urls import path

from . import views_prs

urlpatterns = [
    path('watched-repos/', views_prs.watched_repo_list_create),
    path('watched-repos/<int:pk>/', views_prs.watched_repo_detail),
]
