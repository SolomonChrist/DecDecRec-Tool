
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
  CheckCircle2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  FileArchive
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
  'bg-blue-500/20 border-blue-500',
  'bg-purple-500/20 border-purple-500',
  'bg-emerald-500/20 border-emerald-500',
  'bg-amber-500/20 border-amber-500',
  'bg-pink-500/20 border-pink-500'
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
      canvas.className = "w-full h-full object-contain";
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

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/5 p-4 sticky top-0 bg-black/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            <h1 className="text-lg font-bold tracking-tight">DecDecRec</h1>
          </div>
          <nav className="flex bg-white/5 p-1 rounded-lg border border-white/5">
            <button onClick={() => setActiveTab('record')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'record' ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'}`}>Record</button>
            <button onClick={() => setActiveTab('library')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'library' ? 'bg-white text-black shadow-sm' : 'text-white/60 hover:text-white'}`}>Library</button>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-6">
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Layout</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`py-3 text-[11px] font-bold rounded-xl border transition-all ${layout === 'CIRCLE' ? 'bg-white text-black border-white' : 'border-white/10 hover:bg-white/5 text-white/60'}`}>OVERLAY</button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`py-3 text-[11px] font-bold rounded-xl border transition-all ${layout === 'SHORTS' ? 'bg-white text-black border-white' : 'border-white/10 hover:bg-white/5 text-white/60'}`}>SHORTS</button>
                </div>
              </section>

              <section className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Devices</h2>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/30 font-bold ml-1">Webcam</label>
                    <select value={webcamId} onChange={(e) => setWebcamId(e.target.value)} disabled={isRecording} className="w-full bg-black border border-white/10 p-3 text-sm rounded-xl focus:border-white transition-all outline-none">
                      {devices.filter(d => d.kind === 'videoinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>)}
                      <option value="">Off</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/30 font-bold ml-1">Microphone</label>
                    <select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={isRecording} className="w-full bg-black border border-white/10 p-3 text-sm rounded-xl focus:border-white transition-all outline-none">
                      {devices.filter(d => d.kind === 'audioinput').map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              <div className="pt-2">
                {!isRecording ? (
                  <button onClick={startRecording} className="w-full py-6 bg-white text-black font-bold text-lg hover:scale-[1.01] active:scale-[0.99] transition-all rounded-2xl shadow-xl flex items-center justify-center gap-3">
                    <div className="w-3 h-3 bg-red-600 rounded-full" /> START RECORDING
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button onClick={togglePause} className="flex-1 py-4 border border-white/20 bg-white/5 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all">
                        {isPaused ? 'Resume' : 'Pause'}
                      </button>
                      <button onClick={stopRecording} className="flex-1 py-4 bg-red-600 rounded-2xl font-bold text-sm hover:bg-red-700 transition-all flex items-center justify-center gap-2">
                        <StopCircle className="w-4 h-4" /> Stop
                      </button>
                    </div>
                    <div className="text-center p-8 bg-white/5 rounded-3xl font-mono text-5xl tabular-nums tracking-tighter">
                      {formatDuration(elapsed)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className={`bg-black rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative flex items-center justify-center ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[750px] mx-auto' : 'aspect-video'}`}>
                <div ref={canvasContainerRef} className="w-full h-full"></div>
                {!isRecording && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center opacity-10 select-none">
                    <Monitor className="w-16 h-16 mb-4" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Ready to capture</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex justify-between items-end border-b border-white/5 pb-6">
              <h2 className="text-2xl font-bold tracking-tight">Media Library</h2>
              {sessions.length > 0 && (
                <button onClick={async () => { if(confirm("Delete all recordings?")) { await clearAllSessions(); loadSessions(); } }} className="text-xs font-medium text-white/30 hover:text-red-500 transition-colors">Clear All</button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="py-40 text-center opacity-20">
                <span className="text-sm font-medium">Vault Empty</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sessions.map(s => (
                  <LibraryCard 
                    key={s.id} 
                    session={s} 
                    onDelete={async (id) => { await deleteSession(id); loadSessions(); }} 
                    onPreview={setPreviewingSession} 
                    onEdit={setEditingSession} 
                    onZip={handleZipDownload}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {editingSession && (
          <VideoEditor session={editingSession} onClose={() => setEditingSession(null)} onSave={async (b) => {
            const id = `Edited_${formatTimestamp()}`;
            await saveSession({ ...editingSession, id, videoBlob: b, createdAtISO: new Date().toISOString() });
            loadSessions(); setEditingSession(null);
          }} />
        )}

        {previewingSession && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6 backdrop-blur-md">
            <div className="max-w-4xl w-full bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex justify-between items-center p-4 border-b border-white/5 bg-black/50">
                <span className="text-xs font-bold text-white/40">{previewingSession.id}</span>
                <button onClick={() => setPreviewingSession(null)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-4 h-4" /></button>
              </div>
              <video src={URL.createObjectURL(previewingSession.videoBlob)} controls autoPlay className="w-full max-h-[80vh] bg-black" />
            </div>
          </div>
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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  const totalDuration = useMemo(() => segments.reduce((a, b) => a + b.duration, 0), [segments]);

  const updateCurrentTime = useCallback(() => {
    if (!videoRef.current || isExporting) return;
    const v = videoRef.current;
    
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (v.currentTime >= s.start && v.currentTime <= s.end + 0.05) {
        const offset = v.currentTime - s.start;
        setCurrentTime(acc + offset);
        
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
      { id: Math.random().toString(), start: sourceSplitPoint, end: s.end, duration: s.duration - offsetInSeg, color: COLORS[colorIdx] }
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
    setExportProgress(0);
    
    const v = videoRef.current!;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = v.videoWidth || 1920;
    canvas.height = v.videoHeight || 1080;

    // To ensure sound and correct speed, we do a real-time playback capture 
    // but optimized for the browser's capabilities.
    const canvasStream = canvas.captureStream(30);
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sourceNode = audioContext.createMediaElementSource(v);
    const destination = audioContext.createMediaStreamDestination();
    sourceNode.connect(destination);
    sourceNode.connect(audioContext.destination);

    const finalStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    const rec = new MediaRecorder(finalStream, { 
      mimeType: 'video/webm;codecs=vp9,opus', 
      videoBitsPerSecond: 8000000 
    });
    
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); };
    
    return new Promise<void>((resolve) => {
      rec.onstop = async () => {
        const finalBlob = new Blob(chunks, { type: 'video/webm' });
        await onSave(finalBlob);
        setIsExporting(false);
        resolve();
      };
      
      rec.start();
      v.pause();
      
      (async () => {
        let currentSegIdx = 0;
        
        const renderLoop = async () => {
          if (currentSegIdx >= segments.length) {
            rec.stop();
            return;
          }

          const s = segments[currentSegIdx];
          v.currentTime = s.start;
          v.play();

          const checkEnd = async () => {
            if (v.currentTime >= s.end - 0.05 || v.ended) {
              v.pause();
              currentSegIdx++;
              renderLoop();
            } else {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              // Calculate overall progress
              const playedDuration = segments.slice(0, currentSegIdx).reduce((a,b) => a+b.duration, 0) + (v.currentTime - s.start);
              setExportProgress(Math.floor((playedDuration / totalDuration) * 100));
              requestAnimationFrame(checkEnd);
            }
          };
          requestAnimationFrame(checkEnd);
        };
        
        await renderLoop();
      })();
    });
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col p-6 animate-in slide-in-from-bottom duration-300">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-red-500" />
          <h2 className="text-xl font-bold tracking-tight">Sequence Editor</h2>
        </div>
        <div className="flex gap-4 items-center">
           <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Total: {formatDuration(totalDuration)}</span>
           <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
        </div>
      </div>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
        <div className="lg:col-span-3 bg-[#050505] rounded-3xl border border-white/5 flex items-center justify-center relative overflow-hidden shadow-inner">
          <video 
            ref={videoRef} 
            src={videoUrl} 
            playsInline
            onTimeUpdate={updateCurrentTime}
            onLoadedMetadata={() => { if(videoRef.current) videoRef.current.currentTime = segments[0].start; }}
            className="max-w-full max-h-full block rounded-xl shadow-2xl" 
            style={{ objectFit: 'contain' }} 
          />
          {isExporting && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 backdrop-blur-xl">
              <div className="w-64 space-y-4">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/50">
                  <span>Rendering...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div style={{ width: `${exportProgress}%` }} className="h-full bg-white transition-all duration-300" />
                </div>
                <p className="text-[10px] text-center text-white/30 italic">Processing master with sound...</p>
              </div>
            </div>
          )}
        </div>

        {/* Clips Panel */}
        <div className="lg:col-span-1 bg-white/[0.02] border border-white/5 rounded-3xl flex flex-col min-h-0 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-white/30">Clips Sequence</span>
            <span className="text-[10px] font-mono text-white/20">{segments.length} segments</span>
          </div>
          <div className="flex-grow overflow-y-auto space-y-2 pr-2 custom-scroll">
            {segments.map((s, idx) => (
              <div key={s.id} className={`group relative p-3 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.06] transition-all flex items-center gap-3`}>
                <div className={`w-1 self-stretch rounded-full ${s.color.split(' ')[1]}`} />
                <div className="flex-grow min-w-0">
                  <div className="text-[10px] font-bold text-white/60 truncate uppercase tracking-tighter">Segment {idx + 1}</div>
                  <div className="text-xs font-mono font-bold">{formatDuration(s.duration)}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveSegment(idx, -1)} className="p-1.5 hover:bg-white/10 rounded-lg"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moveSegment(idx, 1)} className="p-1.5 hover:bg-white/10 rounded-lg"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setSegments(segments.filter(seg => seg.id !== s.id)); seekToVirtualTime(0); }} className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setSegments([{ id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds, color: COLORS[0] }]); seekToVirtualTime(0); }} className="w-full py-3 border border-white/5 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all flex items-center justify-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 opacity-40" /> Reset All
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 bg-white/[0.02] p-6 rounded-3xl border border-white/5 shadow-2xl">
        <div className="flex gap-6 items-center">
          <button 
            onClick={() => {
              if(!videoRef.current) return;
              if(isPlaying) videoRef.current.pause();
              else videoRef.current.play();
              setIsPlaying(!isPlaying);
            }} 
            className="p-6 bg-white text-black hover:bg-gray-200 transition-all active:scale-95 shadow-lg rounded-2xl"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black" />}
          </button>
          
          <div 
            ref={timelineRef} 
            onMouseDown={scrub} 
            onMouseMove={(e) => e.buttons === 1 && scrub(e)} 
            className="flex-grow h-20 bg-white/[0.02] relative overflow-hidden border border-white/10 rounded-2xl cursor-crosshair select-none group/timeline"
          >
            <div className="absolute inset-0 flex">
              {segments.map((s) => (
                <div 
                  key={s.id} 
                  style={{ width: `${(s.duration / totalDuration) * 100}%` }} 
                  className={`h-full border-r border-black/40 relative transition-all ${s.color} group/item`}
                >
                  <span className="absolute top-2 left-2 text-[8px] font-bold text-white/20 uppercase truncate max-w-full px-1">{formatDuration(s.duration)}</span>
                </div>
              ))}
            </div>
            {/* Playhead */}
            <div 
              style={{ left: `${(currentTime / totalDuration) * 100}%` }} 
              className="absolute top-0 bottom-0 w-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-30 pointer-events-none transition-transform" 
            />
          </div>

          <div className="flex gap-2">
            <button onClick={split} className="px-6 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 rounded-xl transition-all">
              <Scissors className="w-3.5 h-3.5" /> SPLIT (S)
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center">
           <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest flex items-center gap-4">
             <span>Sequence Panel</span>
             <div className="w-1 h-1 bg-white/20 rounded-full" />
             <span>Real-time Rendering Enabled</span>
           </div>
           <button 
             onClick={exportVid} 
             disabled={isExporting} 
             className="px-16 py-5 bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-[0.98] transition-all rounded-2xl shadow-xl disabled:opacity-50"
           >
             RENDER FINAL MASTER
           </button>
        </div>
      </div>
    </div>
  );
};

const LibraryCard: React.FC<{ 
  session: any; 
  onDelete: (id: string) => void; 
  onPreview: (s: any) => void; 
  onEdit: (s: any) => void;
  onZip: (s: any) => void;
}> = ({ session, onDelete, onPreview, onEdit, onZip }) => {
  const url = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-4 hover:border-white/10 transition-all group shadow-sm">
      <div 
        className={`bg-black rounded-xl overflow-hidden border border-white/5 cursor-pointer relative ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`}
        onClick={() => onPreview(session)}
      >
        <video src={url} muted className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-opacity" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
           <Play className="fill-white w-8 h-8" />
        </div>
      </div>
      
      <div className="space-y-1">
        <h3 className="font-mono text-xs font-bold truncate text-white/80">{session.id}</h3>
        <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest">
          <span>{new Date(session.createdAtISO).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
          <div className="w-0.5 h-0.5 bg-white/20 rounded-full" />
          <span>{formatDuration(session.durationSeconds)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={() => onEdit(session)} className="py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 hover:bg-white/80 transition-all"><Scissors className="w-3 h-3" /> Edit</button>
        <div className="flex gap-1">
          <button onClick={() => onZip(session)} className="flex-grow py-2 bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"><FileArchive className="w-3 h-3" /> Zip</button>
          <button onClick={() => onDelete(session.id)} className="p-2 border border-red-500/10 text-red-500/40 hover:bg-red-500 hover:text-white transition-all rounded-lg"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
};

export default App;
