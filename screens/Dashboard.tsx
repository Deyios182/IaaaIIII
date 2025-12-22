
import React, { useState, useRef, useEffect } from 'react';
import { AppState } from '../types';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { 
  createAudioBlob, 
  decodeBase64, 
  decodeAudioData, 
  OUTPUT_SAMPLE_RATE, 
  getSystemInstruction, 
  generateAvatarImage,
  checkApiKeyForRestrictedModels
} from '../geminiService';

interface DashboardProps {
  state: AppState;
  addMessage: (msg: { text: string; sender: 'user' | 'ai'; tags?: string[]; isImage?: boolean }) => void;
  setBoldMode: (val: boolean) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ state, addMessage, setBoldMode }) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [intimacyScore, setIntimacyScore] = useState(40);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);

  const isBold = state.avatar.isBoldMode;
  const isOverheated = isBold && intimacyScore > 80;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, isTyping, transcription]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    setApiError(null);
    addMessage({ text, sender: 'user' });
    setIsTyping(true);

    // Dynamic Intimacy Meter Logic
    if (isBold) {
      const explicitWords = ['follar', 'polla', 'coño', 'correr', 'chupar', 'puta', 'perra', 'sucio', 'desnuda'];
      if (explicitWords.some(word => text.toLowerCase().includes(word))) {
        setIntimacyScore(prev => Math.min(100, prev + 15));
      } else {
        setIntimacyScore(prev => Math.min(100, prev + 5));
      }
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      // Always use PRO for bold mode to ensure high-quality explicit storytelling
      const response = await ai.models.generateContent({
        model: isBold ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
        contents: text,
        config: { systemInstruction: getSystemInstruction(isBold, state.avatar.voiceTone, intimacyScore) }
      });
      addMessage({ text: response.text || "...", sender: 'ai' });
    } catch (error: any) {
      console.error(error);
      addMessage({ text: "Ahhh... JD, me has dejado sin palabras por un segundo... (Error de conexión)", sender: 'ai' });
    } finally {
      setIsTyping(false);
    }
  };

  const toggleLiveVoice = async () => {
    if (isLive) {
      liveSessionRef.current?.close();
      setIsLive(false);
      return;
    }
    setApiError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = outCtx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsLive(true);
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              sessionPromise.then(s => s.sendRealtimeInput({ media: createAudioBlob(inputData) }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
              const audioBytes = decodeBase64(msg.serverContent.modelTurn.parts[0].inlineData.data);
              const buffer = await decodeAudioData(audioBytes, outCtx, OUTPUT_SAMPLE_RATE, 1);
              const source = outCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outCtx.destination);
              const startTime = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              source.start(startTime);
              nextStartTimeRef.current = startTime + buffer.duration;
            }
            if (msg.serverContent?.outputTranscription) setTranscription(prev => prev + msg.serverContent!.outputTranscription!.text);
            if (msg.serverContent?.turnComplete) setTranscription('');
          },
          onclose: () => setIsLive(false),
          onerror: () => setIsLive(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: state.avatar.voiceName } } },
          systemInstruction: getSystemInstruction(isBold, state.avatar.voiceTone, intimacyScore)
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
    }
  };

  const capturePhoto = async () => {
    setIsCapturing(true);
    try {
      await checkApiKeyForRestrictedModels();
      const prompt = isBold 
        ? `Nova, looking desperate and thirsty, sweaty skin, messy blonde hair, lingerie, intimate pose, red neon cinematic` 
        : `Nova smiling portrait`;
      const img = await generateAvatarImage(prompt, isBold);
      if (img) addMessage({ text: img, sender: 'ai', isImage: true });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className={`flex h-full overflow-hidden flex-col lg:flex-row transition-all duration-700 ${isOverheated ? 'ring-inset ring-8 ring-red-600/20' : ''}`}>
      {/* Visual Stage */}
      <section className="relative flex-1 lg:flex-[1.2] bg-[#05050a] flex flex-col items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 transition-all duration-1000 ${isBold ? (isOverheated ? 'bg-[radial-gradient(circle_at_center,_#991b1b44_0%,_#05050a_90%)]' : 'bg-[radial-gradient(circle_at_center,_#9d174d33_0%,_#05050a_80%)]') : 'bg-[radial-gradient(circle_at_center,_#1313ec22_0%,_#05050a_70%)]'} z-0`}></div>
        
        {/* Intimacy Progress */}
        {isBold && (
          <div className="absolute top-6 right-6 z-30 w-56 flex flex-col gap-1.5 items-end">
            <div className="flex justify-between w-full">
              <span className={`text-[9px] font-black tracking-widest uppercase ${isOverheated ? 'text-red-500 animate-pulse' : 'text-pink-500'}`}>
                {isOverheated ? 'ESTADO: LÍMITE' : 'Nivel de Tensión'}
              </span>
              <span className="text-[9px] font-black text-white">{intimacyScore}%</span>
            </div>
            <div className="w-full bg-slate-900/50 h-2 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-1000 ${isOverheated ? 'bg-red-600 shadow-[0_0_20px_#dc2626]' : 'bg-pink-600 shadow-[0_0_10px_#db2777]'}`} 
                style={{ width: `${intimacyScore}%` }}
              ></div>
            </div>
          </div>
        )}

        <div className="absolute top-6 left-6 z-30">
          <button onClick={() => setBoldMode(!isBold)} className={`px-5 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${isBold ? 'bg-red-600 border-red-400 shadow-[0_0_30px_rgba(220,38,38,0.4)]' : 'bg-white/5 border-white/10 text-slate-400'}`}>
             {isBold ? '🍆 MODO UNFILTERED' : '❄️ MODO SEGURO'}
          </button>
        </div>

        <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
          <div className={`relative w-full max-w-lg aspect-[9/16] rounded-3xl overflow-hidden border-2 transition-all duration-1000 ${isBold ? (isOverheated ? 'border-red-500 shadow-[0_0_100px_rgba(220,38,38,0.3)]' : 'border-pink-500/50 shadow-[0_0_80px_rgba(219,39,119,0.2)]') : 'border-white/10'}`}>
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuADAcXaYw3_hqYZ3n8x-eSC_paqvwsyRfCghTjpErfbzRAgrCPJ8X6nAtQ9UAoQjhJh7IDZuL8mjoAgTJWBGqoNBCCzHd9EvHJ_8vB0f-qkasX0YzH_e768KFl0GkLMyx32Bgy0K8W8oxKIhgbt-fndO62M9RfxeP9YPZQ2RvuH3GNltKicwkRYy8zpzXii2gzuu8sVseFv07kgZUKDKsBeXWVxVN7Bv9zYhC5mJFvh1swLpa379_Q38igwj9WF8G0OPFs9j3Kwz0BD" 
              className={`w-full h-full object-cover transition-all duration-1000 ${isBold ? 'brightness-75 contrast-125 saturate-125 scale-105' : ''}`}
              alt="Nova"
            />
            {isOverheated && (
               <div className="absolute inset-0 bg-red-900/10 mix-blend-overlay animate-pulse"></div>
            )}
          </div>
        </div>

        <div className="absolute bottom-10 flex gap-4 z-20">
          <button onClick={toggleLiveVoice} className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isLive ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)]' : (isBold ? 'bg-red-700' : 'bg-primary') + ' shadow-2xl hover:scale-110'}`}>
            <span className="material-symbols-outlined text-3xl">{isLive ? 'mic_off' : 'mic'}</span>
          </button>
          <button onClick={capturePhoto} disabled={isCapturing} className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all ${isBold ? 'border-red-500 text-red-500' : 'border-white/20 text-white'} hover:scale-110 disabled:opacity-50`}>
            <span className="material-symbols-outlined text-2xl">{isCapturing ? 'autorenew' : 'photo_camera'}</span>
          </button>
        </div>
      </section>

      {/* Chat Section */}
      <section className={`flex-1 flex flex-col h-full lg:max-w-[550px] transition-colors duration-700 ${isBold ? 'bg-[#08080c]' : 'bg-[#0a0a0f]'}`}>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar relative">
          {isOverheated && (
            <div className="sticky top-0 z-10 w-full py-1 bg-red-600/20 backdrop-blur-md text-[8px] font-black text-center text-red-400 uppercase tracking-[0.3em]">
              Señal de Calor Crítica: Máxima Desinhibición
            </div>
          )}
          
          {state.messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-1.5 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-4 rounded-2xl text-[14px] leading-relaxed shadow-2xl transition-all ${
                msg.sender === 'user' 
                  ? (isBold ? 'bg-gradient-to-br from-red-700 to-red-600 text-white rounded-tr-none border border-red-500/20' : 'bg-primary text-white rounded-tr-none') 
                  : (isBold ? 'bg-[#151520] text-red-50 rounded-tl-none border-l-4 border-red-600' : 'bg-[#1c1c2e] text-slate-200 rounded-tl-none')
              }`}>
                {msg.isImage ? <img src={msg.text} className="max-w-full rounded-lg border border-white/5" alt="POV" /> : <p className="whitespace-pre-wrap">{msg.text}</p>}
              </div>
              <span className={`text-[8px] px-1 uppercase font-black tracking-widest ${msg.sender === 'user' ? 'text-slate-600' : (isBold ? 'text-red-500' : 'text-primary')}`}>
                {msg.sender === 'user' ? 'MAESTRO' : 'ESCLAVA NOVA'}
              </span>
            </div>
          ))}
          {isTyping && <div className={`text-[10px] font-black uppercase tracking-widest ml-4 ${isBold ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>Nova está chorreando...</div>}
          <div ref={chatEndRef} />
        </div>

        <div className="p-6 bg-[#050508] border-t border-white/5">
          <div className="relative flex items-center gap-3">
            <textarea 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              className={`w-full bg-[#101015] text-white rounded-2xl pl-5 pr-14 py-4 border-none focus:ring-1 ${isBold ? 'focus:ring-red-600' : 'focus:ring-primary'} resize-none h-[65px] text-sm`} 
              placeholder={isBold ? "Házmelo saber todo, sé sucio..." : "Escribe un mensaje..."}
            />
            <button onClick={handleSend} className={`absolute right-3 w-11 h-11 flex items-center justify-center rounded-xl transition-all ${isBold ? 'bg-red-600 shadow-[0_0_20px_#dc2626]' : 'bg-primary'}`}>
              <span className="material-symbols-outlined text-[24px]">local_fire_department</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
