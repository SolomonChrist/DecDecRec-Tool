
import { LayoutStyle, QualityConfig } from '../types';

export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenStream: MediaStream | null = null;
  private webcamStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private renderInterval: number | null = null;
  private targetFps: number = 30;
  private currentLayout: LayoutStyle = 'CIRCLE';

  public webcamPos = { x: 85, y: 85 };
  public webcamSize = 240;

  private screenVideo: HTMLVideoElement = document.createElement('video');
  private webcamVideo: HTMLVideoElement = document.createElement('video');

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get canvas context');
    this.ctx = context;
    
    this.canvas.width = 1280;
    this.canvas.height = 720;

    // Standard video element config for streaming
    [this.screenVideo, this.webcamVideo].forEach(v => {
      v.setAttribute('playsinline', '');
      v.setAttribute('autoplay', '');
      v.muted = true;
      // Critical: Prevent browser from pausing video when tab is hidden
      v.onpause = () => v.play().catch(() => {});
    });
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public updateWebcamPos(x: number, y: number) {
    this.webcamPos = { 
      x: Math.max(0, Math.min(100, x)), 
      y: Math.max(0, Math.min(100, y)) 
    };
  }

  async start(
    layout: LayoutStyle,
    quality: QualityConfig,
    useWebcam: boolean,
    webcamId: string,
    micId: string,
    captureSystemAudio: boolean
  ): Promise<void> {
    const width = quality.resolution === '720p' ? 1280 : 1920;
    const height = quality.resolution === '720p' ? 720 : 1080;
    this.targetFps = quality.fps;
    this.currentLayout = layout;

    if (layout === 'SHORTS') {
      this.canvas.width = quality.resolution === '720p' ? 720 : 1080;
      this.canvas.height = quality.resolution === '720p' ? 1280 : 1920;
    } else {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: quality.fps, width, height },
        audio: captureSystemAudio
      });
      
      this.screenVideo.srcObject = this.screenStream;
      await this.screenVideo.play();

      if (useWebcam) {
        this.webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: webcamId ? { exact: webcamId } : undefined, width: 1280, height: 720 },
          audio: false
        });
        this.webcamVideo.srcObject = this.webcamStream;
        await this.webcamVideo.play();
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: micId ? { exact: micId } : undefined }
      });

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(dest);

      if (this.screenStream.getAudioTracks().length > 0) {
        const sysSource = audioCtx.createMediaStreamSource(this.screenStream);
        sysSource.connect(dest);
      }

      this.audioStream = dest.stream;

      const stream = this.canvas.captureStream(quality.fps);
      this.audioStream.getAudioTracks().forEach(track => stream.addTrack(track));

      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.start(100);
      
      // Use setInterval instead of requestAnimationFrame for better background performance
      // browsers throttle background setInterval to 1s, but that's better than 0.
      this.renderInterval = window.setInterval(() => {
        this.drawFrame(this.currentLayout);
      }, 1000 / this.targetFps);

    } catch (err) {
      this.stop();
      throw err;
    }
  }

  private drawCover(img: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    if (img.videoWidth === 0 || img.readyState < 2) return;
    const imgAspect = img.videoWidth / img.videoHeight;
    const targetAspect = w / h;
    
    let sWidth, sHeight, sx, sy;
    
    if (imgAspect > targetAspect) {
      sHeight = img.videoHeight;
      sWidth = img.videoHeight * targetAspect;
      sx = (img.videoWidth - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = img.videoWidth;
      sHeight = img.videoWidth / targetAspect;
      sx = 0;
      sy = (img.videoHeight - sHeight) / 2;
    }
    
    this.ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  }

  private drawFrame(layout: LayoutStyle) {
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (layout === 'CIRCLE') {
      // Screen background
      if (this.screenVideo.readyState >= 2) {
        this.ctx.drawImage(this.screenVideo, 0, 0, this.canvas.width, this.canvas.height);
      }
      
      // Circle overlay
      if (this.webcamStream && this.webcamVideo.readyState >= 2) {
        const cx = (this.webcamPos.x / 100) * this.canvas.width;
        const cy = (this.webcamPos.y / 100) * this.canvas.height;
        const radius = this.webcamSize / 2;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.clip();
        this.drawCover(this.webcamVideo, cx - radius, cy - radius, this.webcamSize, this.webcamSize);
        this.ctx.restore();
        
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
      }
    } else if (layout === 'SHORTS') {
      const h = this.canvas.height;
      const w = this.canvas.width;
      const halfH = h / 2;
      this.drawCover(this.screenVideo, 0, 0, w, halfH);
      if (this.webcamStream) {
        this.drawCover(this.webcamVideo, 0, halfH, w, halfH);
      } else {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, halfH, w, halfH);
      }
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 6;
      this.ctx.strokeRect(0, halfH, w, 0);
    }
  }

  stop(): Blob | null {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.webcamStream?.getTracks().forEach(t => t.stop());
    this.audioStream?.getTracks().forEach(t => t.stop());

    const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: 'video/webm' }) : null;
    this.chunks = [];
    return blob;
  }

  pause() { 
    this.mediaRecorder?.pause(); 
    if (this.renderInterval) clearInterval(this.renderInterval);
  }
  
  resume() { 
    this.mediaRecorder?.resume(); 
    this.renderInterval = window.setInterval(() => this.drawFrame(this.currentLayout), 1000 / this.targetFps);
  }
}
