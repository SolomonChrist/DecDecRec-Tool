
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Video, 
  Library, 
  Settings, 
  Circle, 
  RectangleVertical, 
  Monitor, 
  Camera, 
  Mic, 
  FileText, 
  Download, 
  Trash2,
  Play,
  Pause,
  StopCircle,
  AlertCircle,
  Key,
  Database,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ExternalLink,
  Info,
  Maximize2,
  X,
  Scissors,
  GripHorizontal,
  ChevronRight,
  Save,
  Loader2
} from 'lucide-react';
import { RecordingSession, LayoutStyle, QualityConfig, StorageEstimate, TranscriptionSettings } from './types';
import { VideoRecorder } from './services/recorder';
import { getAllSessions, saveSession, deleteSession, clearAllSessions } from './services/db';

// --- Video Editor Types ---
interface VideoSegment {
  id: string;
  start: number; // seconds within the source video
  end: number;   // seconds within the source video
  duration: number;
}

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatSize = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library' | 'settings'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [editingSession, setEditingSession] = useState<RecordingSession | null>(null);
  
  const [permissions, setPermissions] = useState<{
    camera: PermissionState | 'unknown';
    microphone: PermissionState | 'unknown';
  }>({ camera: 'unknown', microphone: 'unknown' });

  const [layout, setLayout] = useState<LayoutStyle>('CIRCLE');
  const [useWebcam, setUseWebcam] = useState(true);
  const [quality, setQuality] = useState<QualityConfig>({ resolution: '1080p', fps: 30 });
  const [webcamId, setWebcamId] = useState('');
  const [micId, setMicId] = useState('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettings>({
    mode: 'OPENAI',
    openaiModel: 'whisper-1',
    localServerUrl: 'http://localhost:8765'
  });

  const recorderRef = useRef<VideoRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingWebcam = useRef(false);

  const previewUrl = useMemo(() => {
    if (!previewingSession) return null;
    return URL.createObjectURL(previewingSession.videoBlob);
  }, [previewingSession]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  useEffect(() => {
    loadSessions();
    loadDevices();
    updateStorageEstimate();
    checkPermissions();
  }, []);

  useEffect(() => {
    if (isRecording && recorderRef.current && canvasContainerRef.current) {
      const canvas = recorderRef.current.getCanvas();
      canvas.className = "w-full h-full object-contain cursor-move";
      canvasContainerRef.current.innerHTML = '';
      canvasContainerRef.current.appendChild(canvas);
    }
  }, [isRecording, layout]);

  const checkPermissions = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const cam = await navigator.permissions.query({ name: 'camera' as any });
        const mic = await navigator.permissions.query({ name: 'microphone' as any });
        setPermissions({ camera: cam.state, microphone: mic.state });
        cam.onchange = () => setPermissions(prev => ({ ...prev, camera: cam.state }));
        mic.onchange = () => setPermissions(prev => ({ ...prev, microphone: mic.state }));
      }
    } catch (e) {}
  };

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
      setPolicyError(null);
    } catch (err: any) {
      if (err.name === 'SecurityError') setPolicyError("Permissions Policy blocked hardware access.");
    }
  };

  const updateStorageEstimate = async () => {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      setStorage({
        quota: estimate.quota || 0,
        usage: estimate.usage || 0,
        free: (estimate.quota || 0) - (estimate.usage || 0),
        persistent: false
      });
    }
  };

  const startRecording = async () => {
    try {
      if (!recorderRef.current) recorderRef.current = new VideoRecorder();
      await recorderRef.current.start(layout, quality, useWebcam, webcamId, micId, captureSystemAudio);
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
    const blob = recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    if (blob) {
      const now = new Date();
      const id = `REC_${now.getTime()}`;
      await saveSession({
        id, createdAtISO: now.toISOString(), durationSeconds: elapsed,
        layoutStyle: layout, quality, videoBlob: blob, videoType: 'webm',
        metadata: { webcamPos: { ...recorderRef.current.webcamPos } }
      });
      loadSessions();
      updateStorageEstimate();
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

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!isRecording || !recorderRef.current || !isDraggingWebcam.current || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    recorderRef.current.updateWebcamPos(x, y);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-white/20 p-4 sticky top-0 bg-black z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2"><Monitor className="w-6 h-6" /> DecDecRec</h1>
          <nav className="flex gap-4">
            <button onClick={() => setActiveTab('record')} className={`p-2 flex items-center gap-1 text-sm ${activeTab === 'record' ? 'bg-white text-black' : ''}`}><Video className="w-4 h-4" /> Record</button>
            <button onClick={() => setActiveTab('library')} className={`p-2 flex items-center gap-1 text-sm ${activeTab === 'library' ? 'bg-white text-black' : ''}`}><Library className="w-4 h-4" /> Library</button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto w-full p-6">
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold border-b border-white/10 pb-2">Layout</h2>
                <div className="flex gap-4">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`flex-1 p-4 border ${layout === 'CIRCLE' ? 'bg-white text-black' : 'border-white/20'}`}>CIRCLE</button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`flex-1 p-4 border ${layout === 'SHORTS' ? 'bg-white text-black' : 'border-white/20'}`}>9:16 SHORTS</button>
                </div>
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold">Devices</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Webcam</span>
                    <button onClick={() => setUseWebcam(!useWebcam)} className={`px-4 py-1 border ${useWebcam ? 'bg-white text-black' : 'border-white/20'}`}>{useWebcam ? 'ON' : 'OFF'}</button>
                  </div>
                  {useWebcam && (
                    <select value={webcamId} onChange={(e) => setWebcamId(e.target.value)} className="w-full bg-black border border-white/20 p-2 text-sm">
                      {devices.filter(d => d.kind === 'videoinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                    </select>
                  )}
                  <select value={micId} onChange={(e) => setMicId(e.target.value)} className="w-full bg-black border border-white/20 p-2 text-sm">
                    {devices.filter(d => d.kind === 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                  </select>
                </div>
              </section>

              {!isRecording ? (
                <button onClick={startRecording} className="w-full py-6 bg-white text-black font-black text-2xl hover:bg-gray-200">START RECORDING</button>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <button onClick={togglePause} className="flex-1 py-4 border border-white flex items-center justify-center gap-2">{isPaused ? <Play /> : <Pause />} {isPaused ? 'RESUME' : 'PAUSE'}</button>
                    <button onClick={stopRecording} className="flex-1 py-4 bg-red-600 text-white flex items-center justify-center gap-2"><StopCircle /> STOP</button>
                  </div>
                  <div className="text-center p-4 border border-white/10 bg-white/5 font-mono text-4xl">{formatDuration(elapsed)}</div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <section 
                className={`border border-white/20 bg-black relative overflow-hidden ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[600px] mx-auto' : 'aspect-video'}`}
                onMouseDown={() => (isDraggingWebcam.current = true)}
                onMouseUp={() => (isDraggingWebcam.current = false)}
                onMouseLeave={() => (isDraggingWebcam.current = false)}
                onMouseMove={handlePreviewMouseMove}
              >
                <div ref={canvasContainerRef} className="w-full h-full"></div>
                {!isRecording && <div className="absolute inset-0 flex items-center justify-center text-white/20 font-bold uppercase tracking-widest">Live Preview</div>}
              </section>
              {isRecording && <p className="text-[10px] text-white/40 uppercase text-center italic">Tip: Click and drag the webcam in the preview to move it live.</p>}
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
              <h2 className="text-2xl font-bold uppercase tracking-tight">Library</h2>
              {sessions.length > 0 && (
                <button onClick={async () => { if(confirm("Clear all?")) { await clearAllSessions(); loadSessions(); } }} className="text-xs font-bold text-red-500 hover:underline uppercase">Clear Library</button>
              )}
            </div>
            <div className="grid gap-4">
              {sessions.map(s => (
                <LibraryCard key={s.id} session={s} onDelete={async (id) => { await deleteSession(id); loadSessions(); }} onPreview={setPreviewingSession} onEdit={setEditingSession} />
              ))}
            </div>
          </div>
        )}

        {previewingSession && previewUrl && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="max-w-4xl w-full bg-black border border-white/20 p-2 relative shadow-2xl">
              <button onClick={() => setPreviewingSession(null)} className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full"><X /></button>
              <video src={previewUrl} controls autoPlay className="w-full max-h-[80vh] object-contain" />
            </div>
          </div>
        )}

        {editingSession && (
          <VideoEditor session={editingSession} onClose={() => setEditingSession(null)} onSave={async (b) => {
            const id = `EDIT_${editingSession.id}_${Date.now()}`;
            await saveSession({ ...editingSession, id, videoBlob: b, createdAtISO: new Date().toISOString() });
            loadSessions(); setEditingSession(null);
          }} />
        )}
      </main>
    </div>
  );
};

const VideoEditor: React.FC<{ session: any; onClose: () => void; onSave: (b: Blob) => Promise<void> }> = ({ session, onClose, onSave }) => {
  const [segments, setSegments] = useState<VideoSegment[]>([{ id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds }]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl]);

  useEffect(() => {
    const handleS = (e: KeyboardEvent) => { if (e.key === 's' || e.key === 'S') split(); };
    window.addEventListener('keydown', handleS);
    return () => window.removeEventListener('keydown', handleS);
  }, [currentTime, segments]);

  const split = () => {
    let cum = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (currentTime > cum && currentTime < cum + s.duration) {
        const splitTime = s.start + (currentTime - cum);
        const ns = [...segments];
        ns.splice(i, 1, { ...s, end: splitTime, duration: splitTime - s.start }, { id: Math.random().toString(), start: splitTime, end: s.end, duration: s.end - splitTime });
        setSegments(ns);
        break;
      }
      cum += s.duration;
    }
  };

  const exportVid = async () => {
    setIsExporting(true);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const v = videoRef.current!;
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;

    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();

    for (const seg of segments) {
      const steps = Math.floor(seg.duration * 30);
      for (let i = 0; i < steps; i++) {
        v.currentTime = seg.start + (i / 30);
        await new Promise(r => setTimeout(r, 20));
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      }
    }

    setTimeout(() => {
      rec.stop();
      rec.onstop = async () => {
        onSave(new Blob(chunks, { type: 'video/webm' }));
        setIsExporting(false);
      };
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold uppercase tracking-tighter">Editor: {session.id}</h2>
        <button onClick={onClose} className="p-2 border border-white/20 rounded-full"><X /></button>
      </div>
      <div className="flex-grow bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
        <video ref={videoRef} src={videoUrl} onTimeUpdate={() => {
          if(!videoRef.current) return;
          let cum = 0;
          const v = videoRef.current;
          const seg = segments.find((s, idx) => {
             const startsAt = segments.slice(0, idx).reduce((acc, x) => acc + x.duration, 0);
             if (v.currentTime >= s.start && v.currentTime <= s.end) { cum = startsAt; return true; }
             return false;
          });
          if (seg) setCurrentTime(cum + (v.currentTime - seg.start));
        }} className="max-w-full max-h-full block" style={{ objectFit: 'contain' }} />
        {isExporting && <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50"><Loader2 className="animate-spin mb-2" /> Rendering...</div>}
      </div>
      <div className="mt-4 flex gap-4 items-center">
        <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} className="p-4 bg-white text-black"><Play className="fill-current" /></button>
        <div className="flex-grow h-12 bg-white/10 relative">
          <div className="absolute inset-0 flex">
             {segments.map((s, idx) => <div key={s.id} style={{ width: `${(s.duration / segments.reduce((a,b)=>a+b.duration, 0)) * 100}%` }} className={`h-full border-r border-black/50 ${idx % 2 === 0 ? 'bg-white/10' : 'bg-white/5'}`} />)}
          </div>
          <div style={{ left: `${(currentTime / segments.reduce((a,b)=>a+b.duration, 0)) * 100}%` }} className="absolute top-0 bottom-0 w-0.5 bg-red-500" />
        </div>
        <button onClick={exportVid} className="px-6 py-4 bg-white text-black font-bold uppercase">Save Final</button>
      </div>
    </div>
  );
};

const LibraryCard: React.FC<{ session: any; onDelete: (id: string) => void; onPreview: (s: any) => void; onEdit: (s: any) => void }> = ({ session, onDelete, onPreview, onEdit }) => {
  const url = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="border border-white/20 p-4 flex flex-col md:flex-row gap-6 bg-white/[0.02]">
      <div className={`bg-black md:w-48 overflow-hidden border border-white/10 cursor-pointer ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`} onClick={() => onPreview(session)}>
        <video src={url} muted className="w-full h-full object-cover opacity-60" />
      </div>
      <div className="flex-grow space-y-2">
        <div className="flex justify-between items-start">
          <h3 className="font-mono font-bold">{session.id}</h3>
          <div className="flex gap-2">
            <button onClick={() => { const a = document.createElement('a'); a.href = url; a.download = `${session.id}.webm`; a.click(); }} className="p-2 border border-white/20"><Download className="w-4 h-4" /></button>
            <button onClick={() => onDelete(session.id)} className="p-2 border border-red-600/50 text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex gap-2 text-[10px] text-white/40 uppercase font-bold">
          <span className="bg-white/5 px-2 py-0.5">{session.layoutStyle}</span>
          <span className="bg-white/5 px-2 py-0.5">{formatDuration(session.durationSeconds)}</span>
        </div>
        <div className="flex gap-2 pt-4">
          <button onClick={() => onEdit(session)} className="px-4 py-2 border border-white/20 text-xs font-bold uppercase hover:bg-white hover:text-black">Edit</button>
          <button onClick={() => onPreview(session)} className="px-4 py-2 border border-white/20 text-xs font-bold uppercase hover:bg-white/10">Preview</button>
        </div>
      </div>
    </div>
  );
};

export default App;
