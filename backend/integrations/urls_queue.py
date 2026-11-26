from django.urls import path

from . import views_queue

urlpatterns = [
    path('review-queue/', views_queue.queue_list),
]
