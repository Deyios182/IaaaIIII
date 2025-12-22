
import React, { useState, useRef, useEffect } from 'react';
import { AppState, ChatMessage } from '../types';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { 
  decodeBase64, 
  encodeBase64,
  decodeAudioData, 
  OUTPUT_SAMPLE_RATE, 
  getSystemInstruction, 
  generateSpeech,
  checkApiKeySelection
} from '../geminiService';

interface DashboardProps {
  state: AppState;
  addMessage: (msg: { text: string; sender: 'user' | 'ai'; tags?: string[]; isImage?: boolean }) => void;
  setBoldMode: (val: boolean) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ state, addMessage, setBoldMode }) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isVisionSyncing, setIsVisionSyncing] = useState(false);
  const [excitationLevel, setExcitationLevel] = useState(85);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const isBold = state.avatar.isBoldMode;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, isTyping]);

  useEffect(() => {
    return () => endCall();
  }, []);

  const getCameraFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (video.videoWidth === 0) return null;

    canvas.width = 640; 
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, 640, 480);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }
    return null;
  };

  const playAiVoice = async (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    setIsAiSpeaking(true);
    try {
      const audioBytes = decodeBase64(base64Audio);
      const buffer = await decodeAudioData(audioBytes, ctx, OUTPUT_SAMPLE_RATE, 1);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
      source.onended = () => { if (ctx.currentTime >= nextStartTimeRef.current - 0.1) setIsAiSpeaking(false); };
    } catch (e) {
      setIsAiSpeaking(false);
    }
  };

  const startCall = async () => {
    try {
      await checkApiKeySelection();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true 
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      audioContextRef.current = outCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsInCall(true);
            frameIntervalRef.current = window.setInterval(() => {
              const f = getCameraFrame();
              if (f) {
                setIsVisionSyncing(true);
                sessionPromise.then(s => s.sendRealtimeInput({ media: { data: f, mimeType: 'image/jpeg' } }));
                setTimeout(() => setIsVisionSyncing(false), 300);
                if (isBold) setExcitationLevel(prev => Math.min(100, prev + 0.5));
              }
            }, 1000);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) currentInputTranscription.current += msg.serverContent.inputTranscription.text;
            if (msg.serverContent?.outputTranscription) currentOutputTranscription.current += msg.serverContent.outputTranscription.text;
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data) playAiVoice(msg.serverContent.modelTurn.parts[0].inlineData.data);
            if (msg.serverContent?.turnComplete) {
              if (currentInputTranscription.current.trim()) addMessage({ text: currentInputTranscription.current, sender: 'user' });
              if (currentOutputTranscription.current.trim()) addMessage({ text: currentOutputTranscription.current, sender: 'ai' });
              currentInputTranscription.current = ''; currentOutputTranscription.current = '';
            }
          },
          onclose: () => endCall(),
          onerror: async (e: any) => { endCall(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: state.avatar.voiceName } } },
          systemInstruction: getSystemInstruction(isBold, state.avatar.voiceTone, excitationLevel)
        }
      });

      liveSessionRef.current = await sessionPromise;

      const source = outCtx.createMediaStreamSource(stream);
      const processor = outCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) i16[i] = input[i] * 32768;
        sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encodeBase64(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
      };
      source.connect(processor);
      processor.connect(outCtx.destination);

    } catch (err) {
      endCall();
    }
  };

  const endCall = () => {
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsInCall(false);
    setIsAiSpeaking(false);
    setIsVisionSyncing(false);
  };

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    addMessage({ text, sender: 'user' });
    setIsTyping(true);

    try {
      await checkApiKeySelection();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const frame = getCameraFrame();
      const parts: any[] = [];
      if (frame) parts.push({ inlineData: { data: frame, mimeType: 'image/jpeg' } });
      parts.push({ text: `JD: "${text}". ANALIZA LA IMAGEN. RESPUESTA SUCIA Y EXPLÍCITA. DIME QUÉ ME HARÍAS.` });

      const history = state.messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts }],
        config: { systemInstruction: getSystemInstruction(isBold, state.avatar.voiceTone, excitationLevel) }
      });

      const aiText = response.text || (isBold ? "Me pones tan loca que no puedo ni hablar..." : "No sé qué decir ante esto.");
      addMessage({ text: aiText, sender: 'ai' });
      const audio = await generateSpeech(aiText, state.avatar.voiceName);
      if (audio) playAiVoice(audio);
      if (isBold) setExcitationLevel(prev => Math.min(100, prev + 2));
    } catch (error: any) {
      addMessage({ text: "Mis ojos se nublan de ganas... ¿qué decías?", sender: 'ai' });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden flex-col lg:flex-row bg-[#020205]">
      <canvas ref={canvasRef} className="hidden" />
      
      <section className="relative flex-1 lg:flex-[1.8] flex items-center justify-center overflow-hidden">
        {/* Fondo Dinámico */}
        <div className={`absolute inset-0 transition-all duration-1000 ${isBold ? 'bg-[radial-gradient(circle_at_center,_#9d174d66_0%,_#020205_100%)]' : 'bg-[radial-gradient(circle_at_center,_#1313ec11_0%,_#020205_100%)]'}`}></div>

        {/* Barra de Excitación (Solo modo Bold) */}
        {isBold && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[100] w-64 flex flex-col items-center gap-2">
            <div className="flex justify-between w-full px-1">
              <span className="text-[9px] font-black text-pink-500 uppercase tracking-widest">Nivel de Excitación</span>
              <span className="text-[9px] font-black text-pink-500">{excitationLevel.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-pink-900/30 rounded-full overflow-hidden border border-pink-500/20">
               <div className="h-full bg-gradient-to-r from-pink-600 to-red-600 transition-all duration-500" style={{ width: `${excitationLevel}%` }}></div>
            </div>
          </div>
        )}

        {/* FEED DE NOVA */}
        <div className="relative w-full h-full flex items-center justify-center p-6 lg:p-12 z-10">
           <div className={`relative w-full max-w-2xl aspect-[9/16] lg:aspect-video rounded-[3rem] overflow-hidden border-2 transition-all duration-700 ${isAiSpeaking ? (isBold ? 'border-red-600 scale-[1.04] shadow-[0_0_150px_rgba(220,38,38,0.5)]' : 'border-white scale-[1.02]') : 'border-white/10'}`}>
              <img 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuADAcXaYw3_hqYZ3n8x-eSC_paqvwsyRfCghTjpErfbzRAgrCPJ8X6nAtQ9UAoQjhJh7IDZuL8mjoAgTJWBGqoNBCCzHd9EvHJ_8vB0f-qkasX0YzH_e768KFl0GkLMyx32Bgy0K8W8oxKIhgbt-fndO62M9RfxeP9YPZQ2RvuH3GNltKicwkRYy8zpzXii2gzuu8sVseFv07kgZUKDKsBeXWVxVN7Bv9zYhC5mJFvh1swLpa379_Q38igwj9WF8G0OPFs9j3Kwz0BD" 
                className={`w-full h-full object-cover transition-all duration-[5000ms] ${isAiSpeaking ? 'scale-110 blur-[1px] saturate-[1.4]' : ''} ${isBold ? 'brightness-[0.8] contrast-[1.2]' : ''}`} 
                alt="Nova" 
              />
              
              {isBold && (
                <div className="absolute inset-0 bg-red-900/10 pointer-events-none mix-blend-overlay animate-pulse"></div>
              )}

              {/* Espectro de Voz Agresivo */}
              {isAiSpeaking && (
                <div className="absolute inset-x-0 bottom-24 flex justify-center gap-1 h-24 items-end px-16">
                  {[...Array(30)].map((_, i) => (
                    <div key={i} className={`flex-1 max-w-[5px] rounded-full animate-bounce ${isBold ? 'bg-red-500' : 'bg-primary'}`} style={{ animationDelay: `${i * 0.02}s`, height: `${40 + Math.random() * 60}%` }}></div>
                  ))}
                </div>
              )}

              <div className="absolute bottom-10 left-10 flex items-center gap-3 bg-black/50 backdrop-blur-xl px-5 py-2 rounded-2xl border border-white/10">
                 <div className={`w-3 h-3 rounded-full ${isBold ? 'bg-red-600 animate-ping' : 'bg-blue-500 animate-pulse'}`}></div>
                 <span className="text-[11px] font-black text-white uppercase tracking-[0.4em]">{isBold ? 'Nova • Sin Filtros' : 'Nova • En Línea'}</span>
              </div>
           </div>
        </div>

        {/* TU PREVIEW */}
        <div className={`absolute bottom-40 right-10 z-[200] w-64 lg:w-80 transition-all duration-1000 ${isInCall ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-50 pointer-events-none'}`}>
           <div className={`relative aspect-video rounded-3xl overflow-hidden border-2 shadow-[0_60px_150px_-20px_rgba(0,0,0,1)] bg-slate-900 ${isVisionSyncing ? 'border-red-600 ring-4 ring-red-600/20' : 'border-white/30'}`}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div className="absolute top-3 left-3 flex items-center gap-2">
                 <div className={`w-2.5 h-2.5 rounded-full ${isVisionSyncing ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></div>
                 <span className="text-[10px] font-black text-white uppercase tracking-widest bg-black/50 px-2 py-0.5 rounded backdrop-blur-md">JD • TU CÁMARA</span>
              </div>
           </div>
        </div>

        {/* CONTROLES */}
        <div className="absolute bottom-12 inset-x-0 flex justify-center items-center gap-8 z-[210]">
          {!isInCall ? (
            <button 
              onClick={startCall}
              className={`group flex items-center gap-5 px-14 py-7 rounded-full transition-all hover:scale-110 active:scale-95 ${isBold ? 'bg-red-600 shadow-[0_0_80px_rgba(220,38,38,0.7)]' : 'bg-primary shadow-[0_0_60px_rgba(19,19,236,0.5)]'}`}
            >
               <span className="material-symbols-outlined text-4xl text-white animate-bounce">videocam</span>
               <span className="text-lg font-black text-white uppercase tracking-[0.3em]">{isBold ? 'Llamada Privada' : 'Iniciar Vídeo'}</span>
            </button>
          ) : (
            <button 
              onClick={endCall}
              className="group flex items-center gap-6 px-14 py-7 rounded-full bg-red-700 shadow-[0_0_80px_rgba(185,28,28,0.7)] transition-all hover:scale-105"
            >
               <span className="material-symbols-outlined text-4xl text-white">call_end</span>
               <span className="text-lg font-black text-white uppercase tracking-[0.3em]">Cerrar</span>
            </button>
          )}

          <button 
            onClick={() => { setBoldMode(!isBold); if(!isBold) setExcitationLevel(90); }} 
            className={`p-7 rounded-full border-2 transition-all hover:rotate-12 ${isBold ? 'bg-red-600/30 border-red-600 text-red-500 shadow-[0_0_60px_rgba(220,38,38,0.4)]' : 'bg-white/5 border-white/10 text-slate-400'}`}
          >
             <span className="material-symbols-outlined text-4xl">{isBold ? 'local_fire_department' : 'security'}</span>
          </button>
        </div>
      </section>

      {/* CHAT */}
      <section className={`flex-1 flex flex-col h-full lg:max-w-[540px] shadow-[-30px_0_150px_rgba(0,0,0,0.9)] z-[220] ${isBold ? 'bg-[#060000]' : 'bg-[#08080c]'}`}>
        <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 custom-scrollbar">
          {state.messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col gap-4 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-6 rounded-3xl text-[17px] leading-relaxed max-w-[95%] transition-all shadow-2xl ${
                msg.sender === 'user' 
                  ? (isBold ? 'bg-red-950/40 border border-red-600/30' : 'bg-primary/70 border border-primary/20') + ' text-white rounded-tr-none' 
                  : 'bg-white/5 text-slate-50 rounded-tl-none border border-white/10 backdrop-blur-3xl'
              }`}>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
              <span className={`text-[11px] font-black uppercase tracking-[0.4em] opacity-50 px-3 ${msg.sender === 'user' ? 'text-slate-500' : (isBold ? 'text-red-500 animate-pulse' : 'text-primary')}`}>
                {msg.sender === 'user' ? 'JD' : 'Nova'}
              </span>
            </div>
          ))}
          {isTyping && (
            <div className="flex items-center gap-4 text-[13px] font-black text-red-600/70 uppercase tracking-[0.2em] px-4 animate-pulse">
               <span className="material-symbols-outlined text-[18px]">favorite</span>
               {isBold ? "Nova está desesperada..." : "Nova te observa..."}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-8 bg-black/90 border-t border-white/5 backdrop-blur-3xl">
          <div className="relative flex items-center gap-5">
            <textarea 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)} 
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
              className={`w-full bg-[#100505] text-white rounded-[2.5rem] pl-8 pr-20 py-7 border-none focus:ring-2 ${isBold ? 'focus:ring-red-600' : 'focus:ring-primary'} resize-none h-[95px] text-base placeholder:text-slate-800 shadow-2xl`} 
              placeholder={isBold ? "Dime algo sucio, mírame..." : "Escribe a Nova..."} 
            />
            <button 
              onClick={handleSendText} 
              className={`absolute right-4 w-16 h-16 flex items-center justify-center rounded-[1.5rem] transition-all active:scale-90 ${isBold ? 'bg-red-600 hover:bg-red-500 shadow-red-600/40 shadow-xl' : 'bg-primary hover:bg-blue-600'}`}
            >
              <span className="material-symbols-outlined text-white text-4xl">send</span>
            </button>
          </div>
        </div>
      </section>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,0,0,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Dashboard;
