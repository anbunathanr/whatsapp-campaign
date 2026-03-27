import requests
from PIL import Image, ImageDraw
import io
import time
import subprocess
import os

print("Starting backend server...")
# Start the server in the background
server_process = subprocess.Popen(["py", "main.py"])

# Give the server time to start up and load the ML model
time.sleep(10)

try:
    print("Creating dummy image...")
    # Create a dummy image with PIL
    img = Image.new('RGB', (400, 200), color = (73, 109, 137))
    d = ImageDraw.Draw(img)
    d.text((10,10), "AI Internship Program 2026", fill=(255,255,0))
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    
    print("Sending request to /api/analyze-campaign...")
    files = {'file': ('test_poster.jpg', img_byte_arr, 'image/jpeg')}
    response = requests.post('http://localhost:8000/api/analyze-campaign', files=files)
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
finally:
    print("Terminating server...")
    server_process.terminate()
