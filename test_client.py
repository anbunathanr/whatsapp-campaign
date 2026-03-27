import requests
from PIL import Image, ImageDraw
import io
import time

print("Creating dummy image...")
img = Image.new('RGB', (400, 200), color = (73, 109, 137))
d = ImageDraw.Draw(img)
d.text((10,10), "AI Internship Program 2026", fill=(255,255,0))

img_byte_arr = io.BytesIO()
img.save(img_byte_arr, format='JPEG')
img_byte_arr.seek(0)

print("Sending request to /api/analyze-campaign...")
files = {'file': ('test_poster.jpg', img_byte_arr, 'image/jpeg')}
try:
    response = requests.post('http://localhost:8000/api/analyze-campaign', files=files)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
except Exception as e:
    print(f"Error: {e}")
