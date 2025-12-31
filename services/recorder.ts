
import { LayoutStyle, QualityConfig } from '../types';

export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenStream: MediaStream | null = null;
  private webcamStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private animationFrameId: number | null = null;

  public webcamPos = { x: 50, y: 50 }; // In percentage
  public webcamSize = 150; // In pixels

  private screenVideo: HTMLVideoElement = document.createElement('video');
  private webcamVideo: HTMLVideoElement = document.createElement('video');

  constructor() {
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    this.ctx = context;
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

    // Adjust for vertical Shorts
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
          video: { deviceId: webcamId ? { exact: webcamId } : undefined, width: 640, height: 480 },
          audio: false
        });
        this.webcamVideo.srcObject = this.webcamStream;
        this.webcamVideo.muted = true;
        await this.webcamVideo.play();
      }

      // Audio Mixing
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
      this.renderLoop(layout);
    } catch (err) {
      this.stop();
      throw err;
    }
  }

  private renderLoop(layout: LayoutStyle) {
    const draw = () => {
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      if (layout === 'CIRCLE') {
        // Draw screen full
        this.ctx.drawImage(this.screenVideo, 0, 0, this.canvas.width, this.canvas.height);
        
        if (this.webcamStream) {
          const cx = (this.webcamPos.x / 100) * this.canvas.width;
          const cy = (this.webcamPos.y / 100) * this.canvas.height;
          const radius = this.webcamSize / 2;

          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          this.ctx.clip();
          this.ctx.drawImage(
            this.webcamVideo,
            cx - radius,
            cy - radius,
            this.webcamSize,
            this.webcamSize
          );
          this.ctx.restore();
          
          this.ctx.strokeStyle = 'white';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }
      } else if (layout === 'SHORTS') {
        const h = this.canvas.height;
        const w = this.canvas.width;
        
        // Screen on Top (top 60%)
        const screenH = h * 0.6;
        this.ctx.drawImage(this.screenVideo, 0, 0, w, screenH);
        
        // Webcam on Bottom (bottom 40%)
        if (this.webcamStream) {
          this.ctx.drawImage(this.webcamVideo, 0, screenH, w, h - screenH);
        }

        // Divider
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, screenH);
        this.ctx.lineTo(w, screenH);
        this.ctx.stroke();
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };
    draw();
  }

  stop(): Blob | null {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.webcamStream?.getTracks().forEach(t => t.stop());
    this.audioStream?.getTracks().forEach(t => t.stop());

    return new Blob(this.chunks, { type: 'video/webm' });
  }

  pause() { this.mediaRecorder?.pause(); }
  resume() { this.mediaRecorder?.resume(); }
}
