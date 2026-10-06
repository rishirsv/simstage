import { useEffect, useRef, useState } from "react";
import { Camera, Circle, LoaderCircle, Minus, Plus, Square } from "lucide-react";
import { Button } from "./ui/button.js";
import { Separator } from "./ui/separator.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js";
import type { ViewerState } from "../viewer-controller.js";
import { MAX_ZOOM, MIN_ZOOM, stepScreenZoom } from "../screen-zoom.js";

function displayedScreen() {
  const video = document.getElementById("screen-video") as HTMLCanvasElement | null;
  const image = document.getElementById("screen") as HTMLImageElement | null;
  if (video && !video.hidden && video.width && video.height) return { source: video, width: video.width, height: video.height };
  if (image?.complete && image.naturalWidth) return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  throw new Error("The screen is not ready. Wait for the device image, then try again.");
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Downloads consume the URL asynchronously in embedded hosts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function fileName(device: string, extension: string) {
  return `${device.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

function MediaButton({ label, disabled, pressed, onClick, children }: { label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export function ScreenToolbar({ state, scale, fit, onZoom }: { state: ViewerState; scale: number; fit: boolean; onZoom: (scale: number | "fit") => void }) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const ready = Boolean(state.session && (state.capture || state.videoReady) && !state.ended);
  const canRecord = ready && state.liveEnabled && state.videoReady;

  // Decoder restarts during zoom and rotation must not end an active recording.
  useEffect(() => { if (!state.liveEnabled || state.ended || !state.session) stop(); }, [state.liveEnabled, state.ended, state.session?.id]);
  useEffect(() => () => stop(), [state.session?.id]);

  async function screenshot() {
    setError("");
    setSaving(true);
    try {
      const { source, width, height } = displayedScreen();
      const output = document.createElement("canvas");
      output.width = width;
      output.height = height;
      const context = output.getContext("2d");
      if (!context) throw new Error("Screenshot capture is unavailable in this viewer.");
      context.drawImage(source, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not save the screenshot. Try again.");
      saveBlob(blob, fileName(state.session!.device.name, "png"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }

  function record() {
    if (recording) { stop(); return; }
    setError("");
    let stream: MediaStream | undefined;
    let animation = 0;
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("Video recording is unavailable in this host. Open the local viewer in a browser that supports MediaRecorder.");
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This viewer has no supported video recording format.");
      const first = displayedScreen();
      const output = document.createElement("canvas");
      output.width = first.width;
      output.height = first.height;
      const context = output.getContext("2d");
      if (!context || !output.captureStream) throw new Error("Video recording is unavailable in this viewer.");
      // Keep the recording dimensions fixed across device rotation and video retries.
      function draw() {
        const frame = displayedScreen();
        const ratio = Math.min(output.width / frame.width, output.height / frame.height);
        const width = frame.width * ratio, height = frame.height * ratio;
        context!.fillStyle = "#000";
        context!.fillRect(0, 0, output.width, output.height);
        context!.drawImage(frame.source, (output.width - width) / 2, (output.height - height) / 2, width, height);
      }
      draw();
      stream = output.captureStream(30);
      const media = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      const name = fileName(state.session!.device.name, mimeType.startsWith("video/mp4") ? "mp4" : "webm");
      const release = () => { cancelAnimationFrame(animation); stream?.getTracks().forEach(track => track.stop()); };
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onerror = () => { setError("Recording stopped unexpectedly. Any recorded video will be saved; try recording again."); stop(); release(); };
      media.onstop = () => {
        release();
        if (recorder.current === media) recorder.current = null;
        setRecording(false);
        if (chunks.length) saveBlob(new Blob(chunks, { type: media.mimeType }), name);
        else setError("No video was recorded. Resume the live screen and try again.");
      };
      recorder.current = media;
      media.start(1000);
      setRecording(true);
      const tick = () => {
        try { draw(); animation = requestAnimationFrame(tick); }
        catch { setError("The screen became unavailable. Your recording will be saved."); stop(); }
      };
      animation = requestAnimationFrame(tick);
    } catch (cause) {
      cancelAnimationFrame(animation);
      stream?.getTracks().forEach(track => track.stop());
      recorder.current = null;
      setRecording(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <div className="screen-tools">
    <nav className="screen-toolbar" aria-label="Screen capture and zoom">
      <MediaButton label="Save screenshot" disabled={!ready || saving} onClick={() => void screenshot()}>{saving ? <LoaderCircle className="animate-spin" /> : <Camera />}</MediaButton>
      <MediaButton label={recording ? "Stop recording and save video" : "Record video"} pressed={recording} disabled={!recording && !canRecord} onClick={record}>{recording ? <Square className="record-active" fill="currentColor" /> : <Circle />}</MediaButton>
      <Separator orientation="vertical" />
      <Button variant="ghost" size="sm" aria-pressed={fit} onClick={() => onZoom("fit")}>Fit</Button>
      <Button variant="ghost" size="sm" aria-label="Actual size, 100 percent" aria-pressed={!fit && scale === 1} onClick={() => onZoom(1)}>100%</Button>
      <MediaButton label="Zoom out" disabled={scale <= MIN_ZOOM} onClick={() => onZoom(stepScreenZoom(scale, -1))}><Minus /></MediaButton>
      <MediaButton label="Zoom in" disabled={scale >= MAX_ZOOM} onClick={() => onZoom(stepScreenZoom(scale, 1))}><Plus /></MediaButton>
    </nav>
    {error && <p className="screen-tools-error" role="alert">{error}</p>}
    {recording && <span className="sr-only" role="status">Recording video. Stop recording to save it.</span>}
  </div>;
}
