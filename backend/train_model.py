import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.preprocessing import LabelEncoder

def train_industry_model(csv_path="synthetic_contacts.csv", model_path="industry_classifier_model_v2.pkl"):
    print(f"Loading dataset from {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        print(f"Error: {csv_path} not found. Please run generate_data.py first.")
        return

    # Feature Engineering: Combine JobTitle and CompanyName
    # We fill NaN to avoid 'nan' string in combined text
    df['JobTitle'] = df['JobTitle'].fillna('')
    df['CompanyName'] = df['CompanyName'].fillna('')
    df['combined_text'] = df['JobTitle'] + " " + df['CompanyName']
    
    X = df['combined_text']
    y = df['Industry']

    # Encode labels for XGBoost (it requires numeric labels)
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded)

    # Define experiments
    models = {
        "RandomForest": RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1, class_weight='balanced'),
        "LogisticRegression": LogisticRegression(max_iter=1000, multi_class='multinomial', class_weight='balanced', random_state=42),
        "XGBoost": XGBClassifier(n_estimators=100, learning_rate=0.1, max_depth=6, random_state=42, use_label_encoder=False, eval_metric='mlogloss')
    }

    best_f1 = 0
    best_pipeline = None
    best_model_name = ""

    for name, model in models.items():
        print(f"\n--- Training and Evaluating {name} ---")
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), stop_words="english", max_features=10000)),
            ('clf', model)
        ])
        
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        
        f1 = f1_score(y_test, y_pred, average='weighted')
        print(f"{name} F1-score: {f1:.4f}")
        
        if f1 > best_f1:
            best_f1 = f1
            best_pipeline = pipeline
            best_model_name = name

    print(f"\nSelecting Best Model: {best_model_name} (F1: {best_f1:.4f})")

    # Final Evaluation
    y_pred = best_pipeline.predict(X_test)
    print("\n--- Final Model Performance ---")
    print(f"Accuracy:  {accuracy_score(y_test, y_pred):.4f}")
    print(f"Precision: {precision_score(y_test, y_pred, average='weighted'):.4f}")
    print(f"Recall:    {recall_score(y_test, y_pred, average='weighted'):.4f}")
    print(f"F1-score:  {f1_score(y_test, y_pred, average='weighted'):.4f}")
    
    print("\n--- Classification Report ---")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # Save components
    # We save the classes as a separate file to be safe, or just rely on the classifier's classes
    # Actually, for the backend to work easily, we can just save the pipeline.
    # We can retrieve classes via best_pipeline.named_steps['clf'].classes_
    
    print(f"Saving model pipeline to {model_path}...")
    # Add classes to the classifier object itself so they are persisted
    # but the LabelEncoder's classes are what we want.
    # The classifier's .classes_ will match le.classes_ because of how we encoded.
    joblib.dump(best_pipeline, model_path)
    # Also save the classes for the backend
    class_names_path = model_path.replace('.pkl', '_classes.joblib')
    joblib.dump(le.classes_, class_names_path)
    print(f"Model and classes saved ({model_path}, {class_names_path})")

    # Verify specific roles
    test_cases = [
        "Electrician",
        "Cloud Architect",
        "Mechanical Engineer",
        "DevOps Engineer"
    ]
    print("\n--- Verifying Specific Test Cases ---")
    for tc in test_cases:
        pred_idx = best_pipeline.predict([tc])[0]
        pred_label = le.classes_[pred_idx]
        print(f"Job Title: '{tc}' -> Predicted Industry: '{pred_label}'")

if __name__ == "__main__":
    train_industry_model()
