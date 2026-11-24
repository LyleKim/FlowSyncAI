from django.urls import path

from . import views_arch

urlpatterns = [
    path('architecture/', views_arch.architecture, name='integrations-architecture'),
]
