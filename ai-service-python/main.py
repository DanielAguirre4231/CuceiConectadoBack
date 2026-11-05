import re
import unicodedata
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import joblib

app = FastAPI(title="AI Moderation Service")

model = None
vectorizer = None

SPANISH_STOPWORDS = [
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
    'con', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o',
    'este', 'sí', 'si', 'porque', 'esta', 'entre', 'cuando', 'muy', 'sobre', 'también',
    'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos',
    'uno', 'les', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto',
    'mí', 'antes', 'algunos', 'qué', 'unos', 'yo', 'otro', 'otras', 'otra', 'él', 'tanto',
    'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella', 'estar',
    'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tú', 'te', 'ti', 'tu', 'tus',
    'eres', 'es', 'soy', 'somos', 'son', 'sea', 'sean', 'estan', 'estoy', 'estamos',
    'da', 'mejor'
]

try:
    model = joblib.load('naive_bayes_model.pkl')
    vectorizer = joblib.load('vectorizer.pkl')
    print("Modelos cargados exitosamente.")
except Exception as e:
    print(f"ADVERTENCIA: No se pudieron cargar los modelos (.pkl): {str(e)}")

class CommentInput(BaseModel):
    text: Optional[str] = None
    content: Optional[str] = None

def clean_text_stem(text: str) -> str:
    text = str(text).lower()
    text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('utf-8')
    words = re.findall(r'\b\w+\b', text)
    cleaned = []
    for w in words:
        if w in SPANISH_STOPWORDS:
            continue
        if len(w) > 4 and w.endswith(('a', 'o', 'as', 'os')):
            w = re.sub(r'(a|o|as|os)$', '', w)
        cleaned.append(w)
    return " ".join(cleaned)

def get_max_word_toxicity(text_cleaned: str) -> float:
    """Mecanismo de seguridad de toxicidad individual por palabra para evitar dilución."""
    if model is None or vectorizer is None:
        return 0.0

    words = text_cleaned.split()
    vocab = vectorizer.vocabulary_

    class_log_prior = model.class_log_prior_
    p_non_off_prior = np.exp(class_log_prior[0])
    p_off_prior = np.exp(class_log_prior[1])

    log_prob_non_offensive = model.feature_log_prob_[0]
    log_prob_offensive = model.feature_log_prob_[1]

    max_word_toxicity = 0.0

    for word in words:
        if word in vocab:
            idx = vocab[word]
            p_w_off = np.exp(log_prob_offensive[idx])
            p_w_non_off = np.exp(log_prob_non_offensive[idx])

            p_word_total = (p_w_off * p_off_prior) + (p_w_non_off * p_non_off_prior)

            if p_word_total > 0:
                p_word_given_offensive = (p_w_off * p_off_prior) / p_word_total
                if p_word_given_offensive > max_word_toxicity:
                    max_word_toxicity = p_word_given_offensive

    return float(max_word_toxicity)

@app.post("/predict")
def predict_comment(data: CommentInput):
    text_raw = data.text or data.content

    if not text_raw or not text_raw.strip():
        raise HTTPException(status_code=400, detail="El texto no puede estar vacío.")

    if model is None or vectorizer is None:
        raise HTTPException(status_code=500, detail="Los modelos no están cargados.")

    cleaned_text = clean_text_stem(text_raw)
    text_vectorized = vectorizer.transform([cleaned_text])

    if text_vectorized.nnz == 0:
        return {
            "sentiment_score": 1.0,
            "is_offensive": False,
            "confidence": 1.0
        }

    probabilities = model.predict_proba(text_vectorized)[0]
    global_offensive_prob = float(probabilities[1])

    max_word_prob = get_max_word_toxicity(cleaned_text)

    # Si hay una palabra individual altamente tóxica (>= 85%), prevalece sobre el promedio de la frase
    if max_word_prob >= 0.85:
        final_offensive_prob = max(global_offensive_prob, max_word_prob)
    else:
        final_offensive_prob = global_offensive_prob

    is_offensive = bool(final_offensive_prob >= 0.5)
    sentiment_score = round(1.0 - final_offensive_prob, 2)
    confidence = round(float(max(1.0 - final_offensive_prob, final_offensive_prob)), 2)

    return {
        "sentiment_score": sentiment_score,
        "is_offensive": is_offensive,
        "confidence": confidence
    }