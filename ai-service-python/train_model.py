import re
import unicodedata
import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, ConfusionMatrixDisplay

# Stopwords en español EXCLUYENDO negaciones ('no', 'ni', 'sin') para preservar el contexto de negación
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

def clean_text_stem(text: str) -> str:
    """Normalización de texto: minúsculas, sin acentos, stem ligero sin eliminar negaciones."""
    text = str(text).lower()
    text = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('utf-8')
    words = re.findall(r'\b\w+\b', text)
    cleaned = []
    for w in words:
        if w in SPANISH_STOPWORDS:
            continue
        # Stemming ligero para variaciones de género y plural
        if len(w) > 4 and w.endswith(('a', 'o', 'as', 'os')):
            w = re.sub(r'(a|o|as|os)$', '', w)
        cleaned.append(w)
    return " ".join(cleaned)

def train_and_evaluate():
    # 1. Cargar conjunto de datos
    df = pd.read_excel('dataset.xlsx')
    df = df.dropna(subset=['text', 'label'])
    
    # 2. Eliminar duplicados para evitar Data Leakage entre Train y Test
    df = df.drop_duplicates(subset=['text']).reset_index(drop=True)
    
    # 3. Preprocesamiento uniforme
    df['clean_text'] = df['text'].apply(clean_text_stem)
    
    X = df['clean_text']
    y = df['label'].astype(int)

    # 4. División 80/20 Estratificada
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    # 5. Vectorización con Unigramas + Bigramas (ngram_range=(1,2))
    vectorizer = CountVectorizer(ngram_range=(1, 2))
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    # 6. Modelo Naive Bayes Multinomial
    model = MultinomialNB(alpha=0.1)
    model.fit(X_train_vec, y_train)

    # 7. Evaluación Cuantitativa
    y_pred = model.predict(X_test_vec)
    
    print("\n" + "="*55)
    print("=== MÉTRICAS DE EVALUACIÓN (80% Train / 20% Test sin duplicados) ===")
    print("="*55)
    print(f"Exactitud (Accuracy): {accuracy_score(y_test, y_pred):.4f}\n")
    print(classification_report(y_test, y_pred, target_names=['No Ofensivo (0)', 'Ofensivo (1)']))

    # --- MATRIZ DE CONFUSIÓN ---
    cm = confusion_matrix(y_test, y_pred)
    print("=== MATRIZ DE CONFUSIÓN ===")
    print(f"Verdaderos Negativos (No Ofensivos correctos): {cm[0][0]}")
    print(f"Falsos Positivos (Bloqueos erróneos): {cm[0][1]}")
    print(f"Falsos Negativos (Insultos no detectados): {cm[1][0]}")
    print(f"Verdaderos Positivos (Ofensivos detectados): {cm[1][1]}")

    labels_display = ['No Ofensivo', 'Ofensivo']
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels_display)
    disp.plot(cmap=plt.cm.Blues)
    plt.title('Matriz de Confusión - CUCEI Conectado')
    plt.savefig('confusion_matrix.png', bbox_inches='tight')
    plt.close()
    print("\n[OK] Gráfica 'confusion_matrix.png' generada correctamente.")

    # 8. Guardar Artefactos
    joblib.dump(model, 'naive_bayes_model.pkl')
    joblib.dump(vectorizer, 'vectorizer.pkl')

if __name__ == '__main__':
    train_and_evaluate()