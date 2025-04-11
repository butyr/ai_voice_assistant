"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Send, Volume2, VolumeX } from 'lucide-react';

const LoadingDotsAssistant = () => (
  <div className="flex space-x-1 p-1">
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_0.6s_infinite_0ms]"></div>
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_0.6s_infinite_200ms]"></div>
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_0.6s_infinite_400ms]"></div>
  </div>
);

const LoadingDotsUser = () => (
  <div className="flex space-x-1 p-1">
    <div className="w-2 h-2 bg-gray-100 rounded-full animate-[bounce_0.6s_infinite_0ms]"></div>
    <div className="w-2 h-2 bg-gray-100 rounded-full animate-[bounce_0.6s_infinite_200ms]"></div>
    <div className="w-2 h-2 bg-gray-100 rounded-full animate-[bounce_0.6s_infinite_400ms]"></div>
  </div>
);

const CustomerServiceChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('en-US-Standard-A');
  const [selectedModel, setSelectedModel] = useState('phi4:latest');
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const currentResponse = useRef({ id: null, text: '' });
  const mediaRecorder = useRef(null);
  const messagesEndRef = useRef(null);
  const currentAudio = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);

  const voices = [
    { id: 'en-US-Standard-A', name: 'US English (Female)' },
    { id: 'en-US-Standard-B', name: 'US English (Male)' },
    { id: 'en-GB-Standard-A', name: 'British English (Female)' },
    { id: 'en-GB-Standard-B', name: 'British English (Male)' },
  ];

  const models = [
    { id: 'phi4:latest', name: 'Phi-4' },
    { id: 'deepseek-r1:32b', name: 'DeepSeek R1' },
    { id: 'llama3.2:latest', name: 'LLama3.2' },
    { id: 'nous-hermes2:latest', name: 'Nous-Hermes2' },
  ];

  useEffect(() => {
    const getDevices = async () => {
      const audioDevices = await navigator.mediaDevices.enumerateDevices();
      const microphones = audioDevices.filter(device => device.kind === 'audioinput');
      setDevices(microphones);
      if (microphones.length > 0) {
        setSelectedDevice(microphones[0].deviceId);
      }
    };
    getDevices();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessingSpeech, isBotTyping]);

  const stopCurrentAudio = () => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current.currentTime = 0;
    }
  };

  const playNextInQueue = async () => {
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const audio = new Audio(audioQueue.current[0]);
    currentAudio.current = audio;

    audio.onended = () => {
      audioQueue.current.shift();
      playNextInQueue();
    };

    try {
      await audio.play();
    } catch (error) {
      console.error('Audio playback error:', error);
      audioQueue.current.shift();
      playNextInQueue();
    }
  };

  const handleSend = async ({ customMessage } = {}) => {
    const messageToSend = customMessage || inputText;
    if (!messageToSend.trim()) return;
    
    // Reset all audio state
    stopCurrentAudio();
    audioQueue.current = [];
    isPlaying.current = false;
    currentAudio.current = null;
    
    const messageId = Date.now();
    setMessages(prev => [...prev, { id: messageId, type: 'user', content: messageToSend }]);
    setInputText('');
    setIsBotTyping(true);
    currentResponse.current = { id: null, text: '' };

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ 
          message: messageToSend,
          voice: selectedVoice,
          model: selectedModel
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      let buffer = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || '';

        for (const line of lines) {
          try {
            if (line.trim()) {
              const { sentence, audioUrl } = JSON.parse(line);
              
              setMessages(prev => [...prev, { 
                id: Date.now(),
                type: 'bot', 
                content: sentence.trim()
              }]);
              
              if (audioEnabled) {
                audioQueue.current.push(audioUrl);
                if (!isPlaying.current) {
                  playNextInQueue();
                }
              }
            }
          } catch (e) {
            console.error('Error parsing line:', e);
          }
        }
      }

      setIsBotTyping(false);
      
    } catch (error) {
      console.error('Error:', error);
      setIsBotTyping(false);
    }
  };

  const startRecording = async () => {
    stopCurrentAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined } 
      });
      mediaRecorder.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];

      mediaRecorder.current.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.current.onstop = async () => {
        setIsProcessingSpeech(true);
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob);

        try {
          const response = await fetch('http://localhost:8000/api/speech-to-text', {
            method: 'POST',
            body: formData
          });
          const data = await response.json();
          setIsProcessingSpeech(false);
          handleSend({ customMessage: data.text });
        } catch (error) {
          console.error('Error:', error);
          setIsProcessingSpeech(false);
        }
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col h-96 w-full max-w-2xl mx-auto bg-white rounded-lg shadow-md">
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((message, index) => (
          <div key={message.id || index} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block p-3 rounded-lg ${
              message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}>
              {message.content}
            </div>
          </div>
        ))}
        {isProcessingSpeech && (
          <div className="mb-4 text-right">
            <div className="inline-block p-2 rounded-lg bg-blue-500 text-white">
              <LoadingDotsUser />
            </div>
          </div>
        )}
        {isBotTyping && !messages.find(m => m.id === currentResponse.current?.id) && (
          <div className="mb-4 text-left">
            <div className="inline-block p-2 rounded-lg bg-gray-100">
              <LoadingDotsAssistant />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="border-t p-4">
        <div className="flex items-center gap-2 mb-2">
          <button 
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (audioEnabled) {
                stopCurrentAudio();
                audioQueue.current = [];
              }
            }}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="p-1 border rounded text-sm flex-1"
          >
            {models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>

          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="p-1 border rounded text-sm flex-1"
          >
            {voices.map(voice => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
          
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="p-1 border rounded text-sm flex-1"
          >
            {devices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => isRecording ? stopRecording() : startRecording()}
            className={`p-2 rounded-full hover:bg-gray-100 ${isRecording ? 'bg-red-100 text-red-500' : ''}`}
            disabled={isProcessingSpeech}
          >
            <Mic size={20} />
          </button>
          
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded-lg"
            disabled={isProcessingSpeech || isBotTyping}
          />
          
          <button
            onClick={() => handleSend()}
            className="p-2 rounded-full hover:bg-gray-100"
            disabled={isProcessingSpeech || isBotTyping}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerServiceChat;