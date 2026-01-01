
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronLeft,
  Save,
  Loader2,
  Archive,
  RotateCcw
} from 'lucide-react';
import { RecordingSession, LayoutStyle, QualityConfig, StorageEstimate, TranscriptionSettings } from './types';
import { VideoRecorder } from './services/recorder';
import { getAllSessions, saveSession, deleteSession, clearAllSessions } from './services/db';

// Accessing JSZip from global window (loaded via CDN in index.html)
declare var JSZip: any;

interface VideoSegment {
  id: string;
  start: number;
  end: number;
  duration: number;
  color: string;
}

const COLORS = [
  'bg-blue-500/20 border-blue-500',
  'bg-purple-500/20 border-purple-500',
  'bg-emerald-500/20 border-emerald-500',
  'bg-amber-500/20 border-amber-500',
  'bg-pink-500/20 border-pink-500',
  'bg-indigo-500/20 border-indigo-500'
];

const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatTimestamp = () => {
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = now.getDate().toString().padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`;
};

const triggerDownload = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
  }, 2000);
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library' | 'settings'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [editingSession, setEditingSession] = useState<RecordingSession | null>(null);
  
  const [layout, setLayout] = useState<LayoutStyle>('CIRCLE');
  const [useWebcam, setUseWebcam] = useState(true);
  const [quality, setQuality] = useState<QualityConfig>({ resolution: '1080p', fps: 30 });
  const [webcamId, setWebcamId] = useState('');
  const [micId, setMicId] = useState('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

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
  }, []);

  useEffect(() => {
    if (isRecording && recorderRef.current && canvasContainerRef.current) {
      const canvas = recorderRef.current.getCanvas();
      canvas.className = "w-full h-full object-contain cursor-move";
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
    } catch (err: any) {
      console.error("Device access error", err);
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
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    const blob = await recorderRef.current.stop();
    if (blob) {
      const now = new Date();
      const id = formatTimestamp();
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

  const handleZipExport = async (session: RecordingSession) => {
    const zip = new JSZip();
    zip.file(`${session.id}.webm`, session.videoBlob);
    zip.file("metadata.json", JSON.stringify({
      id: session.id,
      created: session.createdAtISO,
      duration: session.durationSeconds,
      layout: session.layoutStyle,
      quality: session.quality
    }, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    triggerDownload(url, `${session.id}_bundle.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-white/20 p-4 sticky top-0 bg-black z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2 tracking-tighter"><Monitor className="w-6 h-6" /> DecDecRec</h1>
          <nav className="flex gap-4">
            <button onClick={() => setActiveTab('record')} className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'record' ? 'bg-white text-black' : 'hover:bg-white/10'}`}><Video className="w-4 h-4" /> Record</button>
            <button onClick={() => setActiveTab('library')} className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'library' ? 'bg-white text-black' : 'hover:bg-white/10'}`}><Library className="w-4 h-4" /> Library</button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto w-full p-6">
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold border-b border-white/10 pb-2 uppercase tracking-widest">Layout</h2>
                <div className="flex gap-4">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`flex-1 p-4 border transition-all font-bold ${layout === 'CIRCLE' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'}`}>CIRCLE OVERLAY</button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`flex-1 p-4 border transition-all font-bold ${layout === 'SHORTS' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'}`}>9:16 SHORTS</button>
                </div>
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold uppercase tracking-widest">Devices</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold opacity-60 uppercase">Webcam</span>
                    <button onClick={() => setUseWebcam(!useWebcam)} className={`px-4 py-1 border transition-colors text-xs font-bold ${useWebcam ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'}`}>{useWebcam ? 'ON' : 'OFF'}</button>
                  </div>
                  {useWebcam && (
                    <select value={webcamId} onChange={(e) => setWebcamId(e.target.value)} className="w-full bg-black border border-white/20 p-2 text-sm focus:border-white transition-colors outline-none">
                      {devices.filter(d => d.kind === 'videoinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
                    </select>
                  )}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Microphone</span>
                    <select value={micId} onChange={(e) => setMicId(e.target.value)} className="w-full bg-black border border-white/20 p-2 text-sm focus:border-white transition-colors outline-none">
                      {devices.filter(d => d.kind === 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {!isRecording ? (
                <button onClick={startRecording} className="w-full py-6 bg-white text-black font-black text-2xl hover:bg-gray-200 transition-colors shadow-2xl">START RECORDING</button>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <button onClick={togglePause} className="flex-1 py-4 border border-white flex items-center justify-center gap-2 hover:bg-white/10 font-bold">{isPaused ? <Play className="w-5 h-5 fill-white" /> : <Pause className="w-5 h-5 fill-white" />} {isPaused ? 'RESUME' : 'PAUSE'}</button>
                    <button onClick={stopRecording} className="flex-1 py-4 bg-red-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-all"><StopCircle /> STOP</button>
                  </div>
                  <div className="text-center p-4 border border-white/10 bg-white/5 font-mono text-4xl tabular-nums shadow-inner">{formatDuration(elapsed)}</div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <section 
                className={`border border-white/20 bg-black relative overflow-hidden flex items-center justify-center transition-all ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[600px] mx-auto' : 'aspect-video shadow-2xl'}`}
                onMouseDown={() => (isDraggingWebcam.current = true)}
                onMouseUp={() => (isDraggingWebcam.current = false)}
                onMouseLeave={() => (isDraggingWebcam.current = false)}
                onMouseMove={handlePreviewMouseMove}
              >
                <div ref={canvasContainerRef} className="w-full h-full"></div>
                {!isRecording && <div className="absolute inset-0 flex flex-col items-center justify-center text-white/5 font-black uppercase tracking-widest text-3xl pointer-events-none select-none">
                  <Monitor className="w-20 h-20 mb-4 opacity-5" />
                  Live Preview
                </div>}
              </section>
              {isRecording && <p className="text-[10px] text-white/40 uppercase text-center italic tracking-widest animate-pulse">Tip: Drag circle overlay to reposition live</p>}
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-6">
            <div className="flex justify-between items-end border-b border-white/10 pb-4">
              <h2 className="text-2xl font-bold uppercase tracking-tight">Library</h2>
              {sessions.length > 0 && (
                <button onClick={async () => { if(confirm("Clear library?")) { await clearAllSessions(); loadSessions(); } }} className="text-xs font-bold text-red-500 hover:text-red-400 uppercase tracking-widest transition-colors flex items-center gap-2">
                  <Trash2 className="w-3 h-3" /> Clear Library
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="p-20 text-center text-white/10 flex flex-col items-center">
                <Database className="w-16 h-16 mb-4 opacity-20" />
                <p className="uppercase font-black tracking-widest opacity-20">Library Empty</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {sessions.map(s => (
                  <LibraryCard key={s.id} session={s} onDelete={async (id) => { await deleteSession(id); loadSessions(); }} onPreview={setPreviewingSession} onEdit={setEditingSession} onZip={handleZipExport} />
                ))}
              </div>
            )}
          </div>
        )}

        {previewingSession && previewUrl && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="max-w-5xl w-full bg-black border border-white/20 p-2 relative shadow-[0_0_100px_rgba(255,255,255,0.1)]">
              <button onClick={() => setPreviewingSession(null)} className="absolute -top-4 -right-4 z-10 p-2 bg-white text-black rounded-full shadow-2xl transition-transform hover:scale-110"><X className="w-6 h-6" /></button>
              <div className="flex flex-col gap-2">
                <video src={previewUrl} controls autoPlay className="w-full max-h-[80vh] object-contain" />
              </div>
            </div>
          </div>
        )}

        {editingSession && (
          <VideoEditor session={editingSession} onClose={() => setEditingSession(null)} onSave={async (b) => {
            const id = `EDITED_${formatTimestamp()}`;
            await saveSession({ ...editingSession, id, videoBlob: b, createdAtISO: new Date().toISOString() });
            loadSessions(); setEditingSession(null);
          }} />
        )}
      </main>
    </div>
  );
};

const VideoEditor: React.FC<{ session: any; onClose: () => void; onSave: (b: Blob) => Promise<void> }> = ({ session, onClose, onSave }) => {
  const [segments, setSegments] = useState<VideoSegment[]>([{ id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds, color: COLORS[0] }]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl]);

  const totalEditorDuration = useMemo(() => segments.reduce((a, b) => a + b.duration, 0), [segments]);

  // Handle seamless playback transitions
  useEffect(() => {
    const v = videoRef.current;
    if (!v || isExporting) return;

    const checkTransition = () => {
      const activeSegIdx = getSegmentIndexAtLocalTime(currentTime);
      if (activeSegIdx === -1) return;

      const seg = segments[activeSegIdx];
      // Check if video reached the end of the current segment
      if (v.currentTime >= seg.end - 0.05) {
        if (activeSegIdx < segments.length - 1) {
          const nextSeg = segments[activeSegIdx + 1];
          v.currentTime = nextSeg.start;
        } else {
          v.pause();
          v.currentTime = segments[0].start;
          setCurrentTime(0);
        }
      }
    };

    const interval = setInterval(checkTransition, 50);
    return () => clearInterval(interval);
  }, [currentTime, segments, isExporting]);

  const getCumulativeDuration = (index: number) => {
    return segments.slice(0, index).reduce((acc, s) => acc + s.duration, 0);
  };

  const getSegmentIndexAtLocalTime = (localTime: number) => {
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      if (localTime >= acc && localTime < acc + segments[i].duration + 0.001) return i;
      acc += segments[i].duration;
    }
    return -1;
  };

  const scrub = (e: React.MouseEvent | React.TouchEvent) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = x / rect.width;
    const targetLocalTime = percentage * totalEditorDuration;

    const segIdx = getSegmentIndexAtLocalTime(targetLocalTime);
    if (segIdx !== -1) {
      const seg = segments[segIdx];
      const timeInSeg = targetLocalTime - getCumulativeDuration(segIdx);
      videoRef.current.currentTime = seg.start + timeInSeg;
      setCurrentTime(targetLocalTime);
    }
  };

  const split = () => {
    const activeIdx = getSegmentIndexAtLocalTime(currentTime);
    if (activeIdx === -1) return;

    const s = segments[activeIdx];
    const localStart = getCumulativeDuration(activeIdx);
    const splitPointInSource = s.start + (currentTime - localStart);

    // Don't allow splitting too close to edges
    if (splitPointInSource <= s.start + 0.15 || splitPointInSource >= s.end - 0.15) return;

    const ns = [...segments];
    const colorIdx = (activeIdx + 1) % COLORS.length;
    
    ns.splice(activeIdx, 1, 
      { ...s, end: splitPointInSource, duration: splitPointInSource - s.start },
      { id: Math.random().toString(), start: splitPointInSource, end: s.end, duration: s.end - splitPointInSource, color: COLORS[colorIdx] }
    );
    setSegments(ns);
  };

  const deleteSegment = (id: string) => {
    if (segments.length <= 1) return;
    const ns = segments.filter(s => s.id !== id);
    setSegments(ns);
    setCurrentTime(0);
    if (videoRef.current) videoRef.current.currentTime = ns[0].start;
  };

  const moveSegment = (idx: number, direction: 'left' | 'right') => {
    const ns = [...segments];
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (target < 0 || target >= segments.length) return;
    [ns[idx], ns[target]] = [ns[target], ns[idx]];
    setSegments(ns);
    setCurrentTime(0);
  };

  const exportVid = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportStatus('Initializing rendering engine...');
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const v = videoRef.current!;
    
    // Use the native video dimensions or fallback
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;

    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { 
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 5000000 // 5Mbps for quality
    });
    
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    
    return new Promise<void>((resolve) => {
      rec.onstop = async () => {
        setExportStatus('Encoding final master...');
        const finalBlob = new Blob(chunks, { type: 'video/webm' });
        await onSave(finalBlob);
        setIsExporting(false);
        resolve();
      };
      
      rec.start();

      (async () => {
        const fps = 30;
        let framesRendered = 0;
        const totalFrames = Math.floor(totalEditorDuration * fps);

        for (const seg of segments) {
          const segFrames = Math.floor(seg.duration * fps);
          setExportStatus(`Rendering clip segment...`);
          
          for (let i = 0; i < segFrames; i++) {
            const targetTime = seg.start + (i / fps);
            v.currentTime = targetTime;
            
            // Wait for seek to complete before drawing
            await new Promise(r => {
              const handler = () => {
                v.removeEventListener('seeked', handler);
                r(null);
              };
              v.addEventListener('seeked', handler);
            });
            
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            framesRendered++;
            setExportProgress(Math.floor((framesRendered / totalFrames) * 100));
          }
        }
        
        // Final buffer
        setTimeout(() => rec.stop(), 800);
      })();
    });
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col p-4 animate-in slide-in-from-bottom duration-300">
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2 text-white/90">
          <Scissors className="w-5 h-5 text-red-500" /> Sequence Master
        </h2>
        <div className="flex gap-4 items-center">
           <span className="text-xs font-mono text-white/40 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Length: {formatDuration(totalEditorDuration)}</span>
           <button onClick={onClose} className="p-2 border border-white/10 rounded-full hover:bg-white/10 transition-colors"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow bg-[#080808] border border-white/5 flex items-center justify-center relative overflow-hidden rounded-xl shadow-2xl group">
        <video 
          ref={videoRef} 
          src={videoUrl} 
          onTimeUpdate={() => {
            if(!videoRef.current || isExporting) return;
            const v = videoRef.current;
            const activeIdx = segments.findIndex(s => v.currentTime >= s.start && v.currentTime <= s.end + 0.05);
            if (activeIdx !== -1) {
              const cum = getCumulativeDuration(activeIdx);
              setCurrentTime(cum + (v.currentTime - segments[activeIdx].start));
            }
          }}
          className="max-w-full max-h-full block shadow-2xl pointer-events-none" 
          style={{ objectFit: 'contain' }} 
        />
        
        {isExporting && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 backdrop-blur-xl">
            <div className="w-80 space-y-6">
              <div className="flex justify-between text-[11px] font-black uppercase tracking-[0.2em] text-white/60">
                <span>{exportStatus}</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden shadow-inner">
                <div style={{ width: `${exportProgress}%` }} className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-300" />
              </div>
              <p className="text-center font-bold text-[10px] uppercase tracking-[0.4em] text-white animate-pulse">Processing High-Quality Master</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-6 bg-[#0a0a0a] p-5 rounded-xl border border-white/5 shadow-2xl">
        <div className="flex gap-5 items-center">
          <button 
            onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} 
            className="p-5 bg-white text-black hover:bg-gray-200 transition-all active:scale-90 shadow-xl rounded-xl"
          >
            <Play className="fill-current w-6 h-6" />
          </button>
          
          <div 
            ref={timelineRef}
            onClick={scrub}
            className="flex-grow h-24 bg-white/[0.03] relative overflow-hidden border border-white/10 rounded-xl group/timeline cursor-crosshair"
          >
            <div className="absolute inset-0 flex">
              {segments.map((s, idx) => (
                <div 
                  key={s.id} 
                  style={{ width: `${(s.duration / totalEditorDuration) * 100}%` }} 
                  className={`h-full border-r border-black/50 relative group/seg transition-all ${s.color} hover:brightness-125`}
                >
                  <div className="absolute inset-0 opacity-0 group-hover/seg:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm z-20">
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); moveSegment(idx, 'left'); }} className="p-2 bg-white/10 hover:bg-white/30 rounded-lg transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteSegment(s.id); }} className="p-2 bg-red-600/40 hover:bg-red-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveSegment(idx, 'right'); }} className="p-2 bg-white/10 hover:bg-white/30 rounded-lg transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-tighter opacity-50 bg-black/40 px-1 rounded">{formatDuration(s.duration)}</span>
                </div>
              ))}
            </div>
            
            {/* Playhead */}
            <div 
              style={{ left: `${(currentTime / totalEditorDuration) * 100}%` }} 
              className="absolute top-0 bottom-0 w-[3px] bg-red-600 shadow-[0_0_20px_rgba(220,38,38,1)] z-30 pointer-events-none transition-all duration-75" 
            />
          </div>

          <div className="flex flex-col gap-3 min-w-[120px]">
            <button onClick={split} className="px-5 py-3 border border-white/10 hover:border-white/30 hover:bg-white/5 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl transition-all active:scale-95 shadow-lg">
              <Scissors className="w-3.5 h-3.5" /> Split (S)
            </button>
            <button onClick={() => { setSegments([{ id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds, color: COLORS[0] }]); setCurrentTime(0); }} className="px-5 py-3 border border-white/5 hover:bg-white/5 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl text-white/30 transition-all">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center px-2">
           <div className="flex flex-col">
             <p className="text-[10px] text-white/30 uppercase font-black tracking-[0.2em]">Sequence Timeline</p>
             <p className="text-[9px] text-white/20 italic tracking-wider">Scrub the track to navigate • Press S to cut • Drag segments to reorder</p>
           </div>
           <button 
             onClick={exportVid} 
             disabled={isExporting} 
             className="px-14 py-5 bg-white text-black font-black uppercase tracking-[0.25em] hover:bg-gray-200 active:scale-95 transition-all rounded-xl shadow-[0_10px_40px_rgba(255,255,255,0.1)] disabled:opacity-50"
           >
             Render Final Master
           </button>
        </div>
      </div>
    </div>
  );
};

const LibraryCard: React.FC<{ session: any; onDelete: (id: string) => void; onPreview: (s: any) => void; onEdit: (s: any) => void; onZip: (s: any) => void }> = ({ session, onDelete, onPreview, onEdit, onZip }) => {
  const url = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const handleDownloadWebm = () => {
    const downloadUrl = URL.createObjectURL(session.videoBlob);
    triggerDownload(downloadUrl, `${session.id}.webm`);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
  };

  return (
    <div className="border border-white/10 p-5 flex flex-col md:flex-row gap-6 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/30 transition-all group relative overflow-hidden rounded-xl">
      <div className={`bg-black md:w-52 overflow-hidden border border-white/10 cursor-pointer relative transition-transform group-hover:scale-[1.02] rounded-lg ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`} onClick={() => onPreview(session)}>
        <video src={url} muted className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
           <Play className="fill-white w-10 h-10 drop-shadow-2xl" />
        </div>
      </div>
      <div className="flex-grow space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="font-mono font-bold text-xl tracking-tighter group-hover:text-white transition-colors">{session.id}</h3>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">{new Date(session.createdAtISO).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onZip(session)} className="p-3 border border-white/10 hover:border-white/40 hover:bg-white/10 transition-all rounded-lg" title="Export Full ZIP"><Archive className="w-4 h-4" /></button>
            <button onClick={handleDownloadWebm} className="p-3 border border-white/10 hover:border-white/40 hover:bg-white/10 transition-all rounded-lg" title="Download Source WebM"><Download className="w-4 h-4" /></button>
            <button onClick={() => onDelete(session.id)} className="p-3 border border-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-all rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-white/50 uppercase font-black tracking-widest">
          <span className="bg-white/5 border border-white/5 px-2 py-1 rounded-md flex items-center gap-1.5"><Monitor className="w-3 h-3" /> {session.layoutStyle}</span>
          <span className="bg-white/5 border border-white/5 px-2 py-1 rounded-md">{formatDuration(session.durationSeconds)}</span>
          <span className="bg-white/5 border border-white/5 px-2 py-1 rounded-md">{session.quality.resolution}</span>
        </div>
        <div className="flex gap-4 pt-2">
          <button onClick={() => onEdit(session)} className="px-7 py-3 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white hover:text-black hover:border-white transition-all flex items-center gap-2 active:scale-95 shadow-xl rounded-lg"><Scissors className="w-3.5 h-3.5" /> Open Editor</button>
          <button onClick={() => onPreview(session)} className="px-7 py-3 border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center gap-2 active:scale-95 rounded-lg"><Maximize2 className="w-3.5 h-3.5" /> Preview</button>
        </div>
      </div>
    </div>
  );
};

export default App;
