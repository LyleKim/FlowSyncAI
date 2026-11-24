from django.urls import path

from . import views_areas

urlpatterns = [
    path('watched-repos/<int:repo_id>/areas/', views_areas.area_list),
    path('watched-repos/<int:repo_id>/areas/<str:area_id>/', views_areas.area_detail),
]
