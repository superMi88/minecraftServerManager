import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import unzipper from 'unzipper';
import { GameServerHandler, StartResult } from './base';
import { prisma } from '../db';

interface ArkConfig {
  id: string;
  name: string;
  port: number;
  queryPort?: number | null;
  rconPort?: number | null;
  maxPlayers?: number | null;
  map?: string | null;
  serverPassword?: string | null;
  adminPassword?: string | null;
  installed: boolean;
  gameUserSettings?: string | null;
}

export class ArkHandler implements GameServerHandler {
  async preStart(folderPath: string, config: Record<string, unknown>): Promise<void> {
    const cfg = config as unknown as ArkConfig;
    // Ensure ini folders exist and sync configs if any
    const iniDir = path.join(folderPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer');
    if (!fs.existsSync(iniDir)) {
      fs.mkdirSync(iniDir, { recursive: true });
    }

    const gusPath = path.join(iniDir, 'GameUserSettings.ini');
    if (!fs.existsSync(gusPath)) {
      const initialGUS = cfg.gameUserSettings || this.getDefaultGameUserSettings(cfg);
      fs.writeFileSync(gusPath, initialGUS);
    }
  }

  async getStartCommand(folderPath: string, config: Record<string, unknown>): Promise<StartResult> {
    const cfg = config as unknown as ArkConfig;
    if (!cfg.installed) {
      return { success: false, message: 'Server ist nicht installiert. Bitte führe zuerst die Installation/das Update durch.' };
    }

    const isWindows = process.platform === 'win32';
    const exePath = isWindows
      ? path.join(folderPath, 'ShooterGame', 'Binaries', 'Win64', 'ArkAscendedServer.exe')
      : path.join(folderPath, 'ShooterGame', 'Binaries', 'Linux', 'ArkAscendedServer');

    if (!fs.existsSync(exePath)) {
      return { success: false, message: `Executable nicht gefunden unter ${exePath}. Bitte installiere den Server neu.` };
    }

    // Command line args structure for Ark: Survival Ascended
    const map = cfg.map || 'TheIsland_WP';
    const serverName = cfg.name;
    const port = cfg.port || 7777;
    const queryPort = cfg.queryPort || 27015;
    const maxPlayers = cfg.maxPlayers || 20;
    const adminPassword = cfg.adminPassword || 'adminpass';
    const serverPassword = cfg.serverPassword;

    let listenOptions = `${map}?listen?SessionName=${serverName}?Port=${port}?QueryPort=${queryPort}?ServerAdminPassword=${adminPassword}?MaxPlayers=${maxPlayers}`;
    if (serverPassword) {
      listenOptions += `?ServerPassword=${serverPassword}`;
    }

    const args = [
      listenOptions,
      '-server',
      '-log',
      '-NoBattlEye',
    ];

    return {
      success: true,
      command: exePath,
      args,
      options: {
        cwd: path.dirname(exePath),
        env: process.env,
        shell: true,
      }
    };
  }

  async stop(serverProcess: ChildProcess, _folderPath: string): Promise<{ success: boolean; message?: string }> {
    void _folderPath;
    // Ark dedicated server doesn't respond to standard stdin command for stopping cleanly.
    // Usually it requires RCON "saveworld" followed by "quit", or a graceful process termination.
    // Since we don't have RCON fully configured, we will attempt to terminate/kill it gracefully.
    try {
      if (serverProcess.pid) {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
          spawn('taskkill', ['/PID', serverProcess.pid.toString(), '/T', '/F']);
        } else {
          serverProcess.kill('SIGTERM');
        }
        return { success: true };
      }
      return { success: false, message: 'Keine PID für den Serverprozess gefunden.' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async sendCommand(_serverProcess: ChildProcess, _command: string): Promise<{ success: boolean; message?: string }> {
    void _serverProcess;
    void _command;
    // ASA does not read console stdin. It requires RCON commands.
    return { success: false, message: 'Befehle direkt über die Konsole werden für Ark nicht unterstützt. Nutze RCON.' };
  }

  async getProperties(folderPath: string, config: Record<string, unknown>): Promise<string> {
    const cfg = config as unknown as ArkConfig;
    const iniPath = this.getGameUserSettingsPath(folderPath);
    if (!fs.existsSync(iniPath)) {
      return cfg.gameUserSettings || this.getDefaultGameUserSettings(cfg);
    }
    return fs.readFileSync(iniPath, 'utf-8');
  }

  async saveProperties(folderPath: string, content: string, config: Record<string, unknown>): Promise<void> {
    const cfg = config as unknown as ArkConfig;
    const iniPath = this.getGameUserSettingsPath(folderPath);
    fs.mkdirSync(path.dirname(iniPath), { recursive: true });
    fs.writeFileSync(iniPath, content);

    // Sync DB cache
    await prisma.arkServer.update({
      where: { id: cfg.id },
      data: { gameUserSettings: content },
    });
  }

  // SteamCMD download and server installation logic
  async install(folderPath: string, logCallback: (data: string) => void): Promise<{ success: boolean; message: string }> {
    const isWindows = process.platform === 'win32';
    const steamcmdDir = path.join(process.cwd(), 'steamcmd');
    const steamcmdExe = isWindows
      ? path.join(steamcmdDir, 'steamcmd.exe')
      : path.join(steamcmdDir, 'steamcmd.sh');

    if (!fs.existsSync(steamcmdExe)) {
      logCallback('[System] SteamCMD nicht gefunden. Lade SteamCMD herunter...\n');
      fs.mkdirSync(steamcmdDir, { recursive: true });

      if (isWindows) {
        const zipPath = path.join(steamcmdDir, 'steamcmd.zip');
        const downloadUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';

        try {
          await this.downloadFile(downloadUrl, zipPath);
          logCallback('[System] SteamCMD heruntergeladen. Entpacke ZIP...\n');
          
          await fs.createReadStream(zipPath)
            .pipe(unzipper.Extract({ path: steamcmdDir }))
            .promise();
          
          fs.unlinkSync(zipPath);
          logCallback('[System] SteamCMD erfolgreich eingerichtet.\n');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logCallback(`[ERROR] Fehler beim Einrichten von SteamCMD: ${msg}\n`);
          return { success: false, message: `SteamCMD setup failed: ${msg}` };
        }
      } else {
        const tarPath = path.join(steamcmdDir, 'steamcmd_linux.tar.gz');
        const downloadUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';

        try {
          await this.downloadFile(downloadUrl, tarPath);
          logCallback('[System] SteamCMD (Linux) heruntergeladen. Entpacke TAR.GZ...\n');
          
          // Spawn tar to extract
          await new Promise<void>((resolvePromise, rejectPromise) => {
            const tarProcess = spawn('tar', ['-xzf', tarPath, '-C', steamcmdDir]);
            tarProcess.on('close', (code) => {
              if (code === 0) {
                resolvePromise();
              } else {
                rejectPromise(new Error(`tar process exited with code ${code}`));
              }
            });
            tarProcess.on('error', (err) => {
              rejectPromise(err);
            });
          });
          
          fs.unlinkSync(tarPath);
          
          // Ensure executable permissions on steamcmd.sh and steamcmd binary
          try {
            fs.chmodSync(steamcmdExe, '755');
            const binaryPath = path.join(steamcmdDir, 'linux32', 'steamcmd');
            if (fs.existsSync(binaryPath)) {
              fs.chmodSync(binaryPath, '755');
            }
          } catch {}
          
          logCallback('[System] SteamCMD erfolgreich eingerichtet.\n');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logCallback(`[ERROR] Fehler beim Einrichten von SteamCMD: ${msg}\n`);
          return { success: false, message: `SteamCMD setup failed: ${msg}` };
        }
      }
    }

    logCallback(`[System] Starte Installation/Update für Ark: Survival Ascended (App ID: 2430930)...\n`);
    logCallback(`[System] Zielverzeichnis: ${folderPath}\n`);
    logCallback(`[System] Dies kann eine Weile dauern, da der Server sehr groß ist. Bitte warten...\n`);

    return new Promise((resolve) => {
      // Run steamcmd to download / update ASA server (App ID 2430930)
      const steamcmdProcess = spawn(steamcmdExe, [
        '+force_install_dir', folderPath,
        '+login', 'anonymous',
        '+app_update', '2430930', 'validate',
        '+quit'
      ], {
        cwd: steamcmdDir,
        shell: true,
      });

      steamcmdProcess.stdout?.on('data', (data) => {
        logCallback(data.toString());
      });

      steamcmdProcess.stderr?.on('data', (data) => {
        logCallback(`[stderr] ${data.toString()}`);
      });

      steamcmdProcess.on('exit', async (code) => {
        if (code === 0) {
          logCallback(`\n[System] Installation/Update von Ark: Survival Ascended erfolgreich beendet (Code: 0).\n`);
          resolve({ success: true, message: 'Installation abgeschlossen.' });
        } else {
          logCallback(`\n[System] SteamCMD beendet mit Fehlercode: ${code}.\n`);
          resolve({ success: false, message: `SteamCMD beendet mit Fehlercode ${code}.` });
        }
      });
    });
  }

  private getGameUserSettingsPath(folderPath: string): string {
    return path.join(folderPath, 'ShooterGame', 'Saved', 'Config', 'WindowsServer', 'GameUserSettings.ini');
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Server antwortete mit Code ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }

  private getDefaultGameUserSettings(config: ArkConfig): string {
    return `[ServerSettings]
ActiveMods=
DifficultyOffset=1.000000
DifficultyValue=1.000000
SessionName=${config.name}
ServerPassword=${config.serverPassword || ''}
ServerAdminPassword=${config.adminPassword}
MaxPlayers=${config.maxPlayers}
Port=${config.port}
QueryPort=${config.queryPort}
RCONPort=${config.rconPort}
RCONEnabled=True
StructurePreventResourceRadiusMultiplier=1.000000
TamingSpeedMultiplier=1.000000
HarvestAmountMultiplier=1.000000
XPMultiplier=1.000000

[/Script/Engine.GameSession]
MaxPlayers=${config.maxPlayers}
`;
  }
}
