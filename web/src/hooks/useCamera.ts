import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "ready" | "denied" | "unavailable" | "error";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Opens the rear camera while `enabled` is true and cleans up afterwards. */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [torch, setTorch] = useState({ supported: false, on: false });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }

    setState("starting");
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then(async (stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
        setTorch({ supported: Boolean(capabilities.torch), on: false });
        setState("ready");
      })
      .catch((error: DOMException) => {
        if (cancelled) return;
        if (error.name === "NotAllowedError" || error.name === "SecurityError") setState("denied");
        else if (error.name === "NotFoundError" || error.name === "OverconstrainedError") setState("unavailable");
        else setState("error");
      });

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setState("idle");
    };
  }, [enabled]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  }, [torch.on]);

  return { videoRef, state, torch, toggleTorch };
}
