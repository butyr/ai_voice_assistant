from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from gtts import gTTS
import whisper
import tempfile
import os
import base64
from rich.logging import RichHandler
import logging
import time
from assistant import get_response
from openai import OpenAI
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
from typing import AsyncGenerator
import json

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(rich_tracebacks=True)]
)

log = logging.getLogger("rich")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    message: str
    voice: str = "af_nicole+af_bella"
    model: str = "phi4:latest"

voice_map = {
    'en-US-Standard-A': "af_bella",
    'en-US-Standard-B': "am_michael",
    'en-GB-Standard-A': "bf_isabella",
    'en-GB-Standard-B': "bm_george",
}

def text_to_speech(text: str, voice: str) -> str:
    start_time = time.time()
    log.info("Starting text-to-speech conversion with voice: %s", voice)
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_audio:
            client = OpenAI(
                base_url="http://localhost:8880/v1",
                api_key="not-needed"
            )

            response = client.audio.speech.create(
                model="kokoro", 
                voice=voice_map[voice],
                input=text,
                response_format="mp3"
            )
            
            response.stream_to_file(temp_audio.name)
            
            with open(temp_audio.name, "rb") as audio_file:
                audio_base64 = base64.b64encode(audio_file.read()).decode()
                
        os.unlink(temp_audio.name)
        log.info("Text-to-speech completed in %.2f seconds", time.time() - start_time)
        
        return f"data:audio/mp3;base64,{audio_base64}"
        
    except Exception as e:
        log.error("Error in text-to-speech conversion: %s", str(e), exc_info=True)
        raise

def speech_to_text(audio_file: UploadFile) -> str:
    start_time = time.time()
    log.info("Starting speech-to-text conversion")
    
    try:
        model = whisper.load_model("large-v3-turbo")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            temp_audio.write(audio_file.file.read())
            output_path = temp_audio.name + "_converted.wav"
            os.system(f'ffmpeg -i {temp_audio.name} -acodec pcm_s16le -ar 16000 -ac 1 {output_path} -y')
            
            result = model.transcribe(output_path)
            text = result["text"]
            
            os.unlink(temp_audio.name)
            os.unlink(output_path)
            
            return text
            
    except Exception as e:
        log.error("Error in speech-to-text conversion: %s", str(e), exc_info=True)
        raise

@app.post("/api/chat")
async def chat(message: Message):
    log.info("Received chat message: %s", message.message)
    
    async def generate_responses() -> AsyncGenerator[str, None]:
        try:
            for sentence in get_response(message.message, message.model):
                audio_url = text_to_speech(sentence, message.voice)
                yield json.dumps({
                    "sentence": sentence,
                    "audioUrl": audio_url
                }) + "\n"
        except Exception as e:
            log.error("Error in stream: %s", str(e))
            raise

    return StreamingResponse(
        generate_responses(),
        media_type="text/event-stream"
    )

@app.post("/api/speech-to-text")
async def convert_speech(audio: UploadFile = File(...)):
    log.info("Received audio file: %s", audio.filename)
    
    try:
        text = speech_to_text(audio)
        log.info("Speech-to-text conversion successful")
        return {"text": text}
        
    except Exception as e:
        log.error("Error processing speech-to-text request: %s", str(e), exc_info=True)
        raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)