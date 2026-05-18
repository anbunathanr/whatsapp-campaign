from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import numpy as np
from model_loader import get_model, get_classes
from csv_processor import CSVProcessor
import pytesseract
from PIL import Image
import io
app = FastAPI(title="Industry Classification System API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ContactRequest(BaseModel):
    name: str = "Unknown"
    phone: str = "Unknown"
    jobTitle: str
    companyName: str = ""

@app.on_event("startup")
async def startup_event():
    # Pre-load model at startup
    get_model()

@app.get("/health")
def health_check():
    model = get_model()
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }

@app.post("/api/classify-contact")
async def classify_contact(contact: ContactRequest):
    model = get_model()
    classes = get_classes()
    if not model:
        raise HTTPException(status_code=500, detail="Machine learning model is not available.")
    
    try:
        combined_text = f"{contact.jobTitle} {contact.companyName}"
        # predict_proba for confidence
        probs = model.predict_proba([combined_text])[0]
        max_idx = np.argmax(probs)
        confidence = float(probs[max_idx])
        
        predicted_label = classes[max_idx] if classes is not None else str(model.classes_[max_idx])
        
        return {
            "predictedIndustry": predicted_label,
            "confidenceScore": round(confidence, 4),
            "isLowConfidence": confidence < 0.6
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.post("/api/classify-csv")
async def classify_csv(file: UploadFile = File(...)):
    model = get_model()
    if not model:
        raise HTTPException(status_code=500, detail="Machine learning model is not available.")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a .csv file.")
    
    try:
        content = await file.read()
        results, error = CSVProcessor.process_csv(content, model)
        
        if error:
            raise HTTPException(status_code=400, detail=error)
            
        return {"results": results}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV processing error: {str(e)}")

@app.post("/api/analyze-campaign")
async def analyze_campaign(file: UploadFile = File(...)):
    model = get_model()
    classes = get_classes()
    if not model:
        raise HTTPException(status_code=500, detail="Machine learning model is not available.")
        
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an image.")
        
    try:
        content = await file.read()
        image = Image.open(io.BytesIO(content))
        
        # Extract text using OCR
        try:
            # Add common Windows installation path to save user from PATH issues
            pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            extracted_text = pytesseract.image_to_string(image).strip()
        except Exception as ocr_err:
            raise HTTPException(status_code=500, detail=f"OCR engine error. Ensure Tesseract is installed: {str(ocr_err)}")
            
        if not extracted_text:
            extracted_text = "No readable text found in image."
            
        # Classify the extracted text
        probs = model.predict_proba([extracted_text])[0]
        max_idx = np.argmax(probs)
        confidence = float(probs[max_idx])
        
        predicted_label = classes[max_idx] if classes is not None else str(model.classes_[max_idx])
        
        return {
            "detectedIndustry": predicted_label,
            "extractedText": extracted_text,
            "confidenceScore": round(confidence, 4)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
