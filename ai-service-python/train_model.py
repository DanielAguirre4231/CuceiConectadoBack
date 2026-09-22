import pandas as pd
import joblib
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB

df = pd.read_excel("dataset.xlsx")

df = df.dropna(subset=['text', 'label'])

corpus = df['text'].astype(str).tolist()
labels = df['label'].astype(int).tolist()

vectorizer = CountVectorizer()
X_train = vectorizer.fit_transform(corpus)

model = MultinomialNB()
model.fit(X_train, labels)

joblib.dump(model, "naive_bayes_model.pkl")
joblib.dump(vectorizer, "vectorizer.pkl")