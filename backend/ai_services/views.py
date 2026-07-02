import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .services import run_checklist_generation

@csrf_exempt
def generate_checklist(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST method required'}, status=405)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)
    
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    role_reviews = data.get('roleReviews', [])
    
    if not title:
        return JsonResponse({'error': 'Title is required'}, status=400)
    
    # Build detailed context for Groq
    reviews_str = ""
    if role_reviews:
        reviews_str = "\n".join([
            f"- [{r.get('role', 'Unknown')}] {r.get('comment', '')} (Approved: {r.get('isAccepted', False)})"
            for r in role_reviews if r.get('comment')
        ])
    
    try:
        result_text = run_checklist_generation(title, description, reviews_str)
        result_text = result_text.strip()
        
        # Clean markdown json blocks if any are returned
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            result_text = "\n".join(lines).strip()
            
        parsed_result = json.loads(result_text)
        return JsonResponse(parsed_result)
        
    except Exception as e:
        return JsonResponse({
            'error': f'체크리스트 생성에 실패했습니다: {str(e)}'
        }, status=500)
