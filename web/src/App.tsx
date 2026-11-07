import { useCallback, useEffect, useState } from "react";
import type { HealthResponse, ScanResponse } from "@kort/shared";
import { api, ApiError } from "./api";
import { Icon } from "./components/Icon";
import { resizeDataUrl, STORED_MAX_SIDE, THUMB_MAX_SIDE } from "./lib/image";
import { loadSettings, saveSettings } from "./lib/settings";
import { deleteCard, putCard } from "./lib/storage";
import type { CardEntry, Settings } from "./types";
import { CollectionView } from "./views/CollectionView";
import { ResultView } from "./views/ResultView";
import { ScanView } from "./views/ScanView";
import { SettingsView } from "./views/SettingsView";

type View =
  | { name: "scan"; key: number }
  | { name: "result"; entry: CardEntry; from: "scan" | "collection" }
  | { name: "collection" }
  | { name: "settings" };

type Tab = "scan" | "collection" | "settings";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "scan", label: "Skanna", icon: "scan" },
  { id: "collection", label: "Samling", icon: "cards" },
  { id: "settings", label: "Inställningar", icon: "settings" },
];

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [view, setView] = useState<View>({ name: "scan", key: 0 });
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setHealth(h);
        setHealthError(null);
      })
      .catch((e) => setHealthError(e instanceof ApiError ? e.message : "Servern svarar inte."));
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const activeTab: Tab =
    view.name === "result" ? (view.from === "collection" ? "collection" : "scan") : view.name;

  const goTo = (tab: Tab) => {
    if (tab === "scan") setView({ name: "scan", key: Date.now() });
    else if (tab === "collection") setView({ name: "collection" });
    else setView({ name: "settings" });
  };

  const handleResult = (result: ScanResponse, front: string, back: string | null) => {
    const now = new Date().toISOString();
    setView({
      name: "result",
      from: "scan",
      entry: {
        id: result.id,
        createdAt: now,
        updatedAt: now,
        image: front,
        backImage: back,
        thumbnail: null,
        identification: result.identification,
        condition: result.condition,
        valuation: result.valuation,
        mode: result.mode,
        saved: false,
      },
    });
  };

  const save = useCallback(async (entry: CardEntry) => {
    // Store smaller images so the collection stays light on the phone.
    const [image, backImage, thumbnail] = await Promise.all([
      entry.saved ? entry.image : resizeDataUrl(entry.image, STORED_MAX_SIDE, 0.85),
      entry.backImage && !entry.saved ? resizeDataUrl(entry.backImage, STORED_MAX_SIDE, 0.85) : entry.backImage,
      entry.thumbnail ?? resizeDataUrl(entry.image, THUMB_MAX_SIDE, 0.8),
    ]);
    const stored: CardEntry = { ...entry, image, backImage, thumbnail, saved: true, updatedAt: new Date().toISOString() };
    await putCard(stored);
    setView((v) => (v.name === "result" ? { ...v, entry: stored } : v));
  }, []);

  const remove = useCallback(async (entry: CardEntry) => {
    await deleteCard(entry.id);
    setView({ name: "collection" });
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <h1>Kortkollen</h1>
        {health?.mode === "demo" && <span className="chip chip-demo">DEMO</span>}
      </header>

      <main className="content">
        {view.name === "scan" && (
          <ScanView
            key={view.key}
            currency={settings.currency}
            onResult={handleResult}
            onOpenSettings={() => goTo("settings")}
            needsToken={Boolean(health?.requiresToken && !settings.accessToken)}
          />
        )}
        {view.name === "result" && (
          <ResultView
            entry={view.entry}
            currency={settings.currency}
            onChange={(entry) => setView({ ...view, entry })}
            onSave={save}
            onDelete={remove}
            onScanNext={() => goTo("scan")}
            onBack={view.from === "collection" ? () => goTo("collection") : undefined}
          />
        )}
        {view.name === "collection" && (
          <CollectionView
            currency={settings.currency}
            onOpen={(entry) => setView({ name: "result", entry, from: "collection" })}
            onScan={() => goTo("scan")}
          />
        )}
        {view.name === "settings" && (
          <SettingsView settings={settings} health={health} healthError={healthError} onChange={updateSettings} />
        )}
      </main>

      <nav className="tabbar" aria-label="Huvudmeny">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => goTo(tab.id)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
