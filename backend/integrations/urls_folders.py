from django.urls import path

from . import views_folders

urlpatterns = [
    path('watched-repos/<int:repo_id>/tree/', views_folders.folder_tree),
    path('watched-repos/<int:repo_id>/tree/folders/', views_folders.folder_description),
    path('watched-repos/<int:repo_id>/describe/', views_folders.describe),
]
