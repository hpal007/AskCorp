import json
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma

# Load chunks
with open("../docs/model_law/model-law-565_chunks.json") as f:
    chunks = json.load(f)

documents = []

for c in chunks:
    documents.append(Document(page_content=c["text"], metadata=c["metadata"]))

print("Loaded chunks:", len(documents))


# Use YOUR embedding model
embeddings = OllamaEmbeddings(model="granite-embedding")
# Create vector DB
db = Chroma.from_documents(
    documents, embedding=embeddings, persist_directory="../model_vector_db_v1"
)

db.persist()

print("Vector DB created successfully")
