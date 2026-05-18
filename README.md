# 🎯 WhatsApp Campaign — AI-Powered Industry Classification System

An intelligent contact segmentation platform that uses Machine Learning to classify contacts by industry based on their job title and company name. Upload a CSV of contacts or a campaign poster image, and the system automatically identifies the target audience for your WhatsApp marketing campaigns.

---

## ✨ Features

- **Single Contact Classification** — Classify any contact by job title + company in real time
- **Bulk CSV Classification** — Upload a contacts CSV for batch industry prediction with confidence scores
- **Campaign Poster Analysis (OCR)** — Upload a poster image; the system extracts text via OCR and detects the relevant industry automatically
- **Top-3 Alternatives** — Each prediction comes with the top 3 alternative industries and their confidence scores
- **React Frontend** — Modern, responsive UI built with React 19 + Vite + Tailwind CSS + Framer Motion
- **FastAPI Backend** — High-performance REST API with automatic docs at `/docs`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI, Uvicorn |
| **Node Backend** | Node.js, Express, MongoDB, Redis, BullMQ |
| **ML Pipeline** | scikit-learn, XGBoost, TF-IDF Vectorizer |
| **OCR** | Tesseract OCR via `pytesseract` |
| **Frontend** | React 19, Vite, Tailwind CSS v4, Framer Motion, Axios |
| **WhatsApp API** | Twilio WhatsApp Business API |
| **Data Generation** | Faker, Pandas, NumPy |

---

## 📁 Project Structure

```
whatsapp-campaign/
├── main.py                          # FastAPI app & API routes
├── model_loader.py                  # Singleton model loader
├── csv_processor.py                 # Intelligent CSV parsing & batch inference
├── train_model.py                   # ML training pipeline (RF, LR, XGBoost)
├── generate_data.py                 # Synthetic contact dataset generator (50k records)
├── industry_classifier_model_v2.pkl # Trained ML model (best of 3 algorithms)
├── industry_classifier_model_v2_classes.joblib  # Class label encoder
├── label_encoder.joblib             # Label encoder artifact
├── synthetic_contacts.csv           # Generated training dataset
├── test_campaign_api.py             # API test script
├── test_client.py                   # Client test script
└── frontend/                        # React + Vite frontend application
    ├── src/                         # React source files
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) installed at:
  `C:\Program Files\Tesseract-OCR\tesseract.exe` (Windows default)

### 1. Install Python Dependencies

```bash
pip install fastapi uvicorn scikit-learn xgboost pandas numpy joblib pillow pytesseract faker matplotlib seaborn
```

### 2. (Optional) Generate Training Data & Retrain Model

> Skip this step if you already have the `.pkl` model files.

```bash
# Generate 50,000 synthetic contacts
python generate_data.py

# Train and select the best model (RandomForest, LogisticRegression, XGBoost)
python train_model.py
```
## 🚫 .gitignore — Excluded Files

Two large files are excluded from the repository and must be regenerated locally after cloning:

| Excluded File | Reason | How to Regenerate |
|---|---|---|
| `industry_classifier_model_v2.pkl` | Trained ML model — exceeds GitHub's 100 MB limit | `python train_model.py` |
| `synthetic_contacts.csv` | 50,000-row synthetic dataset | `python generate_data.py` |

> Run `generate_data.py` first, then `train_model.py`.

### 3. Start the Backend API

```bash
python main.py
```

The API will be available at **http://localhost:8000**
Interactive docs: **http://localhost:8000/docs**

### 4. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at **http://localhost:5173**

---

## 📱 Twilio WhatsApp Setup

This platform uses **Twilio** to send WhatsApp messages. Follow the steps below to get your free credentials.

### 🔗 Quick Links

| Resource | URL |
|---|---|
| **Twilio Website** | https://www.twilio.com |
| **Free Sign Up** | https://www.twilio.com/try-twilio |
| **Twilio Console** | https://console.twilio.com |
| **WhatsApp Sandbox** | https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn |

### Step 1 — Create a Free Twilio Account

1. Visit **https://www.twilio.com/try-twilio**
2. Fill in your name, email, and create a password
3. No credit card required for the free trial
4. Verify your email address to activate the account

### Step 2 — Verify Your Phone Number

During sign-up, Twilio asks for a real phone number to verify. This number will be the first one allowed to receive messages from the sandbox.

### Step 3 — Retrieve Your Account SID & Auth Token

1. Log in to the **Twilio Console** at https://console.twilio.com
2. On the **Account Info** section of the Dashboard homepage, you will find:
   - **Account SID** — starts with `AC...`
   - **Auth Token** — click the eye icon to reveal it
3. Copy both values

### Step 4 — Enable the WhatsApp Sandbox

1. In the Console, go to **Messaging → Try it out → Send a WhatsApp message**
2. Or navigate directly to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
3. Follow the on-screen prompt — send the displayed join code (e.g. `join <word>`) from your WhatsApp to **+1 415 523 8886**
4. Once joined, that WhatsApp number can receive messages from the sandbox

### Step 5 — Note the Sandbox Sender Number

The default Twilio WhatsApp sandbox number is:
```
whatsapp:+14155238886
```
> For a production approved number, apply for a WhatsApp Business Profile inside the Twilio Console.

### Step 6 — Enter Credentials in the Application

1. Open the application and log in
2. Navigate to **Settings & Integrations** (sidebar)
3. Find the **WhatsApp Business API** section
4. Fill in:
   | Field | Value |
   |---|---|
   | **Account SID** | Your `AC...` SID from the console |
   | **Auth Token** | Your auth token from the console |
   | **WhatsApp Sender Number** | `whatsapp:+14155238886` (sandbox) |
5. Click **Save Configuration**

### ⚠️ Free Trial Limitations

- Messages can only be sent to numbers that have **joined your sandbox** by sending the join code
- The Twilio trial account comes with a small credit — sufficient for testing
- To send messages to anyone without the join step, upgrade to a paid account and get an approved WhatsApp Business number

---

## 📡 API Reference

### `GET /health`
Returns the health status and model load state.

### `POST /api/classify-contact`
Classify a single contact by job title and company name.

**Request body:**
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "jobTitle": "Cloud Architect",
  "companyName": "Acme Corp"
}
```

**Response:**
```json
{
  "predictedIndustry": "Technology",
  "confidenceScore": 0.9123,
  "isLowConfidence": false
}
```

### `POST /api/classify-csv`
Upload a `.csv` file for bulk classification.
- Automatically detects `JobTitle`, `CompanyName`, `Name`, and `Phone` columns (flexible naming)
- Returns per-row predictions with top-3 alternative industries

### `POST /api/analyze-campaign`
Upload a campaign poster image (JPEG/PNG).
- Extracts text using Tesseract OCR
- Classifies the extracted text to detect the target industry

---

## 🧠 ML Model Details

The training pipeline benchmarks three algorithms and automatically selects the best:

| Model | Strategy |
|---|---|
| Random Forest | 100 estimators, class-weight balanced |
| Logistic Regression | Multinomial, max_iter=1000 |
| XGBoost | 100 estimators, learning_rate=0.1 |

- **Feature**: TF-IDF on `JobTitle + CompanyName` (unigrams + bigrams, top 10k features)
- **Selection Metric**: Weighted F1-score on a 20% holdout test set
- **Industries Covered**: 29 industries including Technology, Healthcare, Banking, Agriculture, Manufacturing, Retail, and more

---

## 📊 Supported Industries

Technology · Healthcare · Banking and Financial Services · Agriculture · Education · Manufacturing · Retail · Sales and Marketing · Telecommunications · Construction · Transportation and Logistics · Energy and Utilities · Pharmaceuticals · Insurance · Media and Entertainment · Hospitality and Tourism · Real Estate · Automotive · Government and Public Sector · Legal Services · Consulting · Aerospace and Defense · Biotechnology · E-commerce · Food and Beverage · Mining · Textiles and Apparel · Environmental Services · Human Resources · Information Technology Services

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
