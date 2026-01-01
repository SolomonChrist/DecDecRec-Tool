
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Library, 
  Monitor, 
  Download, 
  Trash2,
  Play,
  Pause,
  StopCircle,
  X,
  FileArchive,
  Info,
  ChevronRight,
  Video
} from 'lucide-react';
import { RecordingSession, LayoutStyle, QualityConfig } from './types';
import { VideoRecorder } from './services/recorder';
import { getAllSessions, saveSession, deleteSession, clearAllSessions } from './services/db';

declare var JSZip: any;

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatTimestamp = () => {
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${now.getDate().toString().padStart(2, '0')}-${months[now.getMonth()]}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
};

const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const InstructionsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-4 backdrop-blur-xl">
    <div className="max-w-xl w-full bg-[#0a0a0a] border border-white/10 rounded-[2rem] p-8 space-y-6 shadow-2xl relative">
      <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors">
        <X className="w-5 h-5 text-white/40" />
      </button>
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">Getting Started</h2>
        <p className="text-base text-white/40">Professional recording, distilled.</p>
      </div>
      <div className="grid gap-4">
        {[
          { step: "01", title: "Select Layout", desc: "Overlay for floating webcam or Shorts for social." },
          { step: "02", title: "Sources", desc: "Select your camera and microphone." },
          { step: "03", title: "Capture", desc: "Local processing, zero cloud latency." },
          { step: "04", title: "Export", desc: "WebM or production ZIP bundles." }
        ].map((item) => (
          <div key={item.step} className="flex gap-4 items-start">
            <span className="text-xs font-black text-red-500 pt-1">{item.step}</span>
            <div className="space-y-1">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="text-sm text-white/40">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="w-full py-4 bg-white text-black font-extrabold text-sm uppercase tracking-widest rounded-xl hover:bg-white/90 transition-all">
        Continue
      </button>
    </div>
  </div>
);

const Footer = () => (
  <footer className="border-t border-white/10 py-6 bg-black shrink-0">
    <div className="max-w-7xl mx-auto px-6 flex justify-between items-center gap-6">
      <div className="flex items-center gap-8">
        <p className="text-xs text-white font-bold uppercase tracking-widest">Created by Solomon Christ</p>
      </div>
      <div className="flex gap-8">
        <a href="https://www.solomonchrist.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">
          Website <ChevronRight className="w-3.5 h-3.5" />
        </a>
        <a href="https://solomonchristai.substack.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">
          Join Newsletter <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="text-xs text-white font-bold uppercase tracking-widest">
        &copy; {new Date().getFullYear()}
      </div>
    </div>
  </footer>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  
  const [layout, setLayout] = useState<LayoutStyle>('CIRCLE');
  const [useWebcam, setUseWebcam] = useState(true);
  const [quality, setQuality] = useState<QualityConfig>({ resolution: '1080p', fps: 30 });
  const [webcamId, setWebcamId] = useState('');
  const [micId, setMicId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const recorderRef = useRef<VideoRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    loadSessions();
    loadDevices();
  }, []);

  useEffect(() => {
    if (isRecording && recorderRef.current && canvasContainerRef.current) {
      const canvas = recorderRef.current.getCanvas();
      canvas.className = "w-full h-full object-contain cursor-grab active:cursor-grabbing";
      canvasContainerRef.current.innerHTML = '';
      canvasContainerRef.current.appendChild(canvas);
    }
  }, [isRecording, layout]);

  const loadSessions = async () => {
    const s = await getAllSessions();
    setSessions(s);
  };

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const devs = await navigator.mediaDevices.enumerateDevices();
      setDevices(devs);
      const cam = devs.find(d => d.kind === 'videoinput');
      const mic = devs.find(d => d.kind === 'audioinput');
      if (cam && !webcamId) setWebcamId(cam.deviceId);
      if (mic && !micId) setMicId(mic.deviceId);
    } catch (e) {}
  };

  const startRecording = async () => {
    try {
      if (!recorderRef.current) recorderRef.current = new VideoRecorder();
      await recorderRef.current.start(layout, quality, useWebcam, webcamId, micId, true);
      setIsRecording(true);
      setIsPaused(false);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    const blob = await recorderRef.current.stop();
    if (blob) {
      const id = formatTimestamp();
      await saveSession({
        id, createdAtISO: new Date().toISOString(), durationSeconds: elapsed,
        layoutStyle: layout, quality, videoBlob: blob, videoType: 'webm',
        metadata: { webcamPos: { ...recorderRef.current.webcamPos } }
      });
      loadSessions();
    }
  };

  const togglePause = () => {
    if (!recorderRef.current) return;
    if (isPaused) {
      recorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
    } else {
      recorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleZipDownload = async (session: RecordingSession) => {
    const zip = new JSZip();
    zip.file(`${session.id}.webm`, session.videoBlob);
    zip.file("metadata.json", JSON.stringify({
      id: session.id,
      date: session.createdAtISO,
      duration: session.durationSeconds,
      layout: session.layoutStyle,
      quality: session.quality
    }, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    triggerDownload(URL.createObjectURL(content), `${session.id}_bundle.zip`);
  };

  const handleCanvasInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isRecording || layout !== 'CIRCLE' || !recorderRef.current) return;
    
    const canvas = recorderRef.current.getCanvas();
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    if (e.type === 'mousedown' || e.type === 'touchstart') {
      isDraggingRef.current = true;
      recorderRef.current.updateWebcamPos(x, y);
    } else if ((e.type === 'mousemove' || e.type === 'touchmove') && isDraggingRef.current) {
      recorderRef.current.updateWebcamPos(x, y);
    } else if (e.type === 'mouseup' || e.type === 'touchend' || e.type === 'mouseleave') {
      isDraggingRef.current = false;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <header className="border-b border-white/10 px-6 py-4 shrink-0 bg-black/80 backdrop-blur-xl z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-600 rounded-lg"></div>
            <h1 className="text-lg font-black tracking-tighter uppercase">DecDecRec.</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex bg-white/5 p-1 rounded-xl border border-white/5">
              <button onClick={() => setActiveTab('record')} className={`px-6 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'record' ? 'bg-red-600 text-white' : 'text-white/40 hover:text-white'}`}>Record</button>
              <button onClick={() => setActiveTab('library')} className={`px-6 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'library' ? 'bg-red-600 text-white' : 'text-white/40 hover:text-white'}`}>Library</button>
            </nav>
            <button onClick={() => setShowInstructions(true)} className="p-2 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
              <Info className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto px-6 py-4 scroll-smooth">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {activeTab === 'record' && (
            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-8 h-full">
              <div className="lg:col-span-4 space-y-4 flex flex-col">
                <div className="space-y-1 mb-2">
                  <h2 className="text-3xl lg:text-4xl font-black tracking-tighter leading-tight">
                    Record. Download. <span className="text-red-600">Done.</span>
                  </h2>
                  <p className="text-xs text-white/40 font-medium">Fast, high-quality capture.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 shrink-0">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`py-3 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${layout === 'CIRCLE' ? 'bg-white text-black border-white' : 'border-white/5 hover:bg-white/5 text-white/40'}`}>Overlay</button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`py-3 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${layout === 'SHORTS' ? 'bg-white text-black border-white' : 'border-white/5 hover:bg-white/5 text-white/40'}`}>Shorts</button>
                </div>

                <div className="space-y-4 bg-[#0a0a0a] border border-white/10 p-4 rounded-xl shrink-0">
                  <div className="grid gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/40 font-black uppercase tracking-widest ml-1">Video Source</label>
                      <select value={webcamId} onChange={(e) => setWebcamId(e.target.value)} disabled={isRecording} className="w-full bg-black border border-white/10 p-2.5 text-xs font-bold rounded-lg outline-none appearance-none">
                        {devices.filter(d => d.kind === 'videoinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
                        <option value="">Camera Off</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-white/40 font-black uppercase tracking-widest ml-1">Audio Source</label>
                      <select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={isRecording} className="w-full bg-black border border-white/10 p-2.5 text-xs font-bold rounded-lg outline-none appearance-none">
                        {devices.filter(d => d.kind === 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-2 shrink-0">
                  {!isRecording ? (
                    <button onClick={startRecording} className="group w-full py-5 bg-red-600 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-red-500 transition-all rounded-xl shadow-lg flex items-center justify-center gap-3">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> START CAPTURE
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button onClick={togglePause} className="flex-1 py-3 border border-white/10 bg-white/5 rounded-lg font-black text-[9px] uppercase tracking-widest">
                          {isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button onClick={stopRecording} className="flex-1 py-3 bg-white text-black rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2">
                          <StopCircle className="w-3.5 h-3.5" /> Stop
                        </button>
                      </div>
                      <div className="text-center py-3 bg-[#0a0a0a] rounded-lg border border-white/10 font-mono text-3xl tabular-nums tracking-tighter text-white">
                        {formatDuration(elapsed)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 h-full flex items-center">
                <div 
                  className={`bg-[#050505] rounded-[1.5rem] overflow-hidden border border-white/10 shadow-2xl relative flex items-center justify-center w-full transition-all duration-500 touch-none ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[calc(100vh-180px)]' : 'aspect-video max-h-[calc(100vh-180px)]'}`}
                  onMouseDown={handleCanvasInteraction}
                  onMouseMove={handleCanvasInteraction}
                  onMouseUp={handleCanvasInteraction}
                  onMouseLeave={handleCanvasInteraction}
                  onTouchStart={handleCanvasInteraction}
                  onTouchMove={handleCanvasInteraction}
                  onTouchEnd={handleCanvasInteraction}
                >
                  <div ref={canvasContainerRef} className="w-full h-full pointer-events-none"></div>
                  {!isRecording && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 pointer-events-none">
                      <Monitor className="w-10 h-10 mb-3" />
                      <span className="text-[9px] font-black uppercase tracking-[0.4em]">Ready</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="space-y-6 h-full flex flex-col">
              <div className="flex justify-between items-end border-b border-white/10 pb-4 shrink-0">
                <div className="space-y-0.5">
                  <h2 className="text-2xl font-black tracking-tighter uppercase">Library</h2>
                  <p className="text-[10px] text-white/40 font-medium uppercase tracking-widest">Local-only storage</p>
                </div>
                {sessions.length > 0 && (
                  <button onClick={async () => { if(confirm("Clear library?")) { await clearAllSessions(); loadSessions(); } }} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-all">
                    Wipe Storage
                  </button>
                )}
              </div>
              
              <div className="flex-grow overflow-y-auto pr-2">
                {sessions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-10">
                    <Library className="w-12 h-12" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Empty</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-6">
                    {sessions.map(s => (
                      <LibraryCard 
                        key={s.id} 
                        session={s} 
                        onDelete={async (id) => { await deleteSession(id); loadSessions(); }} 
                        onPreview={setPreviewingSession} 
                        onZip={handleZipDownload}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {previewingSession && (
        <div className="fixed inset-0 z-[100] bg-black/98 flex items-center justify-center p-6 backdrop-blur-2xl">
          <div className="max-w-4xl w-full bg-[#0a0a0a] border border-white/10 rounded-[1.5rem] overflow-hidden shadow-2xl relative">
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{previewingSession.id}</span>
              <button onClick={() => setPreviewingSession(null)} className="p-2 hover:bg-white/10 rounded-full text-white/60 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="bg-black flex items-center justify-center p-2">
              <video src={URL.createObjectURL(previewingSession.videoBlob)} controls autoPlay className="max-w-full max-h-[55vh] rounded-lg" />
            </div>
            <div className="p-5 border-t border-white/10 flex justify-between items-center">
               <div className="flex gap-3">
                  <button onClick={() => triggerDownload(URL.createObjectURL(previewingSession.videoBlob), `${previewingSession.id}.webm`)} className="px-5 py-2.5 bg-white/5 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-white/10 transition-all flex items-center gap-2">
                    <Download className="w-3.5 h-3.5" /> WebM
                  </button>
                  <button onClick={() => handleZipDownload(previewingSession)} className="px-5 py-2.5 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-white/90 transition-all flex items-center gap-2">
                    <FileArchive className="w-3.5 h-3.5" /> Bundle Zip
                  </button>
               </div>
               <button onClick={() => { if(confirm("Delete?")) { deleteSession(previewingSession.id).then(() => { setPreviewingSession(null); loadSessions(); }); } }} className="text-[9px] font-black text-red-500 uppercase">Delete</button>
            </div>
          </div>
        </div>
      )}

      {showInstructions && <InstructionsModal onClose={() => setShowInstructions(false)} />}
    </div>
  );
};

const LibraryCard: React.FC<{ 
  session: RecordingSession; 
  onDelete: (id: string) => void; 
  onPreview: (s: any) => void; 
  onZip: (s: any) => void;
}> = ({ session, onDelete, onPreview, onZip }) => {
  const url = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);
  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-3 space-y-3 hover:border-red-600/30 transition-all group">
      <div className={`bg-black rounded-lg overflow-hidden border border-white/5 cursor-pointer relative ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`} onClick={() => onPreview(session)}>
        <video src={url} muted className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-all duration-500" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/60">
           <Play className="fill-white w-5 h-5" />
        </div>
        <div className="absolute top-1.5 right-1.5">
          <span className="bg-black/80 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border border-white/10">{session.layoutStyle}</span>
        </div>
      </div>
      <div className="space-y-0.5">
        <h3 className="font-bold text-[9px] truncate text-white/80 uppercase tracking-tighter">{session.id}</h3>
        <p className="text-[8px] text-white/30 font-bold uppercase">{formatDuration(session.durationSeconds)} duration</p>
      </div>
      <div className="flex gap-1.5">
        <button 
          onClick={(e) => { e.stopPropagation(); triggerDownload(url, `${session.id}.webm`); }} 
          className="p-2.5 bg-white/5 text-white/40 hover:text-white rounded-lg transition-all border border-white/5 flex items-center justify-center" 
          title="Download WebM"
        >
          <Video className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onZip(session)} className="flex-grow py-2.5 bg-white text-black text-[8px] font-black uppercase rounded-lg hover:bg-white/90 transition-all">Zip Export</button>
        <button onClick={() => { if(confirm("Delete?")) onDelete(session.id); }} className="p-2.5 border border-white/5 text-white/20 hover:text-red-500 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
};

export default App;
