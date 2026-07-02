import json
import os

import requests
from django.conf import settings


def run_checklist_generation(title, description, reviews_str):
    """
    Executes the content generation via Groq API (Chat Completions) using requests.
    Supports JSON mode.
    """
    api_key = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is required")

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    prompt = (
        "You are a professional project manager. Please generate a detailed subtask checklist "
        "for the following task to ensure high-quality execution.\n\n"
        f"Task Title: {title}\n"
        f"Description: {description}\n"
    )
    if reviews_str:
        prompt += f"Role Feedback & Reviews:\n{reviews_str}\n\n"
    
    prompt += (
        "Please generate 3 to 6 actionable, clear subtasks as a checklist.\n"
        "You MUST output the result as a raw JSON object with a single root key 'checklist'. "
        "The 'checklist' value should be a list of objects, where each object has a 'title' field "
        "(a string describing the subtask, preferably in Korean since the input is in Korean) and a 'completed' field (always false).\n"
        "Example format:\n"
        "{\n"
        "  \"checklist\": [\n"
        "    { \"title\": \"Subtask 1 description\", \"completed\": false },\n"
        "    { \"title\": \"Subtask 2 description\", \"completed\": false }\n"
        "  ]\n"
        "}\n"
        "Output ONLY raw valid JSON."
    )

    data = {
        "model": "llama-3.1-8b-instant",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2
    }

    response = requests.post(url, headers=headers, json=data, timeout=30)
    response.raise_for_status()
    
    result = response.json()
    choices = result.get("choices", [])
    if not choices:
        raise ValueError("No choices returned from Groq API")
        
    return choices[0]["message"]["content"]

