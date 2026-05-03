#!/usr/bin/env bash
# Manual API test script for Room Vision AI
BASE="http://127.0.0.1:8321/api/v1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="00000000-0000-0000-0000-000000000001"

echo "=== HEALTH ==="
curl -s "$BASE/health" | python3 -m json.tool

echo ""
echo "=== DETECT ==="
curl -s -X POST "$BASE/detect" \
  -F "images=@$SCRIPT_DIR/image.jpg;type=image/jpeg" \
  -F 'metadata=[{"filename":"image.jpg","format":"jpeg","width":1920,"height":1080,"captured_at":"2026-05-02T00:00:00Z","file_size_bytes":500000}]' \
  | python3 -m json.tool

echo ""
echo "=== MANIPULATE (child safety) ==="
curl -s -X POST "$BASE/manipulate" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"prompt\": \"make it safe for children\",
    \"block_model\": {
      \"version\": \"1.0\",
      \"room_dimensions\": {\"width\": 5.0, \"height\": 2.5, \"depth\": 4.0},
      \"blocks\": []
    }
  }" | python3 -m json.tool

echo ""
echo "=== MANIPULATE (elderly accessibility) ==="
curl -s -X POST "$BASE/manipulate" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"prompt\": \"make it accessible for elderly\",
    \"block_model\": {
      \"version\": \"1.0\",
      \"room_dimensions\": {\"width\": 5.0, \"height\": 2.5, \"depth\": 4.0},
      \"blocks\": []
    }
  }" | python3 -m json.tool

echo ""
echo "=== STAGE AND COMMIT ==="
cd /mnt/c/Users/Htoo/Desktop/kiro-hackathon-repo
git add .kiro/hooks/xss-prevention.kiro.hook
git add .kiro/specs/room-vision-ai/tasks.md
git add ai-pipeline/test_manual.sh
git add -u ai-pipeline/data/feedback/
git status --short -- .kiro/ ai-pipeline/test_manual.sh ai-pipeline/data/ 2>&1
git commit -m "ai-pipeline: cleanup session artifacts, restore xss hook, update tasks" 2>&1
git push origin feature/ai-pipeline-member3 2>&1
echo DONE
# Manual API test script for Room Vision AI
BASE="http://127.0.0.1:8321/api/v1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSION="00000000-0000-0000-0000-000000000001"

echo "=== HEALTH ==="
curl -s "$BASE/health" | python3 -m json.tool

echo ""
echo "=== DETECT ==="
curl -s -X POST "$BASE/detect" \
  -F "images=@$SCRIPT_DIR/image.jpg;type=image/jpeg" \
  -F 'metadata=[{"filename":"image.jpg","format":"jpeg","width":1920,"height":1080,"captured_at":"2026-05-02T00:00:00Z","file_size_bytes":500000}]' \
  | python3 -m json.tool

echo ""
echo "=== MANIPULATE (child safety) ==="
curl -s -X POST "$BASE/manipulate" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"prompt\": \"make it safe for children\",
    \"block_model\": {
      \"version\": \"1.0\",
      \"room_dimensions\": {\"width\": 5.0, \"height\": 2.5, \"depth\": 4.0},
      \"blocks\": []
    }
  }" | python3 -m json.tool

echo ""
echo "=== MANIPULATE (elderly accessibility) ==="
curl -s -X POST "$BASE/manipulate" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"prompt\": \"make it accessible for elderly\",
    \"block_model\": {
      \"version\": \"1.0\",
      \"room_dimensions\": {\"width\": 5.0, \"height\": 2.5, \"depth\": 4.0},
      \"blocks\": []
    }
  }" | python3 -m json.tool

echo ""
echo "=== FULL TEST SUITE ==="
cd /mnt/c/Users/Htoo/Desktop/kiro-hackathon-repo/ai-pipeline
PYTHONPATH=src .venv/bin/python3 -m pytest tests/ -v 2>&1
