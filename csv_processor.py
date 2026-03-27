import pandas as pd
import io
import numpy as np
from model_loader import get_classes

class CSVProcessor:
    @staticmethod
    def normalize_string(s):
        """Normalize string: lowercase, remove spaces and underscores."""
        if not isinstance(s, str):
            return ""
        return s.lower().strip().replace('_', '').replace(' ', '')

    @staticmethod
    def find_column_advanced(df, keywords):
        """
        Intelligently find a column based on keywords.
        Returns the original column name if a match is found.
        """
        # First try exact normalized match
        columns_normalized = {CSVProcessor.normalize_string(c): c for c in df.columns}
        for keyword in keywords:
            if keyword in columns_normalized:
                return columns_normalized[keyword]
        
        # Then try "contains" match
        for col_name in df.columns:
            normalized_col = CSVProcessor.normalize_string(col_name)
            if any(keyword in normalized_col for keyword in keywords):
                return col_name
        return None

    @classmethod
    def process_csv(cls, content, model):
        """Processes CSV content and returns a list of classification results with confidence scores."""
        try:
            df = pd.read_csv(io.BytesIO(content))
        except Exception as e:
            return None, f"Invalid CSV file: {str(e)}"
        
        if df.empty:
            return None, "CSV file is empty"

        # Column identification
        job_keywords = ["jobtitle", "job_title", "occupation", "profession", "role", "designation", "position", "work", "job"]
        company_keywords = ["company", "companyname", "organization", "employer", "firm", "business", "corp"]
        name_keywords = ["name", "fullname", "contactname", "customername", "user", "contact"]
        phone_keywords = ["phone", "mobile", "contactnumber", "phonenumber", "tel", "cell", "mobilenumber", "contact_no"]
        
        job_title_col = cls.find_column_advanced(df, job_keywords)
        company_col = cls.find_column_advanced(df, company_keywords)
        name_col = cls.find_column_advanced(df, name_keywords)
        phone_col = cls.find_column_advanced(df, phone_keywords)
        
        if not job_title_col:
            return None, "No job-related column found. Supported column names include JobTitle, Job Title, Profession, Occupation, Role, or Designation."

        # Feature Engineering: Combine JobTitle and CompanyName
        titles = df[job_title_col].fillna('').astype(str)
        companies = df[company_col].fillna('').astype(str) if company_col else pd.Series([''] * len(df))
        
        combined_features = (titles + " " + companies).tolist()
        
        # Run predictions with confidence
        try:
            # Get class names from loader
            classes = get_classes()
            
            # predict_proba returns array of shape (n_samples, n_classes)
            probs = model.predict_proba(combined_features)
            
            # Find the index of the max probability for each sample
            max_prob_indices = np.argmax(probs, axis=1)
            # Find the max probability itself
            max_probs = np.max(probs, axis=1)
            
            # Map indices back to class labels
            if classes is not None:
                predicted_labels = [classes[idx] for idx in max_prob_indices]
            else:
                # Fallback to model's own classes if available
                predicted_labels = [model.classes_[idx] for idx in max_prob_indices]
                
        except Exception as e:
            return None, f"Model prediction error: {str(e)}"
        
        results = []
        for i in range(len(df)):
            row = df.iloc[i]
            confidence = float(max_probs[i])
            
            # Build top-3 alternatives (sorted by probability descending)
            all_probs = probs[i]
            top3_indices = np.argsort(all_probs)[::-1][:3]
            if classes is not None:
                alternatives = [
                    {"industry": str(classes[idx]), "confidence": round(float(all_probs[idx]), 4)}
                    for idx in top3_indices
                ]
            else:
                alternatives = [
                    {"industry": str(model.classes_[idx]), "confidence": round(float(all_probs[idx]), 4)}
                    for idx in top3_indices
                ]

            result = {
                "name": str(row[name_col]) if name_col and not pd.isna(row[name_col]) else "Unknown",
                "phone": str(row[phone_col]) if phone_col and not pd.isna(row[phone_col]) else "Unknown",
                "jobTitle": str(row[job_title_col]) if not pd.isna(row[job_title_col]) else "Unknown",
                "companyName": str(row[company_col]) if company_col and not pd.isna(row[company_col]) else "Unknown",
                "predictedIndustry": str(predicted_labels[i]),
                "confidenceScore": round(confidence, 4),
                "isLowConfidence": confidence < 0.6,
                "alternativePredictions": alternatives
            }
            results.append(result)
            
        return results, None
