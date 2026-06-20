from src.services.llm_service import LLMService


llm = LLMService()


answer = llm.generate_response(
    question="Who founded SpaceX?",
    vector_context="""
    SpaceX was founded by Elon Musk in 2002.
    """,
    graph_context="""
    Elon Musk - FOUNDED -> SpaceX
    """
)


print("\nAI Answer:")
print(answer)