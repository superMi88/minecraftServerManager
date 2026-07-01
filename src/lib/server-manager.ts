import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { prisma } from './db';

// Interface for running process tracking
interface RunningServer {
  process: ChildProcess;
  serverId: string;
  type: string;
  port: number;
}

// Store running processes globally so they survive hot-reloading in dev mode
const globalForServers = global as unknown as {
  minecraftServers: Map<string, RunningServer>;
};

if (!globalForServers.minecraftServers) {
  globalForServers.minecraftServers = new Map();
}

export const runningServers = globalForServers.minecraftServers;

const getServersDir = () => {
  const dir = process.env.MINECRAFT_SERVERS_DIR || path.join(process.cwd(), 'servers');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const getServerFolderPath = (serverId: string) => {
  return path.join(getServersDir(), serverId);
};

// Log logger
function logToFile(folderPath: string, message: string) {
  const logFile = path.join(folderPath, 'console.txt');
  try {
    fs.appendFileSync(logFile, message);
  } catch (e) {
    console.error('Could not write to server log file:', e);
  }
}

// Utility to create server.properties if not exists
export function createServerProperties(folderPath: string, port: number) {
  const propertiesContent = `#Minecraft server properties
#${new Date().toUTCString()}
accepts-transfers=false
allow-flight=true
allow-nether=true
broadcast-console-to-ops=true
broadcast-rcon-to-ops=true
bug-report-link=
difficulty=hard
enable-command-block=false
enable-jmx-monitoring=false
enable-query=false
enable-rcon=false
enable-status=true
enforce-secure-profile=true
enforce-whitelist=false
entity-broadcast-range-percentage=100
force-gamemode=false
function-permission-level=2
gamemode=survival
generate-structures=true
generator-settings={}
hardcore=false
hide-online-players=false
initial-disabled-packs=
initial-enabled-packs=vanilla
level-name=world
level-seed=
level-type=minecraft\\:normal
log-ips=true
max-chained-neighbor-updates=1000000
max-players=20
max-tick-time=180000
max-world-size=29999984
motd=Minecraft Server Manager
network-compression-threshold=256
online-mode=true
op-permission-level=4
player-idle-timeout=0
prevent-proxy-connections=false
previews-chat=false
pvp=true
query.port=${port}
rate-limit=0
rcon.password=
rcon.port=${port + 10}
region-file-compression=deflate
require-resource-pack=false
resource-pack=
resource-pack-id=
resource-pack-prompt=
resource-pack-sha1=
server-ip=
server-port=${port}
simulation-distance=10
spawn-animals=true
spawn-monsters=true
spawn-npcs=true
spawn-protection=0
sync-chunk-writes=true
text-filtering-config=
use-native-transport=true
view-distance=10
white-list=false`;

  const propertiesPath = path.join(folderPath, 'server.properties');
  if (!fs.existsSync(propertiesPath)) {
    fs.writeFileSync(propertiesPath, propertiesContent);
  }
}

// Utility to create eula.txt
export function createEula(folderPath: string) {
  const eulaContent = `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).
eula=true`;
  fs.writeFileSync(path.join(folderPath, 'eula.txt'), eulaContent);
}

export async function startServer(serverId: string) {
  let server: {
    id: string;
    name: string;
    port: number;
    memoryMin: string;
    memoryMax: string;
    opPlayer: string | null;
    serverProperties: string | null;
    jarFile?: string | null;
    curseForgeZip?: string | null;
    startScript?: string;
    type?: string;
  } | null = await prisma.minecraftServer.findUnique({
    where: { id: serverId },
  });
  let serverType = 'PAPER';

  if (!server) {
    server = await prisma.curseForgeServer.findUnique({
      where: { id: serverId },
    });
    serverType = 'CURSEFORGE';
  }

  if (!server) {
    throw new Error('Server not found in database.');
  }

  // Inject type field dynamically to keep downstream logic compatible
  server.type = serverType;

  if (runningServers.has(serverId)) {
    return { success: false, message: 'Server is already running.' };
  }

  // Check if another server is already running on the same port
  const runningServerWithSamePort = Array.from(runningServers.values()).find(
    (running) => running.port === server.port && running.serverId !== serverId
  );

  if (runningServerWithSamePort) {
    let conflictingServerName = 'Ein anderer Server';
    const paperConflict = await prisma.minecraftServer.findUnique({
      where: { id: runningServerWithSamePort.serverId },
      select: { name: true }
    });

    if (paperConflict) {
      conflictingServerName = paperConflict.name;
    } else {
      const cfConflict = await prisma.curseForgeServer.findUnique({
        where: { id: runningServerWithSamePort.serverId },
        select: { name: true }
      });
      if (cfConflict) {
        conflictingServerName = cfConflict.name;
      }
    }

    return {
      success: false,
      message: `Der Server '${conflictingServerName}' belegt bereits den Port ${server.port} und läuft. Bitte beende diesen zuerst.`,
    };
  }

  const folderPath = getServerFolderPath(serverId);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  createEula(folderPath);
  createServerProperties(folderPath, server.port);

  // Clear previous log file
  const logFile = path.join(folderPath, 'console.txt');
  fs.writeFileSync(logFile, '');

  const isWindows = process.platform === 'win32';
  let command = '';
  let args: string[] = [];

  if (server.type === 'PAPER') {
    const jarFile = server.jarFile || 'server.jar';
    const jarPath = path.join(folderPath, jarFile);
    if (!fs.existsSync(jarPath)) {
      return { success: false, message: `JAR file ${jarFile} not found in server folder.` };
    }

    command = 'java';
    args = [
      `-Xmx${server.memoryMax}`,
      `-Xms${server.memoryMin}`,
      '-jar',
      jarFile,
      'nogui',
    ];
  } else if (server.type === 'CURSEFORGE') {
    const scriptName = server.startScript || 'run.sh';
    const scriptPath = path.join(folderPath, scriptName);

    if (!fs.existsSync(scriptPath)) {
      return { success: false, message: `Execution script ${scriptName} not found. Please upload/unpack CurseForge modpack.` };
    }

    if (!isWindows) {
      try {
        fs.chmodSync(scriptPath, '755'); // Make executable
      } catch (err) {
        console.error(`Failed to chmod ${scriptPath}:`, err);
      }
    }

    if (scriptName.endsWith('.sh')) {
      command = isWindows ? 'bash' : '/bin/bash';
      args = [scriptName];
    } else {
      command = isWindows ? 'powershell.exe' : '/bin/bash';
      args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath] : [scriptPath];
    }
  } else {
    return { success: false, message: 'Invalid server type.' };
  }

  console.log(`Starting Minecraft server (${server.name}) in ${folderPath} with cmd: ${command} ${args.join(' ')}`);

  const mcProcess = spawn(command, args, {
    cwd: folderPath,
    env: process.env,
    shell: true,
  });

  runningServers.set(serverId, {
    process: mcProcess,
    serverId,
    type: server.type,
    port: server.port,
  });

  logToFile(folderPath, `[System] Server starting...\n`);

  mcProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    logToFile(folderPath, output);
    console.log(`[Minecraft ${server.name}] ${output.trim()}`);

    // If done loading, run automatic op command if set
    if (output.includes('Done') || output.includes('Preparing start region')) {
      if (server.opPlayer) {
        // execute with a tiny delay to ensure command can be processed
        setTimeout(() => {
          sendCommand(serverId, `op ${server.opPlayer}`);
        }, 2000);
      }
    }
  });

  mcProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    logToFile(folderPath, `[ERROR] ${output}`);
    console.error(`[Minecraft Error ${server.name}] ${output.trim()}`);
  });

  mcProcess.on('exit', (code) => {
    logToFile(folderPath, `\n[System] Server exited with code: ${code}\n`);
    console.log(`[Minecraft ${server.name}] Exited with code ${code}`);
    runningServers.delete(serverId);
  });

  return { success: true, message: 'Server process initiated.' };
}

export async function stopServer(serverId: string) {
  const server = runningServers.get(serverId);
  if (!server) {
    return { success: false, message: 'Server is not running.' };
  }

  const folderPath = getServerFolderPath(serverId);
  logToFile(folderPath, `\n[System] Stopping server...\n`);

  // Send standard stop command to stdin
  try {
    server.process.stdin?.write('stop\n');
  } catch (e) {
    console.error('Failed to write stop command to stdin:', e);
  }

  // Set timeout to force kill if it doesn't close in 12 seconds
  const forceKillTimeout = setTimeout(() => {
    const processInstance = runningServers.get(serverId);
    if (processInstance && !processInstance.process.killed) {
      logToFile(folderPath, `[System] Server did not stop gracefully. Force killing process...\n`);
      const pid = processInstance.process.pid;
      if (pid) {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
          spawn('taskkill', ['/PID', pid.toString(), '/T', '/F']);
        } else {
          exec(`pkill -P ${pid}`, () => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {}
          });
        }
      }
      runningServers.delete(serverId);
    }
  }, 12000);

  // Monitor process exit to clear force kill timer
  server.process.on('exit', () => {
    clearTimeout(forceKillTimeout);
    runningServers.delete(serverId);
  });

  return { success: true, message: 'Stop signal sent.' };
}

export function sendCommand(serverId: string, command: string) {
  const server = runningServers.get(serverId);
  if (!server || server.process.killed) {
    return { success: false, message: 'Server is not running.' };
  }

  try {
    server.process.stdin?.write(command + '\n');
    const folderPath = getServerFolderPath(serverId);
    logToFile(folderPath, `[Sent Command] ${command}\n`);
    return { success: true, message: 'Command sent.' };
  } catch {
    return { success: false, message: 'Failed to write to stdin.' };
  }
}

export function getConsoleLogs(serverId: string, limit = 60) {
  const folderPath = getServerFolderPath(serverId);
  const logFile = path.join(folderPath, 'console.txt');

  if (!fs.existsSync(logFile)) {
    return 'No logs found yet. Start the server to generate logs.';
  }

  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-limit).join('\n');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error reading log: ${message}`;
  }
}

export function isServerRunning(serverId: string): boolean {
  const running = runningServers.get(serverId);
  if (!running) return false;
  return !running.process.killed;
}

export function deleteServerFiles(serverId: string) {
  const folderPath = getServerFolderPath(serverId);
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
}

// Global store for interactive custom scripts
interface RunningScript {
  process: ChildProcess;
  serverId: string;
  scriptName: string;
  exitCode: number | null;
  exited: boolean;
}

const globalForScripts = global as unknown as {
  minecraftScripts: Map<string, RunningScript>;
};

if (!globalForScripts.minecraftScripts) {
  globalForScripts.minecraftScripts = new Map();
}

export const runningScripts = globalForScripts.minecraftScripts;

export function getScriptConsoleLogPath(serverId: string) {
  return path.join(getServerFolderPath(serverId), 'script_console.txt');
}

export async function startScriptProcess(serverId: string, scriptName: string) {
  if (runningScripts.has(serverId)) {
    const running = runningScripts.get(serverId)!;
    if (!running.exited) {
      return { success: false, message: 'Es läuft bereits ein Skript für diesen Server.' };
    }
  }

  const folderPath = getServerFolderPath(serverId);
  const scriptPath = path.join(folderPath, scriptName);

  if (!fs.existsSync(scriptPath)) {
    return { success: false, message: `Skript ${scriptName} nicht gefunden.` };
  }

  const logFile = getScriptConsoleLogPath(serverId);
  fs.writeFileSync(logFile, `[System] Skript ${scriptName} gestartet...\n`);

  const isWindows = process.platform === 'win32';
  if (!isWindows) {
    try {
      fs.chmodSync(scriptPath, '755');
    } catch {}
  }

  const command = isWindows ? 'bash' : '/bin/bash';
  const args = [scriptName];

  const scriptProcess = spawn(command, args, {
    cwd: folderPath,
    shell: true,
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
  });

  const scriptObj: RunningScript = {
    process: scriptProcess,
    serverId,
    scriptName,
    exitCode: null,
    exited: false
  };

  runningScripts.set(serverId, scriptObj);

  scriptProcess.stdout?.on('data', (data) => {
    try {
      fs.appendFileSync(logFile, data.toString());
    } catch {}
  });

  scriptProcess.stderr?.on('data', (data) => {
    try {
      fs.appendFileSync(logFile, data.toString());
    } catch {}
  });

  scriptProcess.on('exit', (code) => {
    scriptObj.exited = true;
    scriptObj.exitCode = code;
    try {
      fs.appendFileSync(logFile, `\n[System] Skript beendet mit Code: ${code}\n`);
    } catch {}
  });

  return { success: true, message: 'Skript gestartet.' };
}

export function sendScriptInput(serverId: string, input: string) {
  const running = runningScripts.get(serverId);
  if (!running || running.exited || running.process.killed) {
    return { success: false, message: 'Kein laufendes Skript gefunden.' };
  }

  try {
    running.process.stdin?.write(input + '\n');
    const logFile = getScriptConsoleLogPath(serverId);
    fs.appendFileSync(logFile, `[Eingabe] ${input}\n`);
    return { success: true };
  } catch {
    return { success: false, message: 'Eingabe konnte nicht gesendet werden.' };
  }
}

export function stopScriptProcess(serverId: string) {
  const running = runningScripts.get(serverId);
  if (!running) {
    return { success: false, message: 'Kein laufendes Skript gefunden.' };
  }

  try {
    const isWindows = process.platform === 'win32';
    const pid = running.process.pid;
    if (pid) {
      if (isWindows) {
        spawn('taskkill', ['/PID', pid.toString(), '/T', '/F']);
      } else {
        running.process.kill('SIGKILL');
      }
    }
  } catch {}

  runningScripts.delete(serverId);
  const logFile = getScriptConsoleLogPath(serverId);
  try {
    fs.appendFileSync(logFile, `\n[System] Skript vom Benutzer abgebrochen.\n`);
  } catch {}

  return { success: true, message: 'Skript abgebrochen.' };
}

export function getScriptConsoleLog(serverId: string) {
  const logFile = getScriptConsoleLogPath(serverId);
  if (!fs.existsSync(logFile)) {
    return '';
  }
  try {
    return fs.readFileSync(logFile, 'utf-8');
  } catch {
    return 'Fehler beim Lesen der Log-Datei.';
  }
}
