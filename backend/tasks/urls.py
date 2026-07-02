from django.urls import path
from . import views

urlpatterns = [
    path('', views.task_list_create, name='task-list-create'),
    path('<str:pk>/', views.task_detail, name='task-detail'),
]
