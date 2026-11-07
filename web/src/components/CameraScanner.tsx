import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { useCamera } from "../hooks/useCamera";
import { fitGuide, viewRectToSource, type Orientation, type Rect } from "../lib/crop";
import { captureRegion } from "../lib/image";
import { assessQuality, type QualityReport } from "../lib/imageQuality";
import { Icon } from "./Icon";

interface Props {
  title: string;
  hint: string;
  onCapture: (dataUrl: string) => void;
  onUpload: (file: File) => void;
  secondary?: { label: string; onClick: () => void };
}

const SAMPLE_WIDTH = 128;

export function CameraScanner({ title, hint, onCapture, onUpload, secondary }: Props) {
  const { videoRef, state, torch, toggleTorch } = useCamera(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [flash, setFlash] = useState(false);

  const guide: Rect = fitGuide(view.width, view.height, orientation);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setView({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sourceRect = (): Rect | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !view.width) return null;
    return viewRectToSource(guide, view.width, view.height, video.videoWidth, video.videoHeight);
  };

  // Live quality feedback on a downscaled copy of the area inside the guide.
  useEffect(() => {
    if (state !== "ready") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const rect = sourceRect();
      if (!ctx || !video || !rect || rect.width < 10 || rect.height < 10) return;
      canvas.width = SAMPLE_WIDTH;
      canvas.height = Math.round((SAMPLE_WIDTH * rect.height) / rect.width);
      ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setQuality(assessQuality(data, canvas.width, canvas.height));
    }, 350);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, view.width, view.height, orientation]);

  const capture = () => {
    const video = videoRef.current;
    const rect = sourceRect();
    if (!video || !rect) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    onCapture(captureRegion(video, rect));
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  };

  const cameraProblem =
    state === "denied"
      ? "Kameran är blockerad. Tillåt kameraåtkomst för sidan i webbläsarens inställningar – eller välj en bild nedan."
      : state === "unavailable"
        ? "Ingen kamera hittades (kameran kräver HTTPS). Välj en bild från telefonen i stället."
        : state === "error"
          ? "Kameran kunde inte startas. Stäng andra appar som använder kameran eller välj en bild."
          : null;

  return (
    <div className="scanner">
      <div className="scanner-head">
        <h2>{title}</h2>
        <p className="muted">{hint}</p>
      </div>

      <div className="viewfinder" ref={containerRef} data-state={state}>
        <video ref={videoRef} playsInline muted autoPlay aria-label="Kamerabild" />
        {cameraProblem ? (
          <div className="viewfinder-message" role="alert">
            <Icon name="camera-off" size={40} />
            <p>{cameraProblem}</p>
          </div>
        ) : (
          <>
            <div
              className={`guide guide-${quality?.verdict ?? "idle"}`}
              style={{ left: guide.x, top: guide.y, width: guide.width, height: guide.height }}
            >
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
            </div>
            <div className={`quality-pill quality-${quality?.verdict ?? "idle"}`} aria-live="polite">
              {state === "starting" ? "Startar kameran…" : (quality?.message ?? "Placera kortet inom ramen")}
            </div>
          </>
        )}
        {flash && <div className="flash" />}
      </div>

      <div className="scanner-controls">
        <button className="round-button" type="button" onClick={() => fileRef.current?.click()} aria-label="Välj bild från galleriet">
          <Icon name="image" />
          <span>Välj bild</span>
        </button>

        <button
          className={`shutter ${quality?.verdict === "ok" ? "shutter-ready" : ""}`}
          type="button"
          onClick={capture}
          disabled={state !== "ready"}
          aria-label="Ta bild"
        >
          <span />
        </button>

        <div className="scanner-side">
          {torch.supported ? (
            <button className={`round-button ${torch.on ? "active" : ""}`} type="button" onClick={toggleTorch} aria-label="Ficklampa">
              <Icon name="flash" />
              <span>Lampa</span>
            </button>
          ) : (
            <button
              className="round-button"
              type="button"
              onClick={() => setOrientation((o) => (o === "portrait" ? "landscape" : "portrait"))}
              aria-label="Vrid ramen"
            >
              <Icon name="rotate" />
              <span>{orientation === "portrait" ? "Liggande" : "Stående"}</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} data-testid="file-input" />
      </div>

      {(secondary || torch.supported) && (
        <div className="scanner-extra">
          {torch.supported && (
            <button className="link-button" type="button" onClick={() => setOrientation((o) => (o === "portrait" ? "landscape" : "portrait"))}>
              <Icon name="rotate" size={16} /> {orientation === "portrait" ? "Liggande kort" : "Stående kort"}
            </button>
          )}
          {secondary && (
            <button className="button secondary" type="button" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
