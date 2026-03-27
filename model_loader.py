import joblib
import os

class ModelLoader:
    _instance = None
    _model = None
    _classes = None

    @classmethod
    def get_model(cls, model_path="industry_classifier_model_v2.pkl"):
        if cls._instance is None:
            cls._instance = cls()
            if os.path.exists(model_path):
                try:
                    cls._model = joblib.load(model_path)
                    print(f"Model loaded successfully from {model_path}")
                    
                    # Load labels
                    class_path = model_path.replace('.pkl', '_classes.joblib')
                    if os.path.exists(class_path):
                        cls._classes = joblib.load(class_path)
                        print(f"Classes loaded from {class_path}")
                except Exception as e:
                    print(f"Error loading model: {e}")
                    cls._model = None
            else:
                print(f"Model file not found at {model_path}")
                cls._model = None
        return cls._model

    @classmethod
    def get_classes(cls):
        return cls._classes

# Singleton instance access
def get_model():
    return ModelLoader.get_model()

def get_classes():
    return ModelLoader.get_classes()
