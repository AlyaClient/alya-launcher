import { useState, useRef, useEffect } from "preact/hooks";
import { Home, Settings, Play, Square, Copy, Check, Download } from "lucide-preact";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getLaunchArgs, loadSettings, saveSettings, DEFAULT_SETTINGS, getRandomQuote, type LauncherSettings } from "./lib";
import "./App.css";

type Page = "home" | "settings";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  target_commitish: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

const SEEN_RELEASE_STORAGE_KEY = "alya_seen_release_tag";

function renderReleaseBody(body: string) {
  const lines = body
    .split("\n")
    .filter(line => !/always points to/i.test(line))
    .filter(line => !/^\*\*Full Changelog\*\*/i.test(line.trim()))
    .filter(line => !/^current commit/i.test(line.trim()))
    .filter(line => !line.trimStart().startsWith("# "));

  return lines.map((line, index) => {
    if (line.startsWith("## ")) {
      return <div key={index} class="changelog-body-section-title">{line.slice(3)}</div>;
    }
    if (line.startsWith("### ")) {
      return <div key={index} class="changelog-body-subsection-title">{line.slice(4)}</div>;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <div key={index} class="changelog-body-bullet">· {line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1")}</div>;
    }
    if (line.trim() === "") {
      return <div key={index} class="changelog-body-gap" />;
    }
    return <div key={index} class="changelog-body-line">{line.replace(/\*\*(.*?)\*\*/g, "$1")}</div>;
  });
}


interface LauncherStats {
  times_launched: number;
  total_playtime_seconds: number;
}

const GITHUB_URL = "https://github.com/AlyaClient/alya";
const DISCORD_URL = "https://discord.gg/J3XUnGaZjQ";
const WEBSITE_URL = "https://alya.thoq.dev";

function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

interface ConsoleLine {
  text: string;
  type: "info" | "success" | "warn" | "error" | "default";
}

function HomePage({ onLaunch, onStop, launching, launched, keepConsole, lines, onCloseConsole, stats }: {
  onLaunch: () => void;
  onStop: () => void;
  launching: boolean;
  launched: boolean;
  keepConsole: boolean;
  lines: ConsoleLine[];
  onCloseConsole: () => void;
  stats: LauncherStats;
}) {
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [seenReleaseTag, setSeenReleaseTag] = useState<string | null>(() =>
    localStorage.getItem(SEEN_RELEASE_STORAGE_KEY)
  );
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    fetch("https://api.github.com/repos/AlyaClient/alya/releases/latest")
      .then(response => response.json())
      .then((data: GitHubRelease) => setRelease(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (consoleBodyRef.current) {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCopy = () => {
    navigator.clipboard.writeText(lines.map(line => line.text).join("\n")).then();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const acknowledgeRelease = () => {
    if (!release) return;
    localStorage.setItem(SEEN_RELEASE_STORAGE_KEY, release.tag_name);
    setSeenReleaseTag(release.tag_name);
  };

  const showConsole = keepConsole && lines.length > 0;
  const isRunning = launching && launched;

  const isUpToDate = release ? release.tag_name === seenReleaseTag : true;
  const displayTag = release
    ? (/^[0-9a-f]{10,}$/i.test(release.tag_name) ? release.tag_name.slice(0, 7) : release.tag_name)
    : null;
  const downloadAsset = release?.assets.find(asset => asset.name.endsWith(".zip")) ?? release?.assets[0] ?? null;

  return (
    <div class="home-layout">
      {showChangelog && release && (
        <div class="changelog-modal-backdrop" onClick={() => setShowChangelog(false)}>
          <div class="changelog-modal" onClick={event => event.stopPropagation()}>
            <div class="changelog-modal-header">
              <div class="changelog-modal-title-block">
                <div class="changelog-modal-title">{release.name || displayTag}</div>
                <span class="changelog-version-badge">{displayTag}</span>
              </div>
              <button class="changelog-modal-close" onClick={() => { acknowledgeRelease(); setShowChangelog(false); }}>✕</button>
            </div>
            <div class="changelog-modal-body">
              {renderReleaseBody(release.body ?? "")}
            </div>
            <div class="changelog-modal-footer">
              {downloadAsset ? (
                <button class="changelog-download-btn" onClick={() => openUrl(downloadAsset.browser_download_url)}>
                  <Download size={13} /> Download
                </button>
              ) : (
                <button class="changelog-download-btn" onClick={() => openUrl(release.html_url)}>
                  <Download size={13} /> View on GitHub
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div class="home-dock">
        <div class="dock-side dock-left">
          <div class="dock-stats">
            <span class="dock-stat-value">{stats.times_launched}</span>
            <span class="dock-stat-label">launches</span>
            <span class="dock-stat-sep">·</span>
            <span class="dock-stat-value">{formatPlaytime(stats.total_playtime_seconds)}</span>
            <span class="dock-stat-label">played</span>
          </div>
          <div class="dock-links">
            <button class="dock-link-btn" onClick={() => openUrl(GITHUB_URL)}>GitHub</button>
            <button class="dock-link-btn" onClick={() => openUrl(DISCORD_URL)}>Discord</button>
            <button class="dock-link-btn" onClick={() => openUrl(WEBSITE_URL)}>Website</button>
          </div>
        </div>

        <div class="dock-center">
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

        <div class="dock-side dock-right">
          {release && (
            <>
              <div class="dock-status">
                <div class={`dock-status-dot ${isUpToDate ? "dock-dot-green" : "dock-dot-orange"}`} />
                <span class="dock-status-label">{isUpToDate ? "Up to date" : "Update available"}</span>
              </div>
              <button class="dock-version-btn" onClick={() => setShowChangelog(true)}>
                {displayTag} · Release notes
              </button>
            </>
          )}
        </div>
      </div>
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
              <div class="settings-row-desc">It is advised that you use <a href="#" onClick={event => { event.preventDefault(); openUrl("https://www.azul.com/downloads/?version=java-25-lts&architecture=x86-64-bit&package=jdk#zulu").then(); }}>Java 25 (Zulu JDK)</a></div>
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
              <div class="settings-row-desc">Download <code>alya-release.zip</code> from <a href="#" onClick={event => { event.preventDefault(); openUrl("https://alya.thoq.dev").then(); }}>here</a></div>
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
  const [stats, setStats] = useState<LauncherStats>({ times_launched: 0, total_playtime_seconds: 0 });
  const statsRef = useRef<LauncherStats>({ times_launched: 0, total_playtime_seconds: 0 });
  const launchStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    invoke<LauncherStats>("read_stats").then(loaded => {
      statsRef.current = loaded;
      setStats(loaded);
    }).catch(() => {});
  }, []);

  const persistStats = (updated: LauncherStats) => {
    statsRef.current = updated;
    setStats(updated);
    invoke("write_stats", { stats: updated }).catch(() => {});
  };

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

    persistStats({ ...statsRef.current, times_launched: statsRef.current.times_launched + 1 });
    launchStartTimeRef.current = Date.now();

    await new Promise(resolve => setTimeout(resolve, 50));

    const { program, args, cwd } = getLaunchArgs(settings, navigator.userAgent.includes("Mac"));

    pushLine("[alya] Launching Minecraft 1.8.9…", "info");

    try {
      const onOutput = (text: string, type: ConsoleLine["type"]) => { setLaunched(true); pushLine(text, type); };
      const unlistenStdout = await listen<string>("launch-stdout", event => onOutput(event.payload, "default"));
      const unlistenStderr = await listen<string>("launch-stderr", event => onOutput(event.payload, "warn"));

      setLaunched(true);
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
      if (launchStartTimeRef.current !== null) {
        const elapsedSeconds = Math.floor((Date.now() - launchStartTimeRef.current) / 1000);
        persistStats({ ...statsRef.current, total_playtime_seconds: statsRef.current.total_playtime_seconds + elapsedSeconds });
        launchStartTimeRef.current = null;
      }
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
              stats={stats}
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
