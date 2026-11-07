import { useEffect, useState } from "react";
import type { DisplayCurrency, ScanResponse } from "@kort/shared";
import { api, ApiError } from "../api";
import { CameraScanner } from "../components/CameraScanner";
import { Icon } from "../components/Icon";
import { fileToAnalysisImage } from "../lib/image";

type Step =
  | { name: "front" }
  | { name: "back"; front: string }
  | { name: "analyzing"; front: string; back: string | null }
  | { name: "error"; front: string; back: string | null; error: ApiError };

const PROGRESS = [
  "Läser av kortet…",
  "Identifierar spelare och serie…",
  "Bedömer skicket…",
  "Letar efter försäljningar…",
  "Räknar fram värdet…",
];

interface Props {
  currency: DisplayCurrency;
  onResult: (result: ScanResponse, front: string, back: string | null) => void;
  onOpenSettings: () => void;
  needsToken: boolean;
}

export function ScanView({ currency, onResult, onOpenSettings, needsToken }: Props) {
  const [step, setStep] = useState<Step>({ name: "front" });
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (step.name !== "analyzing") return;
    setProgress(0);
    const timer = window.setInterval(() => setProgress((p) => Math.min(p + 1, PROGRESS.length - 1)), 2600);
    return () => window.clearInterval(timer);
  }, [step.name]);

  const analyze = async (front: string, back: string | null) => {
    setStep({ name: "analyzing", front, back });
    try {
      const result = await api.scan(front, back, currency);
      onResult(result, front, back);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError("UNKNOWN", "Något gick fel. Försök igen.", 0);
      setStep({ name: "error", front, back, error: apiError });
    }
  };

  const fromFile = (next: (image: string) => void) => async (file: File) => {
    setUploadError(null);
    try {
      next(await fileToAnalysisImage(file));
    } catch (error) {
      setUploadError((error as Error).message);
    }
  };

  if (step.name === "analyzing") {
    return (
      <div className="analyzing" aria-busy="true">
        <div className="analyzing-card">
          <img src={step.front} alt="Fotograferat kort" />
          <div className="scanline" />
        </div>
        <p className="analyzing-text" aria-live="polite">
          {PROGRESS[progress]}
        </p>
        <p className="muted small">Det kan ta upp till en minut när appen söker efter aktuella försäljningar.</p>
      </div>
    );
  }

  if (step.name === "error") {
    return (
      <div className="panel error-panel" role="alert">
        <Icon name="alert" size={36} />
        <h2>Det gick inte att värdera kortet</h2>
        <p>{step.error.message}</p>
        <div className="button-row">
          {step.error.code === "UNAUTHORIZED" ? (
            <button className="button" type="button" onClick={onOpenSettings}>
              Ange åtkomstnyckel
            </button>
          ) : step.error.code !== "NOT_A_CARD" && step.error.code !== "INVALID_IMAGE" ? (
            <button className="button" type="button" onClick={() => analyze(step.front, step.back)}>
              Försök igen
            </button>
          ) : null}
          <button className="button secondary" type="button" onClick={() => setStep({ name: "front" })}>
            Ta ny bild
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {needsToken && (
        <button className="banner banner-warning" type="button" onClick={onOpenSettings}>
          <Icon name="info" size={18} /> Servern kräver en åtkomstnyckel – tryck här för att ange den.
        </button>
      )}
      {uploadError && (
        <div className="banner banner-error" role="alert">
          {uploadError}
        </div>
      )}
      {step.name === "front" ? (
        <CameraScanner
          key="front"
          title="Fota framsidan"
          hint="Lägg kortet på ett mörkt, plant underlag och fyll ramen. Undvik reflexer."
          onCapture={(front) => setStep({ name: "back", front })}
          onUpload={fromFile((front) => setStep({ name: "back", front }))}
        />
      ) : (
        <CameraScanner
          key="back"
          title="Fota baksidan (valfritt)"
          hint="Baksidan visar ofta kortnummer och år – det ger säkrare identifiering."
          onCapture={(back) => analyze(step.front, back)}
          onUpload={fromFile((back) => analyze(step.front, back))}
          secondary={{ label: "Hoppa över – värdera nu", onClick: () => analyze(step.front, null) }}
        />
      )}
    </>
  );
}
