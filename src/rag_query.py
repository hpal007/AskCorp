from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from langchain_ollama import OllamaEmbeddings, OllamaLLM
from langchain_chroma import Chroma 


# embeddings
embeddings = OllamaEmbeddings(model="granite-embedding")


# load vector DB
vector_db = Chroma(
    persist_directory="./vector_db_model_law", embedding_function=embeddings
)


retriever = vector_db.as_retriever(
    search_type="mmr", search_kwargs={"k": 4, "fetch_k": 20}
)

prompt = ChatPromptTemplate.from_template("""
You are a legal assistant helping analyze a Model Law.

Answer the question using ONLY the provided context.

Context:
{context}

Question:
{question}

Answer clearly and cite sections if possible.
""")

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


llm = OllamaLLM(
    model="deepseek-r1:8b"
)

rag_chain = (
    {
        "context": retriever | format_docs,
        "question": RunnablePassthrough()
    }
    | prompt
    | llm
    | StrOutputParser()
)

question = "Give me list of Table of Contents in the model law 565?"

response = rag_chain.invoke(question)

print(response)