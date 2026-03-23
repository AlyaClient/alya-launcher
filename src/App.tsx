import { useState, useRef, useEffect } from "preact/hooks";
import { Home, Settings, Play, Square, Copy, Check } from "lucide-preact";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getLaunchArgs, loadSettings, saveSettings, DEFAULT_SETTINGS, getRandomQuote, type LauncherSettings } from "./lib";
import "./App.css";

type Page = "home" | "settings";

interface ConsoleLine {
  text: string;
  type: "info" | "success" | "warn" | "error" | "default";
}

function HomePage({ onLaunch, onStop, launching, launched, keepConsole, lines, onCloseConsole }: {
  onLaunch: () => void;
  onStop: () => void;
  launching: boolean;
  launched: boolean;
  keepConsole: boolean;
  lines: ConsoleLine[];
  onCloseConsole: () => void;
}) {
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCopy = () => {
    navigator.clipboard.writeText(lines.map(line => line.text).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showConsole = keepConsole && lines.length > 0;
  const isRunning = launching && launched;

  return (
    <div class="home-layout">
      <div class="home-dock">
        {isRunning ? (
          <button class="btn-play btn-stop" onClick={onStop}>
            <Square size={16} fill="currentColor" />
            Stop
          </button>
        ) : (
          <button class="btn-play" onClick={onLaunch} disabled={launching}>
            {launching && !launched ? <span class="spinner" /> : <Play size={16} fill="currentColor" />}
            {launching && !launched ? "Launching…" : "Play"}
          </button>
        )}
      </div>

      {showConsole && (
        <div class="console-overlay">
          <div class="console-wrap">
            <div class="console-topbar">
              <span class="console-title">game output</span>
              <div class="console-topbar-actions">
                <button class="console-close" onClick={handleCopy} aria-label="Copy output" title="Copy output">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button class="console-close" onClick={onCloseConsole} aria-label="Close" title="Close">✕</button>
              </div>
            </div>
            <div class="console-body" ref={consoleBodyRef}>
              {lines.map((consoleLine, index) => (
                <div key={index} class={`console-line ${consoleLine.type === "default" ? "" : consoleLine.type}`}>{consoleLine.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPage({ settings, onChange }: {
  settings: LauncherSettings;
  onChange: (updatedSettings: LauncherSettings) => void;
}) {
  const updateSetting = <Key extends keyof LauncherSettings>(key: Key, value: LauncherSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div>
      <div class="page-header">
        <h1>Settings</h1>
        <p>Configure your launcher and game preferences</p>
      </div>

      <div class="settings-sections">
        <div class="settings-group">
          <div class="settings-group-title">Game</div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Java Path</div>
              <div class="settings-row-desc">Path to your Java executable</div>
              <div class="settings-row-desc">It is advised that you use <a href="#" onClick={event => { event.preventDefault(); openUrl("https://www.azul.com/downloads/?version=java-21-lts&architecture=x86-64-bit&package=jdk#zulu"); }}>Java 21 (Zulu JDK)</a></div>
            </div>
            <input
              class="settings-input"
              type="text"
              value={settings.javaPath}
              onInput={event => updateSetting("javaPath", (event.target as HTMLInputElement).value)}
              placeholder="/usr/bin/java"
            />
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Client Directory</div>
              <div class="settings-row-desc">Absolute path to the directory containing Alya Client.</div>
              <div class="settings-row-desc">Download <code>alya-release.zip</code> from <a href="#" onClick={event => { event.preventDefault(); openUrl("https://github.com/AlyaClient/alya/releases"); }}>here</a></div>
            </div>
            <input
              class="settings-input"
              type="text"
              value={settings.workDir}
              onInput={event => updateSetting("workDir", (event.target as HTMLInputElement).value)}
              placeholder="/path/to/alya"
            />
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">Memory</div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Max RAM</div>
              <div class="settings-row-desc">Maximum JVM heap (e.g. 4G, 2048M)</div>
              <div class="settings-row-desc">Note: Minecraft can struggle with more than 4GB of memory</div>
            </div>
            <input
              class="settings-input"
              type="text"
              value={settings.maxRam}
              onInput={event => updateSetting("maxRam", (event.target as HTMLInputElement).value)}
              style={{ width: 100 }}
            />
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">Launcher</div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Keep console open</div>
              <div class="settings-row-desc">Show game output while running</div>
            </div>
            <button
              class={`toggle${settings.keepConsole ? " on" : ""}`}
              onClick={() => updateSetting("keepConsole", !settings.keepConsole)}
              aria-label="Toggle"
            />
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">Danger Zone</div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Reset to defaults</div>
              <div class="settings-row-desc">Restore all settings to their original values</div>
            </div>
            <button class="btn" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [settings, setSettings] = useState<LauncherSettings>(loadSettings);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [quote] = useState<string>(getRandomQuote);

  const handleSettingsChange = (updatedSettings: LauncherSettings) => {
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const pushLine = (text: string, type: ConsoleLine["type"] = "default") => {
    setLines(previousLines => [...previousLines, { text, type }]);
  };

  const handleStop = async () => {
    await invoke("kill_game").catch(() => { });
  };

  const handleLaunch = async () => {
    if (launching) return;
    setLaunching(true);
    setLaunched(false);
    setLines([]);
    if (page !== "home") setPage("home");

    await new Promise(resolve => setTimeout(resolve, 50));

    const { program, args, cwd } = getLaunchArgs(settings);

    pushLine("[alya] Launching Minecraft 1.8.9…", "info");

    try {
      const onOutput = (text: string, type: ConsoleLine["type"]) => { setLaunched(true); pushLine(text, type); };
      const unlistenStdout = await listen<string>("launch-stdout", event => onOutput(event.payload, "default"));
      const unlistenStderr = await listen<string>("launch-stderr", event => onOutput(event.payload, "warn"));

      const exitCode = await invoke<number>("launch", { program, args, cwd });

      unlistenStdout();
      unlistenStderr();

      if (exitCode === 0) {
        pushLine("[alya] Game exited cleanly.", "success");
      } else {
        pushLine(`[alya] Game exited with code ${exitCode}.`, "error");
      }
    } catch (error) {
      pushLine(`[error] ${error}`, "error");
    } finally {
      setLaunching(false);
      setLaunched(false);
    }
  };

  return (
    <div class="app">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <img src="/logo.png" alt="Alya" class="logo-img" />
          <div>
            <div class="logo-text">Alya</div>
            <div class="logo-sub"><i>"{quote}"</i></div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <button class={`nav-item${page === "home" ? " active" : ""}`} onClick={() => setPage("home")}>
            <Home size={16} /> Home
          </button>
        </nav>

        <div class="sidebar-footer">
          <button class={`nav-item${page === "settings" ? " active" : ""}`} onClick={() => setPage("settings")}>
            <Settings size={16} /> Settings
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <span class="topbar-title">{page === "home" ? "Home" : "Settings"}</span>
        </header>

        <div class={`content${page === "settings" ? " scrollable" : ""}`}>
          {page === "home" && (
            <HomePage
              onLaunch={handleLaunch}
              onStop={handleStop}
              launching={launching}
              launched={launched}
              keepConsole={settings.keepConsole}
              lines={lines}
              onCloseConsole={() => setLines([])}
            />
          )}
          {page === "settings" && (
            <SettingsPage settings={settings} onChange={handleSettingsChange} />
          )}
        </div>
      </div>
    </div>
  );
}
