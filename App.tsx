
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

// Added formatDuration and formatSize to top-level so they are accessible to all components in this file.
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
  
  // Permissions state
  const [permissions, setPermissions] = useState<{
    camera: PermissionState | 'unknown';
    microphone: PermissionState | 'unknown';
  }>({ camera: 'unknown', microphone: 'unknown' });

  // Settings / State
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

  // Memoized object URL for the preview modal
  const previewUrl = useMemo(() => {
    if (!previewingSession) return null;
    return URL.createObjectURL(previewingSession.videoBlob);
  }, [previewingSession]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    loadSessions();
    loadDevices();
    updateStorageEstimate();
    checkPermissions();
    const storedSettings = localStorage.getItem('transcriptionSettings');
    if (storedSettings) setTranscriptionSettings(JSON.parse(storedSettings));
  }, []);

  // Sync canvas to DOM for live preview
  useEffect(() => {
    if (isRecording && recorderRef.current && canvasContainerRef.current) {
      const canvas = recorderRef.current.getCanvas();
      canvas.className = "w-full h-full object-contain cursor-move rounded-sm shadow-2xl";
      canvasContainerRef.current.innerHTML = '';
      canvasContainerRef.current.appendChild(canvas);
    }
  }, [isRecording, layout]);

  const checkPermissions = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const cam = await navigator.permissions.query({ name: 'camera' as any });
          const mic = await navigator.permissions.query({ name: 'microphone' as any });
          
          setPermissions({
            camera: cam.state,
            microphone: mic.state
          });

          cam.onchange = () => setPermissions(prev => ({ ...prev, camera: cam.state }));
          mic.onchange = () => setPermissions(prev => ({ ...prev, microphone: mic.state }));
        } catch (e) {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const hasLabels = devs.some(d => !!d.label);
          setPermissions({
            camera: hasLabels ? 'granted' : 'prompt',
            microphone: hasLabels ? 'granted' : 'prompt'
          });
        }
      }
    } catch (e) {
      console.warn("Permissions API not fully supported", e);
    }
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
      
      checkPermissions();
      setPolicyError(null);
    } catch (err: any) {
      console.warn("Permission denied for devices:", err);
      if (err.name === 'SecurityError' || err.message.toLowerCase().includes('permissions policy')) {
        setPolicyError("Access to Camera/Mic is disallowed by your environment's Permissions Policy.");
      }
    }
  };

  const updateStorageEstimate = async () => {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const persistent = await navigator.storage.persisted ? await navigator.storage.persisted() : false;
      setStorage({
        quota: estimate.quota || 0,
        usage: estimate.usage || 0,
        free: (estimate.quota || 0) - (estimate.usage || 0),
        persistent
      });
    }
  };

  const formatTimestamp = () => {
    const now = new Date();
    return `${now.getDate().toString().padStart(2, '0')}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()]}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setPolicyError(null);
    try {
      if (!recorderRef.current) recorderRef.current = new VideoRecorder();
      await recorderRef.current.start(
        layout, 
        quality, 
        useWebcam, 
        webcamId, 
        micId, 
        captureSystemAudio
      );
      
      setIsRecording(true);
      setIsPaused(false);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Recording start error:", err);
      const msg = err.message.toLowerCase();
      if (err.name === 'SecurityError' || msg.includes('permissions policy')) {
        setPolicyError("Screen Recording is disallowed by the Permissions Policy.");
      } else {
        alert("Error: " + err.message);
      }
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    const blob = recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    
    if (blob) {
      const id = formatTimestamp();
      const newSession: RecordingSession = {
        id,
        createdAtISO: new Date().toISOString(),
        durationSeconds: elapsed,
        layoutStyle: layout,
        quality: quality,
        videoBlob: blob,
        videoType: 'webm',
        metadata: { webcamPos: { ...recorderRef.current.webcamPos } }
      };
      await saveSession(newSession);
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

  const handleDownload = (session: RecordingSession) => {
    const url = URL.createObjectURL(session.videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.id}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm("Delete session?")) {
      await deleteSession(id);
      loadSessions();
      updateStorageEstimate();
    }
  };

  const handleClearAll = async () => {
    if (confirm("Delete ALL recorded sessions? This cannot be undone.")) {
      await clearAllSessions();
      loadSessions();
      updateStorageEstimate();
    }
  };

  // Webcam Draggable Logic
  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!isRecording || !recorderRef.current || !isDraggingWebcam.current || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    recorderRef.current.updateWebcamPos(x, y);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-white/20 p-4 sticky top-0 bg-black z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <Monitor className="w-6 h-6" />
            DecDecRec Tool
          </h1>
          <nav className="flex gap-4">
            <button onClick={() => setActiveTab('record')} className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'record' ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
              <Video className="w-4 h-4" /> Record
            </button>
            <button onClick={() => setActiveTab('library')} className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'library' ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
              <Library className="w-4 h-4" /> Library
            </button>
            <button onClick={() => setActiveTab('settings')} className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'settings' ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
              <Settings className="w-4 h-4" /> Settings
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-6xl mx-auto w-full p-6">
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Permission & Status */}
              <section className="border border-white/20 p-4 bg-white/5 space-y-3">
                <div className="flex flex-wrap gap-4 items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status:</span>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    {permissions.camera === 'granted' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                    CAMERA {permissions.camera.toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    {permissions.microphone === 'granted' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                    MIC {permissions.microphone.toUpperCase()}
                  </div>
                  <button onClick={loadDevices} className="ml-auto text-[10px] underline hover:text-white text-white/60">Refresh Devices</button>
                </div>
                {policyError && (
                   <div className="p-3 bg-red-900/20 border border-red-500/50 text-red-200 text-xs flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{policyError} Try opening in a new tab.</p>
                   </div>
                )}
                {isRecording && (
                  <div className="p-3 bg-blue-900/20 border border-blue-500/30 text-blue-100 text-[10px] flex gap-2 items-center italic">
                    <Info className="w-4 h-4 shrink-0 text-blue-400" />
                    <p>Click & drag the webcam circle in the preview to move it.</p>
                  </div>
                )}
              </section>

              {/* Layout Config */}
              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold border-b border-white/10 pb-2">Layout Configuration</h2>
                <div className="flex gap-4">
                  <button onClick={() => setLayout('CIRCLE')} disabled={isRecording} className={`flex-1 p-4 border flex flex-col items-center gap-2 transition-all ${layout === 'CIRCLE' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'} ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Circle className="w-8 h-8" />
                    <span className="text-xs uppercase font-bold">Circle Overlay</span>
                  </button>
                  <button onClick={() => setLayout('SHORTS')} disabled={isRecording} className={`flex-1 p-4 border flex flex-col items-center gap-2 transition-all ${layout === 'SHORTS' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'} ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <RectangleVertical className="w-8 h-8" />
                    <span className="text-xs uppercase font-bold">9:16 Shorts</span>
                  </button>
                </div>
              </section>

              {/* Device Setup */}
              <section className="border border-white/20 p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h2 className="text-lg font-bold">Device Setup</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/80">Webcam</span>
                    <button 
                      onClick={() => setUseWebcam(!useWebcam)}
                      disabled={isRecording}
                      className={`px-3 py-1 text-xs font-bold border transition-colors ${useWebcam ? 'bg-white text-black' : 'border-white/20'} ${isRecording ? 'opacity-50' : ''}`}
                    >
                      {useWebcam ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {useWebcam && (
                    <select 
                      value={webcamId}
                      onChange={(e) => setWebcamId(e.target.value)}
                      disabled={isRecording}
                      className="w-full bg-black border border-white/20 p-2 text-sm text-white focus:border-white outline-none"
                    >
                      {devices.filter(d => d.kind === 'videoinput').length === 0 && (
                        <option value="">No cameras detected</option>
                      )}
                      {devices.filter(d => d.kind === 'videoinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm font-medium text-white/80">Microphone</span>
                  </div>
                  <select 
                    value={micId}
                    onChange={(e) => setMicId(e.target.value)}
                    disabled={isRecording}
                    className="w-full bg-black border border-white/20 p-2 text-sm text-white focus:border-white outline-none"
                  >
                    {devices.filter(d => d.kind === 'audioinput').length === 0 && (
                      <option value="">No microphones detected</option>
                    )}
                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer pt-2 group">
                    <input 
                      type="checkbox" 
                      checked={captureSystemAudio} 
                      disabled={isRecording}
                      onChange={(e) => setCaptureSystemAudio(e.target.checked)}
                      className="accent-white"
                    />
                    <span className="text-xs text-white/60 group-hover:text-white transition-colors">Capture System Audio (if supported)</span>
                  </label>
                </div>
              </section>

              {/* Recording Buttons */}
              {!isRecording ? (
                <button onClick={startRecording} disabled={!!policyError} className={`w-full py-4 font-black text-xl transition-all ${!!policyError ? 'bg-white/10 text-white/20 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200 shadow-xl'}`}>
                  {!!policyError ? 'BLOCKED BY POLICY' : 'START RECORDING'}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button onClick={togglePause} className="flex-1 py-4 border border-white bg-black text-white font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                      {isPaused ? <Play className="fill-white" /> : <Pause className="fill-white" />}
                      {isPaused ? 'RESUME' : 'PAUSE'}
                    </button>
                    <button onClick={stopRecording} className="flex-1 py-4 bg-red-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors">
                      <StopCircle /> STOP
                    </button>
                  </div>
                  <div className="text-center p-2 border border-white/10 bg-white/5">
                    <p className="text-4xl font-mono tabular-nums tracking-tighter">{formatDuration(elapsed)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Panel */}
            <div className="space-y-6">
              <section 
                className={`border border-white/20 flex items-center justify-center relative bg-white/5 overflow-hidden ${layout === 'SHORTS' ? 'aspect-[9/16] max-h-[600px] mx-auto' : 'aspect-video'}`}
                onMouseDown={() => (isDraggingWebcam.current = true)}
                onMouseUp={() => (isDraggingWebcam.current = false)}
                onMouseLeave={() => (isDraggingWebcam.current = false)}
                onMouseMove={handlePreviewMouseMove}
              >
                {isRecording ? (
                  <div ref={canvasContainerRef} className="w-full h-full flex items-center justify-center bg-black select-none pointer-events-none"></div>
                ) : (
                  <div className="text-center text-white/20 flex flex-col items-center p-6">
                    <Monitor className="w-16 h-16 opacity-10 mb-2" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-50">Live Preview</p>
                  </div>
                )}
                {isRecording && <div className="absolute inset-0 z-10 cursor-move opacity-0"></div>}
              </section>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-bold uppercase tracking-tight text-white/80">Library</h2>
              {sessions.length > 0 && (
                <button onClick={handleClearAll} className="text-[10px] font-bold text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors underline uppercase tracking-widest">
                  <Trash2 className="w-3 h-3" /> Clear Library
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="border border-white/10 p-20 text-center text-white/20">
                <Database className="w-16 h-16 mx-auto mb-4 opacity-5" />
                <p className="uppercase tracking-widest text-xs font-bold">Empty Library</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {sessions.map(session => (
                  <LibraryCard 
                    key={session.id} 
                    session={session} 
                    onDownload={handleDownload} 
                    onDelete={handleDeleteSession} 
                    onPreview={setPreviewingSession}
                    onEdit={setEditingSession}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview Modal */}
        {previewingSession && previewUrl && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="max-w-6xl w-full bg-black border border-white/20 flex flex-col max-h-[95vh] shadow-2xl relative">
                <div className="p-4 border-b border-white/20 flex justify-between items-center bg-white/[0.02]">
                   <h3 className="font-mono text-sm font-bold truncate pr-4">{previewingSession.id}</h3>
                   <button onClick={() => setPreviewingSession(null)} className="p-2 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-grow flex items-center justify-center p-4 bg-black overflow-hidden relative">
                   <video src={previewUrl} controls autoPlay className="max-w-full max-h-full" style={{ objectFit: 'contain' }} />
                </div>
             </div>
          </div>
        )}

        {/* Video Editor Modal */}
        {editingSession && (
          <VideoEditor 
            session={editingSession} 
            onClose={() => setEditingSession(null)} 
            onSave={async (newBlob) => {
              const id = `EDITED_${editingSession.id}_${Date.now()}`;
              const newSession: RecordingSession = {
                ...editingSession,
                id,
                videoBlob: newBlob,
                createdAtISO: new Date().toISOString(),
              };
              await saveSession(newSession);
              loadSessions();
              setEditingSession(null);
            }}
          />
        )}
      </main>
    </div>
  );
};

// --- Video Editor Component ---
const VideoEditor: React.FC<{ 
  session: RecordingSession; 
  onClose: () => void; 
  onSave: (blob: Blob) => Promise<void> 
}> = ({ session, onClose, onSave }) => {
  const [segments, setSegments] = useState<VideoSegment[]>([
    { id: '1', start: 0, end: session.durationSeconds, duration: session.durationSeconds }
  ]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Handle 's' key for splitting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        splitSegment();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, segments]);

  const splitSegment = () => {
    let cumulative = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (currentTime > cumulative && currentTime < cumulative + s.duration) {
        const splitAtSourceTime = s.start + (currentTime - cumulative);
        const newSegments = [...segments];
        const firstPart = { ...s, end: splitAtSourceTime, duration: splitAtSourceTime - s.start };
        const secondPart = { id: Math.random().toString(), start: splitAtSourceTime, end: s.end, duration: s.end - splitAtSourceTime };
        newSegments.splice(i, 1, firstPart, secondPart);
        setSegments(newSegments);
        break;
      }
      cumulative += s.duration;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(totalDuration, pos * totalDuration));
    setCurrentTime(newTime);
    updateVideoTime(newTime);
  };

  const updateVideoTime = (time: number) => {
    if (!videoRef.current) return;
    let cumulative = 0;
    for (const seg of segments) {
      if (time >= cumulative && time <= cumulative + seg.duration) {
        const offset = time - cumulative;
        videoRef.current.currentTime = seg.start + offset;
        break;
      }
      cumulative += seg.duration;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || isExporting) return;
    const v = videoRef.current;
    let cumulative = 0;
    
    // Calculate current time in "editor timeline" space
    const currentSegment = segments.find((seg, idx) => {
      const startOfSeg = segments.slice(0, idx).reduce((acc, s) => acc + s.duration, 0);
      const isWithinSource = v.currentTime >= seg.start && v.currentTime <= seg.end;
      if (isWithinSource) {
        cumulative = startOfSeg;
      }
      return isWithinSource;
    });

    if (currentSegment) {
      setCurrentTime(cumulative + (v.currentTime - currentSegment.start));
      
      // If we hit the end of current segment part, jump to next or pause
      if (v.currentTime >= currentSegment.end - 0.1) {
        const idx = segments.indexOf(currentSegment);
        if (idx < segments.length - 1) {
          v.currentTime = segments[idx + 1].start;
        } else if (isPlaying) {
          v.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  const exportVideo = async () => {
    setIsExporting(true);
    setIsPlaying(false);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const video = videoRef.current!;
    
    // Ensure video is loaded
    if (video.videoWidth === 0) {
      await new Promise(r => video.onloadedmetadata = r);
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    
    recorder.start();

    // Iterate segments and "draw" them to the canvas sequentially
    for (const seg of segments) {
      video.currentTime = seg.start;
      await new Promise(r => video.onseeked = r);
      
      const frames = Math.floor(seg.duration * 30);
      for (let i = 0; i < frames; i++) {
        video.currentTime = seg.start + (i / 30);
        // Small wait for browser to render seeked frame
        await new Promise(r => setTimeout(r, 16)); 
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    }

    // Stop and get final blob
    setTimeout(() => {
      recorder.stop();
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        await onSave(blob);
        setIsExporting(false);
      };
    }, 500);
  };

  const handleDragStart = (idx: number) => setDraggedIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    const newSegments = [...segments];
    const item = newSegments.splice(draggedIndex, 1)[0];
    newSegments.splice(idx, 0, item);
    setSegments(newSegments);
    setDraggedIndex(idx);
  };

  const totalEditorDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col p-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-white/60" />
          <h2 className="text-xl font-bold uppercase tracking-tighter">Video Editor: {session.id}</h2>
        </div>
        <div className="flex gap-2">
           <button onClick={onClose} className="p-2 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>
      </div>

      <div className="flex-grow flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Preview Area */}
        <div className="flex-grow bg-white/5 border border-white/10 flex flex-col overflow-hidden relative">
          <div className="flex-grow flex items-center justify-center relative overflow-hidden bg-black">
            <video 
              ref={videoRef} 
              src={videoUrl} 
              onTimeUpdate={handleTimeUpdate}
              className="max-w-full max-h-full block opacity-100"
              style={{ objectFit: 'contain' }}
            />
            {isExporting && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p className="font-bold uppercase tracking-widest text-sm">Rendering Final Video...</p>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-white/[0.02] border-t border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="p-2 bg-white text-black hover:bg-white/80 transition-colors">
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              <div className="font-mono text-sm">
                {formatDuration(currentTime)} / {formatDuration(totalEditorDuration)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-1 rounded">S = SPLIT</span>
              <button 
                onClick={exportVideo} 
                disabled={isExporting}
                className="px-6 py-2 bg-white text-black font-black uppercase tracking-widest hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Final
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Sidebar */}
        <div className="w-full md:w-80 flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Timeline Segments</h3>
          <div className="flex-grow overflow-y-auto space-y-2 pr-2">
            {segments.map((seg, idx) => (
              <div 
                key={seg.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={() => setDraggedIndex(null)}
                className={`p-3 border transition-colors cursor-grab active:cursor-grabbing flex items-center gap-3 ${draggedIndex === idx ? 'opacity-20' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
              >
                <GripHorizontal className="w-4 h-4 text-white/20 shrink-0" />
                <div className="flex-grow overflow-hidden">
                  <p className="text-[10px] font-bold uppercase truncate">Segment {idx + 1}</p>
                  <p className="text-[10px] text-white/40 font-mono">{seg.start.toFixed(1)}s → {seg.end.toFixed(1)}s</p>
                </div>
                <div className="text-xs font-mono font-bold bg-white/10 px-1.5 py-0.5">{seg.duration.toFixed(1)}s</div>
                <button 
                  onClick={() => {
                    if (segments.length > 1) {
                      const ns = [...segments];
                      ns.splice(idx, 1);
                      setSegments(ns);
                    }
                  }}
                  className="p-1 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Timeline Control */}
      <div className="mt-6 space-y-2">
        <div 
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="w-full h-12 bg-white/10 relative cursor-pointer group"
        >
          <div className="absolute inset-0 flex">
            {segments.map((seg, idx) => (
              <div 
                key={seg.id} 
                style={{ width: `${(seg.duration / totalEditorDuration) * 100}%` }}
                className={`h-full border-r border-black/40 relative ${idx % 2 === 0 ? 'bg-white/5' : 'bg-white/[0.08]'}`}
              >
                <div className="absolute top-1 left-1 text-[8px] font-bold text-white/20 uppercase tracking-tighter">Seg {idx + 1}</div>
              </div>
            ))}
          </div>
          <div 
            style={{ left: `${(currentTime / totalEditorDuration) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500"></div>
          </div>
        </div>
        <div className="flex justify-between text-[10px] font-mono text-white/20 uppercase">
          <span>00:00.0</span>
          <span>Timeline Overview ({totalEditorDuration.toFixed(1)}s)</span>
          <span>{formatDuration(totalEditorDuration)}</span>
        </div>
      </div>
    </div>
  );
};

// Helper component to manage object URLs for video cards in the library
const LibraryCard: React.FC<{
  session: RecordingSession;
  onDownload: (s: RecordingSession) => void;
  onDelete: (id: string) => void;
  onPreview: (s: RecordingSession) => void;
  onEdit: (s: RecordingSession) => void;
}> = ({ session, onDownload, onDelete, onPreview, onEdit }) => {
  const videoUrl = useMemo(() => URL.createObjectURL(session.videoBlob), [session.videoBlob]);

  useEffect(() => {
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  return (
    <div className="border border-white/20 p-6 flex flex-col md:flex-row gap-6 items-start hover:border-white/40 transition-colors bg-white/[0.02] group/card">
      <div 
        className={`bg-black w-full md:w-64 flex items-center justify-center relative group cursor-pointer overflow-hidden border border-white/10 shadow-lg ${session.layoutStyle === 'SHORTS' ? 'aspect-[9/16]' : 'aspect-video'}`}
        onClick={() => onPreview(session)}
      >
        <video 
          className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" 
          src={videoUrl} 
          muted
          loop
          onMouseOver={(e) => e.currentTarget.play().catch(() => {})}
          onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play className="w-10 h-10 text-white fill-white/20" />
        </div>
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 font-mono border border-white/10">
          {formatDuration(session.durationSeconds)}
        </span>
      </div>
      <div className="flex-grow space-y-2 w-full">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h3 className="font-mono text-lg font-bold tracking-tight">{session.id}</h3>
            <p className="text-[10px] text-white/40 font-mono uppercase">
              Captured on {new Date(session.createdAtISO).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => onDownload(session)}
              className="p-2 border border-white/20 hover:bg-white hover:text-black transition-all"
              title="Download WebM"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onDelete(session.id)}
              className="p-2 border border-red-600/50 text-red-500 hover:bg-red-600 hover:text-white transition-all"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-white/50 uppercase tracking-widest font-bold pt-2">
            <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-sm"><Monitor className="w-3 h-3" /> {session.layoutStyle}</span>
            <span className="bg-white/5 px-2 py-0.5 rounded-sm">{session.quality.resolution}</span>
            <span className="bg-white/5 px-2 py-0.5 rounded-sm">{session.quality.fps} FPS</span>
        </div>
        <div className="flex gap-2 pt-4">
            <button 
              onClick={() => onEdit(session)}
              className="px-3 py-1.5 border border-white/20 text-xs hover:bg-white hover:text-black hover:border-white transition-colors uppercase font-bold tracking-tighter flex items-center gap-1.5"
            >
              <Scissors className="w-3 h-3" /> Edit Video
            </button>
            <button 
              onClick={() => onPreview(session)}
              className="px-3 py-1.5 border border-white/20 text-xs hover:bg-white/10 flex items-center gap-1 transition-colors uppercase font-bold tracking-tighter"
            >
              <Maximize2 className="w-3 h-3" /> Full View
            </button>
        </div>
      </div>
    </div>
  );
};

export default App;
