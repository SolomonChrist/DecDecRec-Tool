
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

  public webcamPos = { x: 85, y: 85 }; // In percentage, default bottom right
  public webcamSize = 240; // Default radius-based size for circular overlay

  private screenVideo: HTMLVideoElement = document.createElement('video');
  private webcamVideo: HTMLVideoElement = document.createElement('video');

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    this.ctx = context;
    
    // Initial size
    this.canvas.width = 1280;
    this.canvas.height = 720;

    this.screenVideo.setAttribute('playsinline', '');
    this.webcamVideo.setAttribute('playsinline', '');
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
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
      this.screenVideo.muted = true;
      await this.screenVideo.play();

      if (useWebcam) {
        this.webcamStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: webcamId ? { exact: webcamId } : undefined, width: 1280, height: 720 },
          audio: false
        });
        this.webcamVideo.srcObject = this.webcamStream;
        this.webcamVideo.muted = true;
        await this.webcamVideo.play();
      }

      const audioCtx = new AudioContext();
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

      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      this.mediaRecorder = new MediaRecorder(stream, options);
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.start(100);
      
      const frameDelay = 1000 / quality.fps;
      this.renderInterval = window.setInterval(() => this.drawFrame(layout), frameDelay);
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  /**
   * Helper to draw an image/video to fill a target area while maintaining aspect ratio (CSS 'object-fit: cover' style)
   */
  private drawCover(img: HTMLVideoElement, x: number, y: number, w: number, h: number) {
    if (img.videoWidth === 0) return;
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
      this.ctx.drawImage(this.screenVideo, 0, 0, this.canvas.width, this.canvas.height);
      
      if (this.webcamStream) {
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
      
      // Precise 50/50 split
      const halfH = h / 2;
      
      // Top Half: Screen (Cropped to fit)
      this.drawCover(this.screenVideo, 0, 0, w, halfH);
      
      // Bottom Half: Webcam (Cropped to fit)
      if (this.webcamStream) {
        this.drawCover(this.webcamVideo, 0, halfH, w, halfH);
      } else {
        // Fallback placeholder if webcam disabled
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, halfH, w, halfH);
        this.ctx.fillStyle = '#333';
        this.ctx.textAlign = 'center';
        this.ctx.font = `${w * 0.05}px Arial`;
        this.ctx.fillText('Webcam Disabled', w / 2, halfH + (halfH / 2));
      }

      // Divider Line
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 6;
      this.ctx.beginPath();
      this.ctx.moveTo(0, halfH);
      this.ctx.lineTo(w, halfH);
      this.ctx.stroke();
    }
  }

  stop(): Blob | null {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    if (this.renderInterval) clearInterval(this.renderInterval);
    
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
    // Resume drawing loop (assuming circle layout if undefined, typically state managed in App)
    const frameDelay = 33; 
    this.renderInterval = window.setInterval(() => this.drawFrame('CIRCLE'), frameDelay); 
  }
}
