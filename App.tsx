
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Video, 
  Library, 
  Settings, 
  Monitor, 
  Download, 
  Trash2,
  Play,
  Pause,
  StopCircle,
  Maximize2,
  X,
  Scissors,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Archive,
  RotateCcw,
  Camera,
  Mic,
  Cpu,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { RecordingSession, LayoutStyle, QualityConfig } from './types';
import { VideoRecorder } from './services/recorder';
import { getAllSessions, saveSession, deleteSession, clearAllSessions } from './services/db';

declare var JSZip: any;

interface VideoSegment {
  id: string;
  start: number;
  end: number;
  duration: number;
  color: string;
}

const COLORS = [
  'bg-blue-600/40 border-blue-400',
  'bg-purple-600/40 border-purple-400',
  'bg-emerald-600/40 border-emerald-400',
  'bg-amber-600/40 border-amber-400',
  'bg-pink-600/40 border-pink-400'
];

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [previewingSession, setPreviewingSession] = useState<RecordingSession | null>(null);
  const [editingSession, setEditingSession] = useState<RecordingSession | null>(null);
  
  const [layout, setLayout] = useState<LayoutStyle>('CIRCLE');
  const [useWebcam, setUseWebcam] = useState(true);
  const [quality, setQuality] = useState<QualityConfig>({ resolution: '1080p', fps: 30 });
  const [webcamId, setWebcamId] = useState('');
  const [micId, setMicId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const recorderRef = useRef<VideoRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
    loadDevices();
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

  return (
    <div className="flex flex-col min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      <header className="border-b border-white/10 p-4 sticky top-0 bg-black/90 backdrop-blur-md z-[60]">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-white flex items-center justify-center rounded">
                <Monitor className="w-5 h-5 text-black" />
             </div>
             <h1 className="text-xl font-black tracking-tighter uppercase">DecDecRec</h1>
          </div>
          <nav className="flex gap-2">
            <button onClick={() => setActiveTab('record')} className={`px-5 py-2 flex items-center gap-2 text-[10px] font-black tracking-widest transition-all rounded ${activeTab === 'record' ? 'bg-white text-black' : 'hover:bg-white/10'}`}>RECORD</button>
            <button onClick={() => setActiveTab('library')} className={`px-5 py-2 flex items-center gap-2 text-[10px] font-black tracking-widest transition-all rounded ${activeTab === 'library' ? 'bg-white text-black' : 'hover:bg-white/10'}`}>LIBRARY</button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto w-full p-6">
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-8">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                   <Layers className="w-3 h-3" /> Capture Layout
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`flex-1 py-4 border text-[10px] font-black tracking-widest transition-all rounded-lg ${layout === 'CIRCLE' ? 'bg-white text-black border-white' : 'border-white/10 hover:border-white/40'}`}>OVERLAY</button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`flex-1 py-4 border text-[10px] font-black tracking-widest transition-all rounded-lg ${layout === 'SHORTS' ? 'bg-white text-black border-white' : 'border-white/10 hover:border-white/40'}`}>SHORTS</button>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
                   <Camera className="w-3 h-3" /> Device Setup
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/30 ml-1">Webcam Source</label>
                    <select value={webcamId} onChange={(e) => setWebcamId(e.target.value)} disabled={isRecording} className="w-full bg-white/5 border border-white/10 p-3 text-xs rounded-lg focus:border-white transition-colors outline-none cursor-pointer">
                      {devices.filter(d => d.kind === 'videoinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
                      <option value="">No Camera</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/30 ml-1">Microphone</label>
                    <select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={isRecording} className="w-full bg-white/5 border border-white/10 p-3 text-xs rounded-lg focus:border-white transition-colors outline-none cursor-pointer">
                      {devices.filter(d => d.kind === 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {!isRecording ? (
                <button onClick={startRecording} className="w-full py-8 bg-white text-black font-black text-2xl hover:scale-[1.02] active:scale-[0.98] transition-all rounded-2xl shadow-[0_20px_50px_rgba(255,255,255,0.15)] flex items-center justify-center gap-4">
                  <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse" /> REC
                </button>
              ) : (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <button onClick={togglePause} className="flex-1 py-6 border border-white flex items-center justify-center gap-3 hover:bg-white/10 font-black rounded-2xl text-xs tracking-widest uppercase transition-all">
                       {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button onClick={stopRecording} className="flex-1 py-6 bg-red-600 text-white font-black flex items-center justify-center gap-3 hover:bg-red-700 active:scale-95 transition-all rounded-2xl text-xs tracking-widest uppercase shadow-xl">
                       <StopCircle className="w-4 h-4" /> Stop
                    </button>
                  </div>
                  <div className="text-center p-10 border border-white/5 bg-white/[0.03] rounded-3xl font-mono text-7xl tabular-nums tracking-tighter shadow-inner ring-1 ring-white/10">
                    {formatDuration(elapsed)}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-7">
              <section className={`border-2 border-white/10 bg-[#050505] relative overflow-hidden flex items-center justify-center transition-all rounded-3xl shadow-2xl ring-1 ring-white/5 ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[700px] mx-auto' : 'aspect-video w-full'}`}>
                <div ref={canvasContainerRef} className="w-full h-full"></div>
                {!isRecording && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/10 pointer-events-none select-none">
                      <Monitor className="w-20 h-20 opacity-10" />
                      <span className="text-[10px] font-black uppercase tracking-[0.5em]">Live Monitoring</span>
                   </div>
                )}
              </section>
              <div className="mt-4 flex items-center gap-4 text-white/40">
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest"><Cpu className="w-3 h-3" /> WebGL Render Active</div>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> GPU Acceleration</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-end border-b border-white/5 pb-8">
               <h2 className="text-4xl font-black uppercase tracking-tighter">Media Vault</h2>
               {sessions.length > 0 && (
                 <button onClick={async () => { if(confirm("Clear all recorded media?")) { await clearAllSessions(); loadSessions(); } }} className="text-[10px] font-black text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors">Clear All</button>
               )}
            </div>
            {sessions.length === 0 ? (
              <div className="py-40 text-center opacity-10 flex flex-col items-center gap-4">
                 <Archive className="w-16 h-16" />
                 <span className="text-[10px] font-black uppercase tracking-[0.5em]">No recordings found</span>
              </div>
            ) : (
              <div className="grid gap-8">
                {sessions.map(s => (
                  <LibraryCard key={s.id} session={s} onDelete={async (id) => { await deleteSession(id); loadSessions(); }} onPreview={setPreviewingSession} onEdit={setEditingSession} />
                ))}
              </div>
            )}
          </div>
        )}

        {previewingSession && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 backdrop-blur-2xl">
            <div className="max-w-5xl w-full bg-[#080808] border border-white/20 p-2 relative shadow-2xl rounded-2xl overflow-hidden">
              <button onClick={() => setPreviewingSession(null)} className="absolute top-4 right-4 z-10 p-3 bg-white text-black rounded-full hover:scale-110 transition-transform shadow-2xl"><X /></button>
              <video src={URL.createObjectURL(previewingSession.videoBlob)} controls autoPlay className="w-full max-h-[85vh] object-contain rounded-lg" />
            </div>
          </div>
        )}

        {editingSession && (
          <VideoEditor session={editingSession} onClose={() => setEditingSession(null)} onSave={async (b) => {
            const id = `EDT_${formatTimestamp()}`;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  const totalDuration = useMemo(() => segments.reduce((a, b) => a + b.duration, 0), [segments]);

  // Sync virtual time to video position based on segment list
  const updateCurrentTime = useCallback(() => {
    if (!videoRef.current || isExporting) return;
    const v = videoRef.current;
    
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (v.currentTime >= s.start && v.currentTime <= s.end + 0.05) {
        const offset = v.currentTime - s.start;
        setCurrentTime(acc + offset);
        
        // Auto-transition to next segment
        if (isPlaying && v.currentTime >= s.end - 0.05) {
          if (i < segments.length - 1) {
            v.currentTime = segments[i + 1].start;
          } else {
            v.pause();
            setIsPlaying(false);
            setCurrentTime(totalDuration);
          }
        }
        break;
      }
      acc += s.duration;
    }
  }, [segments, isPlaying, isExporting, totalDuration]);

  const seekToVirtualTime = (virtualTime: number) => {
    if (!videoRef.current) return;
    let acc = 0;
    for (const seg of segments) {
      if (virtualTime >= acc && virtualTime <= acc + seg.duration + 0.001) {
        const offset = virtualTime - acc;
        videoRef.current.currentTime = seg.start + offset;
        setCurrentTime(virtualTime);
        return;
      }
      acc += seg.duration;
    }
  };

  const scrub = (e: React.MouseEvent | React.TouchEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const target = (x / rect.width) * totalDuration;
    seekToVirtualTime(target);
  };

  const split = () => {
    let acc = 0;
    const activeIdx = segments.findIndex(s => {
      const res = currentTime >= acc && currentTime < acc + s.duration + 0.001;
      if (!res) acc += s.duration;
      return res;
    });

    if (activeIdx === -1) return;
    const s = segments[activeIdx];
    const offsetInSeg = currentTime - acc;

    if (offsetInSeg < 0.2 || offsetInSeg > s.duration - 0.2) return;

    const sourceSplitPoint = s.start + offsetInSeg;
    const ns = [...segments];
    const colorIdx = (activeIdx + 1) % COLORS.length;

    ns.splice(activeIdx, 1, 
      { ...s, id: Math.random().toString(), end: sourceSplitPoint, duration: offsetInSeg },
      { ...s, id: Math.random().toString(), start: sourceSplitPoint, duration: s.duration - offsetInSeg, color: COLORS[colorIdx] }
    );
    setSegments(ns);
  };

  const moveSegment = (idx: number, dir: number) => {
    const ns = [...segments];
    const target = idx + dir;
    if (target < 0 || target >= segments.length) return;
    [ns[idx], ns[target]] = [ns[target], ns[idx]];
    setSegments(ns);
    seekToVirtualTime(0);
  };

  const exportVid = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportStatus('Preparing Master...');
    setExportProgress(0);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const v = videoRef.current!;
    canvas.width = v.videoWidth || 1920;
    canvas.height = v.videoHeight || 1080;

    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { 
      mimeType: 'video/webm;codecs=vp9,opus', 
      videoBitsPerSecond: 12000000 
    });
    
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); };
    
    return new Promise<void>((resolve) => {
      rec.onstop = async () => {
        setExportStatus('Saving to Disk...');
        await onSave(new Blob(chunks, { type: 'video/webm' }));
        setIsExporting(false);
        resolve();
      };
      
      rec.start();

      (async () => {
        const fps = 30;
        let framesRendered = 0;
        const totalFrames = Math.floor(totalDuration * fps);

        for (const seg of segments) {
          const segFrames = Math.floor(seg.duration * fps);
          setExportStatus(`Exporting Segment (${formatDuration(seg.duration)})`);
          for (let i = 0; i < segFrames; i++) {
            v.currentTime = seg.start + (i / fps);
            await new Promise(r => {
              const onSeeked = () => {
                v.removeEventListener('seeked', onSeeked);
                r(null);
              };
              v.addEventListener('seeked', onSeeked);
            });
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            framesRendered++;
            setExportProgress(Math.floor((framesRendered / totalFrames) * 100));
          }
        }
        // Give a tiny buffer for the recorder to catch up
        setTimeout(() => rec.stop(), 500);
      })();
    });
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col p-8 animate-in slide-in-from-bottom duration-500">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
           <div className="p-2 bg-red-600 rounded">
              <Scissors className="w-5 h-5 text-white" />
           </div>
           <h2 className="text-2xl font-black uppercase tracking-tighter">Sequence Master</h2>
        </div>
        <div className="flex gap-4 items-center">
           <span className="px-3 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-mono opacity-60 uppercase tracking-widest">Master Duration: {formatDuration(totalDuration)}</span>
           <button onClick={onClose} className="p-3 border border-white/10 rounded-full hover:bg-white hover:text-black transition-all shadow-xl"><X className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex-grow bg-[#050505] border border-white/5 flex items-center justify-center relative overflow-hidden rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] ring-1 ring-white/10">
        <div className="w-full h-full relative flex items-center justify-center">
          <video 
            ref={videoRef} 
            src={videoUrl} 
            muted 
            playsInline
            onTimeUpdate={updateCurrentTime}
            onLoadedMetadata={() => { if(videoRef.current) videoRef.current.currentTime = segments[0].start; }}
            className="max-w-full max-h-full block rounded-xl shadow-2xl" 
            style={{ objectFit: 'contain' }} 
          />
        </div>
        
        {isExporting && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-50 backdrop-blur-3xl">
            <div className="w-96 space-y-8 p-10 bg-white/5 rounded-3xl border border-white/10 shadow-2xl">
              <div className="flex justify-between text-[11px] font-black uppercase tracking-[0.4em] text-white/50">
                <span>{exportStatus}</span>
                <span>{exportProgress}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden shadow-inner ring-1 ring-white/10">
                <div style={{ width: `${exportProgress}%` }} className="h-full bg-white transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.6)]" />
              </div>
              <div className="flex flex-col items-center gap-2">
                 <Loader2 className="w-6 h-6 animate-spin opacity-40" />
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-20">Do not close window</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-8 bg-[#0a0a0a] p-10 rounded-[2.5rem] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
        <div className="flex gap-8 items-center">
          <button 
            onClick={() => {
              if(!videoRef.current) return;
              if(isPlaying) videoRef.current.pause();
              else videoRef.current.play();
              setIsPlaying(!isPlaying);
            }} 
            className="p-10 bg-white text-black hover:bg-gray-200 transition-all active:scale-90 shadow-[0_10px_40px_rgba(255,255,255,0.1)] rounded-3xl"
          >
            {isPlaying ? <Pause className="fill-current w-10 h-10" /> : <Play className="fill-current w-10 h-10" />}
          </button>
          
          <div 
            ref={timelineRef} 
            onMouseDown={scrub} 
            onMouseMove={(e) => e.buttons === 1 && scrub(e)} 
            className="flex-grow h-36 bg-white/[0.02] relative overflow-hidden border border-white/10 rounded-[2rem] cursor-crosshair select-none shadow-inner"
          >
            <div className="absolute inset-0 flex">
              {segments.map((s, idx) => (
                <div 
                  key={s.id} 
                  style={{ width: `${(s.duration / totalDuration) * 100}%` }} 
                  className={`h-full border-r border-black/50 relative group/seg transition-all ${s.color} hover:brightness-125`}
                >
                  <div className="absolute inset-0 opacity-0 group-hover/seg:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm z-20">
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); moveSegment(idx, -1); }} className="p-3 bg-white/10 hover:bg-white/30 rounded-xl transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setSegments(segments.filter(seg => seg.id !== s.id)); seekToVirtualTime(0); }} className="p-3 bg-red-600/20 hover:bg-red-600 rounded-xl transition-colors"><Trash2 className="w-5 h-5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); moveSegment(idx, 1); }} className="p-3 bg-white/10 hover:bg-white/30 rounded-xl transition-colors"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                  </div>
                  <span className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-widest opacity-40 drop-shadow-lg">{formatDuration(s.duration)}</span>
                </div>
              ))}
            </div>
            {/* Playhead */}
            <div 
              style={{ left: `${(currentTime / totalDuration) * 100}%` }} 
              className="absolute top-0 bottom-0 w-[4px] bg-red-600 shadow-[0_0_40px_rgba(220,38,38,1)] z-30 pointer-events-none transition-transform" 
            />
          </div>

          <div className="flex flex-col gap-4 min-w-[160px]">
            <button onClick={split} className="w-full px-8 py-5 bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 rounded-2xl transition-all active:scale-95 shadow-xl">
              <Scissors className="w-4 h-4" /> SPLIT (S)
            </button>
            <button onClick={() => { setSegments([{ id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds, color: COLORS[0] }]); seekToVirtualTime(0); }} className="w-full px-8 py-5 border border-white/5 text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 rounded-2xl text-white/20 hover:text-white transition-all">
              <RotateCcw className="w-4 h-4" /> RESET
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center px-4">
           <div className="flex flex-col gap-1.5">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30">Editing Controls</span>
             <span className="text-[9px] italic tracking-[0.1em] text-white/20">Click track to scrub • S to split at playhead • Hover segment to reorder or remove</span>
           </div>
           <button 
             onClick={exportVid} 
             disabled={isExporting} 
             className="px-24 py-8 bg-white text-black font-black uppercase tracking-[0.4em] hover:scale-[1.02] active:scale-[0.98] transition-all rounded-[1.5rem] shadow-[0_20px_50px_rgba(255,255,255,0.15)] disabled:opacity-50"
           >
             RENDER FINAL MASTER
           </button>
        </div>
      </div>
    </div>
  );
};

const LibraryCard: React.FC<{ session: any; onDelete: (id: string) => void; onPreview: (s: any) => void; onEdit: (s: any) => void }> = ({ session, onDelete, onPreview, onEdit }) => {
  const url = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);
  return (
    <div className="border border-white/5 p-8 flex flex-col md:flex-row gap-10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20 transition-all group relative overflow-hidden rounded-[2rem] shadow-xl">
      <div className={`bg-black md:w-64 overflow-hidden border border-white/10 cursor-pointer relative transition-transform group-hover:scale-[1.03] rounded-2xl shadow-2xl ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`} onClick={() => onPreview(session)}>
        <video src={url} muted className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
           <Play className="fill-white w-14 h-14" />
        </div>
      </div>
      <div className="flex-grow space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h3 className="font-mono font-bold text-3xl tracking-tighter group-hover:text-white transition-colors">{session.id}</h3>
            <div className="flex gap-4 items-center">
               <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">{new Date(session.createdAtISO).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</span>
               <div className="w-1 h-1 bg-white/20 rounded-full" />
               <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">{formatDuration(session.durationSeconds)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => triggerDownload(url, `${session.id}.webm`)} className="p-5 border border-white/5 hover:bg-white hover:text-black transition-all rounded-2xl shadow-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><Download className="w-4 h-4" /> WebM</button>
            <button onClick={() => onDelete(session.id)} className="p-5 border border-red-900/10 text-red-500/40 hover:bg-red-600 hover:text-white transition-all rounded-2xl"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex gap-4 pt-6">
          <button onClick={() => onEdit(session)} className="px-12 py-5 bg-white text-black text-[11px] font-black uppercase tracking-[0.3em] hover:scale-[1.05] transition-all flex items-center gap-3 active:scale-95 shadow-2xl rounded-2xl"><Scissors className="w-5 h-5" /> OPEN SEQUENCE EDITOR</button>
          <button onClick={() => onPreview(session)} className="px-12 py-5 border border-white/10 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-white/10 transition-all flex items-center gap-3 active:scale-95 rounded-2xl"><Maximize2 className="w-5 h-5" /> PREVIEW</button>
        </div>
      </div>
    </div>
  );
};

export default App;
