from django.urls import path

from . import views_aliases

urlpatterns = [
    path('watched-repos/<int:repo_id>/area-aliases/', views_aliases.alias_list_create),
    path('watched-repos/<int:repo_id>/area-aliases/<int:alias_id>/', views_aliases.alias_detail),
]
