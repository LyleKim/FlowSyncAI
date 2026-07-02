from django.urls import path
from . import views

urlpatterns = [
    path('', views.review_list_create, name='review-list-create'),
    path('<str:pk>/', views.review_detail, name='review-detail'),
]
