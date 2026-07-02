from django.urls import path
from . import views

urlpatterns = [
    path('', views.activity_list_create, name='activity-list-create'),
]
