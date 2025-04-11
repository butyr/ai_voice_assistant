from langchain.callbacks.base import BaseCallbackHandler
from langchain.chat_models import ChatOllama
from langchain.schema import HumanMessage
from typing import Any, Dict, List

class StreamingHandler(BaseCallbackHandler):
    def __init__(self):
        self.tokens = []
        
    def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        self.tokens.append(token)
    
    def on_llm_end(self, *args, **kwargs):
        return ''.join(self.tokens).strip()

def get_response(input_text: str, model: str = "phi4:latest"):
    handler = StreamingHandler()
    chat_model = ChatOllama(
        model=model,
        callbacks=[handler],
        streaming=True
    )
    message = HumanMessage(content=input_text)
    response = chat_model([message])
    yield handler.on_llm_end()