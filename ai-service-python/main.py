from fastapi import FastAPI
from pydantic import BaseModel
import joblib

app = FastAPI()

model = joblib.load("naive_bayes_model.pkl")
vectorizer = joblib.load("vectorizer.pkl")

# Estructura del JSON que recibirá desde Node.js
class CommentInput(BaseModel):
    content: str

@app.post("/predict")
def predict_comment(data: CommentInput):
    text = data.content
    
    # 1. Vectorizar el texto del comentario
    text_vectorized = vectorizer.transform([text])
    
    # 2. Hacer la predicción (0 = No ofensivo, 1 = Ofensivo)
    prediction = model.predict(text_vectorized)[0]
    
    # 3. Obtener las probabilidades reales del modelo
    probabilities = model.predict_proba(text_vectorized)[0]
    offensive_probability = float(probabilities[1])
    
    # 4. Calcular métricas para tu base de datos
    is_offensive = bool(prediction == 1 or offensive_probability > 0.5)
    sentiment_score = round(1.0 - offensive_probability, 2)

    return {
        "sentiment_score": sentiment_score,
        "is_offensive": is_offensive,
        "confidence": round(float(probabilities[prediction]), 2)
    }