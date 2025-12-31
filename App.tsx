
import React, { useState, useEffect, useRef } from 'react';
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
  HelpCircle,
  Key,
  Database,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ExternalLink,
  Info
} from 'lucide-react';
import { RecordingSession, LayoutStyle, QualityConfig, StorageEstimate, TranscriptionSettings } from './types';
import { VideoRecorder } from './services/recorder';
import { getAllSessions, saveSession, deleteSession, clearAllSessions } from './services/db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'library' | 'settings'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  
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

  useEffect(() => {
    loadSessions();
    loadDevices();
    updateStorageEstimate();
    checkPermissions();
    const storedSettings = localStorage.getItem('transcriptionSettings');
    if (storedSettings) setTranscriptionSettings(JSON.parse(storedSettings));
  }, []);

  const checkPermissions = async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // Some browsers don't support 'camera' or 'microphone' strings in query
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
          // Fallback if query fails
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
      // Trigger permission prompt if needed
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

  const requestPersistentStorage = async () => {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      if (granted) {
        updateStorageEstimate();
        alert("Persistent storage granted!");
      } else {
        alert("Persistent storage denied. This is common in some browsers until the site is bookmarked or heavily used.");
      }
    }
  };

  const formatTimestamp = () => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mon = months[now.getMonth()];
    const year = now.getFullYear();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    return `${day}-${mon}-${year}_${hh}-${mm}-${ss}`;
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
      if (err.name === 'SecurityError' || msg.includes('permissions policy') || msg.includes('disallowed')) {
        setPolicyError("Screen Recording (display-capture) is disallowed by the Permissions Policy of this environment.");
      } else {
        alert("Error starting recording: " + err.message);
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
        metadata: {
          webcamPos: recorderRef.current.webcamPos
        }
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
      timerRef.current = window.setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      recorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (confirm("Are you sure you want to delete this session?")) {
      await deleteSession(id);
      loadSessions();
      updateStorageEstimate();
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2) + " GB";
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-white/20 p-4 sticky top-0 bg-black z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            <Monitor className="w-6 h-6" />
            AI SCREEN RECORDER
          </h1>
          <nav className="flex gap-4">
            <button 
              onClick={() => setActiveTab('record')}
              className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'record' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            >
              <Video className="w-4 h-4" /> Record
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'library' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            >
              <Library className="w-4 h-4" /> Library
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`p-2 flex items-center gap-1 text-sm transition-colors ${activeTab === 'settings' ? 'bg-white text-black' : 'hover:bg-white/10'}`}
            >
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
              {/* Permission Dashboard */}
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
                  <button 
                    onClick={loadDevices}
                    className="ml-auto text-[10px] underline hover:text-white text-white/60"
                  >
                    Refresh Devices
                  </button>
                </div>

                {policyError && (
                  <div className="p-3 bg-red-900/20 border border-red-500/50 text-red-200 text-xs flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="space-y-2">
                      <p className="font-bold uppercase tracking-tight">Permissions Policy Blocked</p>
                      <p>{policyError}</p>
                      <p className="text-white/60">This happens when the app is embedded in an iframe (like AI Studio or a sandbox) that hasn't allowed screen sharing. </p>
                      <div className="pt-1">
                        <button 
                          onClick={() => window.open(window.location.href, '_blank')}
                          className="px-2 py-1 bg-white text-black font-bold flex items-center gap-1 hover:bg-gray-200 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> OPEN IN NEW TAB
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold border-b border-white/10 pb-2">Layout Configuration</h2>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setLayout('CIRCLE')}
                    className={`flex-1 p-4 border flex flex-col items-center gap-2 transition-all ${layout === 'CIRCLE' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'}`}
                  >
                    <Circle className="w-8 h-8" />
                    <span className="text-xs uppercase font-bold">Circle Overlay</span>
                  </button>
                  <button 
                    onClick={() => setLayout('SHORTS')}
                    className={`flex-1 p-4 border flex flex-col items-center gap-2 transition-all ${layout === 'SHORTS' ? 'bg-white text-black' : 'border-white/20 hover:bg-white/5'}`}
                  >
                    <RectangleVertical className="w-8 h-8" />
                    <span className="text-xs uppercase font-bold">9:16 Shorts</span>
                  </button>
                </div>
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h2 className="text-lg font-bold">Device Setup</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Webcam</span>
                    <button 
                      onClick={() => setUseWebcam(!useWebcam)}
                      className={`px-3 py-1 text-xs font-bold border transition-colors ${useWebcam ? 'bg-white text-black' : 'border-white/20'}`}
                    >
                      {useWebcam ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {useWebcam && (
                    <select 
                      value={webcamId}
                      onChange={(e) => setWebcamId(e.target.value)}
                      className="w-full bg-black border border-white/20 p-2 text-sm text-white"
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
                    <span className="text-sm font-medium">Microphone</span>
                  </div>
                  <select 
                    value={micId}
                    onChange={(e) => setMicId(e.target.value)}
                    className="w-full bg-black border border-white/20 p-2 text-sm text-white"
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
                      onChange={(e) => setCaptureSystemAudio(e.target.checked)}
                      className="accent-white"
                    />
                    <span className="text-xs text-white/60 group-hover:text-white transition-colors">Capture System Audio (if supported)</span>
                  </label>
                </div>
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <h2 className="text-lg font-bold border-b border-white/10 pb-2">Quality & Output</h2>
                <div className="grid grid-cols-2 gap-4">
                  <select 
                    value={quality.resolution}
                    onChange={(e) => setQuality({...quality, resolution: e.target.value as any})}
                    className="bg-black border border-white/20 p-2 text-sm"
                  >
                    <option value="1080p">1080p</option>
                    <option value="720p">720p</option>
                  </select>
                  <select 
                    value={quality.fps}
                    onChange={(e) => setQuality({...quality, fps: parseInt(e.target.value) as any})}
                    className="bg-black border border-white/20 p-2 text-sm"
                  >
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                  </select>
                </div>
              </section>

              {!isRecording ? (
                <button 
                  onClick={startRecording}
                  disabled={!!policyError}
                  className={`w-full py-4 font-black text-xl transition-all ${!!policyError ? 'bg-white/10 text-white/20 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'}`}
                >
                  {!!policyError ? 'BLOCKED BY POLICY' : 'START RECORDING'}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button 
                      onClick={togglePause}
                      className="flex-1 py-4 border border-white bg-black text-white font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                    >
                      {isPaused ? <Play className="fill-white" /> : <Pause className="fill-white" />}
                      {isPaused ? 'RESUME' : 'PAUSE'}
                    </button>
                    <button 
                      onClick={stopRecording}
                      className="flex-1 py-4 bg-red-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
                    >
                      <StopCircle />
                      STOP
                    </button>
                  </div>
                  <div className="text-center p-2 border border-white/10 bg-white/5">
                    <p className="text-4xl font-mono tabular-nums">{formatDuration(elapsed)}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">Recording in Progress</p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Panel / Storage Info */}
            <div className="space-y-6">
              <section className="border border-white/20 p-6 aspect-video flex items-center justify-center relative bg-white/5 overflow-hidden">
                {!isRecording ? (
                  <div className="text-center text-white/20 flex flex-col items-center">
                    <div className="relative mb-2">
                      <Camera className="w-16 h-16 opacity-10" />
                      {permissions.camera === 'denied' && (
                        <XCircle className="w-6 h-6 text-red-500 absolute -top-1 -right-1" />
                      )}
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest">Ready to Composite</p>
                  </div>
                ) : (
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2 animate-pulse">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                          <span className="font-black text-xl tracking-tighter uppercase italic">Recording</span>
                        </div>
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-[0.2em]">{layout} MODE</span>
                      </div>
                   </div>
                )}
              </section>

              <section className="border border-white/20 p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h2 className="text-lg font-bold">Storage Status</h2>
                  {!storage?.persistent && (
                    <button 
                      onClick={requestPersistentStorage}
                      className="text-[10px] bg-white text-black px-2 py-1 font-bold flex items-center gap-1 hover:bg-gray-200 transition-colors"
                    >
                      <ShieldCheck className="w-3 h-3" /> REQUEST PERSISTENCE
                    </button>
                  )}
                </div>
                {storage && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/50">Used Storage</span>
                      <span>{formatSize(storage.usage)}</span>
                    </div>
                    <div className="w-full bg-white/10 h-1">
                      <div 
                        className="bg-white h-full transition-all duration-700 ease-in-out" 
                        style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-white/40">
                      <span className="flex items-center gap-1">
                        {storage.persistent ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3" />}
                        {storage.persistent ? 'Persistent storage granted' : 'Temporary storage'}
                      </span>
                      <span>Quota: {formatSize(storage.quota)}</span>
                    </div>
                  </div>
                )}
                <div className="p-3 bg-white/5 border border-white/10 flex gap-2">
                   <Info className="w-4 h-4 shrink-0 opacity-40" />
                   <p className="text-[10px] text-white/30 italic leading-normal">
                      Local sessions are saved in IndexedDB. Persistent storage helps prevent your browser from deleting your recordings automatically if space runs low.
                   </p>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold uppercase tracking-tight">Library</h2>
              <button 
                onClick={async () => {
                  if(confirm("Wipe ALL local sessions?")) {
                    await clearAllSessions();
                    loadSessions();
                  }
                }}
                className="text-xs p-2 border border-red-600/50 text-red-400 hover:bg-red-600 hover:text-white transition-colors"
              >
                DELETE ALL SESSIONS
              </button>
            </div>
            
            {sessions.length === 0 ? (
              <div className="border border-white/10 p-20 text-center text-white/20">
                <Database className="w-16 h-16 mx-auto mb-4 opacity-5" />
                <p className="uppercase tracking-widest text-xs font-bold">Your library is currently empty</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {sessions.map(session => (
                  <div key={session.id} className="border border-white/20 p-6 flex flex-col md:flex-row gap-6 items-start hover:border-white/40 transition-colors">
                    <div className="aspect-video bg-white/10 w-full md:w-64 flex items-center justify-center relative group cursor-pointer overflow-hidden border border-white/5">
                      <video 
                        className="w-full h-full object-cover" 
                        src={URL.createObjectURL(session.videoBlob)} 
                        onMouseOver={(e) => e.currentTarget.play()}
                        onMouseOut={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        muted
                        loop
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                         <Play className="w-10 h-10" />
                      </div>
                      <span className="absolute bottom-1 right-1 bg-black text-white text-[10px] px-1 font-mono">
                        {formatDuration(session.durationSeconds)}
                      </span>
                    </div>
                    <div className="flex-grow space-y-2">
                      <div className="flex justify-between items-start">
                        <h3 className="font-mono text-lg font-bold">{session.id}</h3>
                        <div className="flex gap-2">
                          <button 
                            className="p-2 border border-white/20 hover:bg-white hover:text-black transition-colors"
                            title="Download ZIP"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteSession(session.id)}
                            className="p-2 border border-red-600/50 text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs text-white/50 uppercase tracking-widest font-bold">
                         <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {session.layoutStyle}</span>
                         <span>{session.quality.resolution}</span>
                         <span>{session.quality.fps} FPS</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                         <button className="px-3 py-1 border border-white/20 text-xs hover:bg-white/10 flex items-center gap-1 transition-colors">
                            <FileText className="w-3 h-3" /> Transcribe
                         </button>
                         <button className="px-3 py-1 border border-white/20 text-xs hover:bg-white/10 flex items-center gap-1 transition-colors">
                            <Monitor className="w-3 h-3" /> Preview
                         </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-8">
             <section className="space-y-4">
               <h2 className="text-2xl font-bold border-b border-white/20 pb-2">Transcription Settings</h2>
               <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                     <label className="text-xs font-bold uppercase tracking-widest text-white/50">Provider</label>
                     <div className="flex gap-2">
                        {(['OPENAI', 'LOCAL_SERVER', 'CLI_GUIDE'] as const).map(mode => (
                          <button 
                            key={mode}
                            onClick={() => setTranscriptionSettings({...transcriptionSettings, mode})}
                            className={`flex-1 py-2 text-xs border transition-all ${transcriptionSettings.mode === mode ? 'bg-white text-black font-black' : 'border-white/20 hover:bg-white/5'}`}
                          >
                            {mode.replace('_', ' ')}
                          </button>
                        ))}
                     </div>
                  </div>

                  {transcriptionSettings.mode === 'OPENAI' && (
                    <div className="p-4 border border-white/20 bg-white/5 space-y-3">
                       <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
                          <Key className="w-4 h-4 text-white/40" />
                          <span>OpenAI API Key</span>
                       </div>
                       <input 
                         type="password"
                         value={transcriptionSettings.openaiKey || ''}
                         onChange={(e) => setTranscriptionSettings({...transcriptionSettings, openaiKey: e.target.value})}
                         placeholder="sk-..."
                         className="w-full bg-black border border-white/20 p-2 text-sm focus:border-white outline-none transition-colors"
                       />
                       <div className="flex justify-between items-center">
                          <button className="text-[10px] border border-white/20 px-2 py-1 hover:bg-white/10 transition-colors uppercase font-bold">Test Connection</button>
                          <span className="text-[10px] text-white/30 italic">Keys are stored ONLY in your local localStorage.</span>
                       </div>
                    </div>
                  )}

                  {transcriptionSettings.mode === 'LOCAL_SERVER' && (
                    <div className="p-4 border border-white/20 bg-white/5 space-y-3">
                       <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
                          <Database className="w-4 h-4 text-white/40" />
                          <span>Local Server URL</span>
                       </div>
                       <input 
                         type="text"
                         value={transcriptionSettings.localServerUrl}
                         onChange={(e) => setTranscriptionSettings({...transcriptionSettings, localServerUrl: e.target.value})}
                         className="w-full bg-black border border-white/20 p-2 text-sm focus:border-white outline-none transition-colors"
                       />
                       <p className="text-[10px] text-white/40">Default: http://localhost:8765. Requires running the helper server provided in the repo.</p>
                    </div>
                  )}

                  {transcriptionSettings.mode === 'CLI_GUIDE' && (
                    <div className="p-4 border border-white/20 bg-white/5 space-y-3">
                       <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight">
                          <Monitor className="w-4 h-4 text-white/40" /> Manual Transcription Guide
                       </h3>
                       <p className="text-xs text-white/60">Use this for maximum privacy and zero cost.</p>
                       <code className="block bg-black p-3 text-[10px] border border-white/10 leading-relaxed font-mono">
                          pip install openai-whisper<br/>
                          whisper "recording_audio.mp3" --model medium --output_format txt,srt
                       </code>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => {
                      localStorage.setItem('transcriptionSettings', JSON.stringify(transcriptionSettings));
                      alert("Settings saved!");
                    }}
                    className="w-full py-3 bg-white text-black font-bold uppercase tracking-widest text-sm hover:bg-gray-200 transition-colors"
                  >
                    Save Configuration
                  </button>
               </div>
             </section>

             <section className="space-y-4">
                <h2 className="text-2xl font-bold border-b border-white/20 pb-2">About</h2>
                <div className="text-sm space-y-3 text-white/70">
                   <p>A specialized utility for high-quality screen capture and compositing.</p>
                   <p>Built with privacy first: zero tracking, zero cloud storage, zero external dependencies except transcription endpoints.</p>
                   <div className="p-4 bg-white/5 border border-white/10 flex items-start gap-4">
                      <ShieldCheck className="w-6 h-6 shrink-0 text-white/30" />
                      <div className="text-[11px] leading-normal space-y-1">
                         <p className="font-bold text-white/50 uppercase tracking-widest">Local Privacy Protection</p>
                         <p>Recording happens entirely in your browser sandbox. The composited video is generated on your machine and stored in a local database (IndexedDB).</p>
                      </div>
                   </div>
                </div>
             </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/20 p-4 bg-black">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/50">
          <a 
            href="https://solomonchristai.substack.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1"
          >
            AI Brief, AI + Automation News, Updates, Tips/Tricks, Tools <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <span className="hidden md:inline opacity-20">|</span>
          <a 
            href="https://www.solomonchrist.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1"
          >
            Solomon Christ Website <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
