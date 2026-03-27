export const QUOTES = [
  "Five Dabloons",
  "Meow :3",
];

export function getRandomQuote(): string {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

export interface LauncherSettings {
  javaPath: string;
  workDir: string;
  maxRam: string;
  closeOnLaunch: boolean;
  keepConsole: boolean;
}

export const DEFAULT_SETTINGS: LauncherSettings = {
  javaPath: "java",
  workDir: "",
  maxRam: "4G",
  closeOnLaunch: true,
  keepConsole: true,
};

const STORAGE_KEY = "alya_settings";

export function loadSettings(): LauncherSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: LauncherSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getLaunchArgs(settings: LauncherSettings): { program: string; args: string[]; cwd: string } {
  const { javaPath, workDir, maxRam } = settings;
  const classPath = `Alya.jar:libs`;
  return {
    program: javaPath,
    args: [
      `-XX:HeapDumpPath=Alya.heapdump`,
      `-Dminecraft.launcher.brand=minecraft-launcher`,
      `-Dminecraft.launcher.version=3.2.13`,
      `-Dminecraft.client.jar=Alya.jar`,
      `-cp`, classPath,
      `-Xmx${maxRam}`,
      `-XX:+UnlockExperimentalVMOptions`,
      `-XX:+UseG1GC`,
      `-XX:G1NewSizePercent=20`,
      `-XX:G1ReservePercent=20`,
      `-XX:MaxGCPauseMillis=50`,
      `-XX:G1HeapRegionSize=32M`,
      `start.Main`,
      `--gameDir`, `.minecraft`,
      `--assetIndex`, `1.8`,
      `--uuid`, `0`,
      `--userType`, `msa`,
    ],
    cwd: workDir,
  };
}
