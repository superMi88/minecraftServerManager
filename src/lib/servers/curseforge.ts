import { ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { GameServerHandler, StartResult } from './base';
import { prisma } from '../db';

export class CurseForgeHandler implements GameServerHandler {
  async preStart(folderPath: string, config: any): Promise<void> {
    this.createEula(folderPath);
    this.createServerProperties(folderPath, config.port);
  }

  async getStartCommand(folderPath: string, config: any): Promise<StartResult> {
    const scriptName = config.startScript || 'run.sh';
    const scriptPath = path.join(folderPath, scriptName);

    if (!fs.existsSync(scriptPath)) {
      return { success: false, message: `Execution script ${scriptName} not found. Please upload/unpack CurseForge modpack.` };
    }

    const isWindows = process.platform === 'win32';
    if (!isWindows) {
      try {
        fs.chmodSync(scriptPath, '755'); // Make executable
      } catch (err) {
        console.error(`Failed to chmod ${scriptPath}:`, err);
      }
    }

    let command = '';
    let args: string[] = [];

    if (scriptName.endsWith('.sh')) {
      command = isWindows ? 'bash' : '/bin/bash';
      args = [scriptName];
    } else {
      command = isWindows ? 'powershell.exe' : '/bin/bash';
      args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath] : [scriptPath];
    }

    return {
      success: true,
      command,
      args,
      options: {
        cwd: folderPath,
        env: process.env,
        shell: true,
      }
    };
  }

  async stop(process: ChildProcess, folderPath: string): Promise<{ success: boolean; message?: string }> {
    try {
      process.stdin?.write('stop\n');
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async sendCommand(process: ChildProcess, command: string): Promise<{ success: boolean; message?: string }> {
    try {
      process.stdin?.write(command + '\n');
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to write to stdin.' };
    }
  }

  async getProperties(folderPath: string, config: any): Promise<string> {
    const propertiesPath = path.join(folderPath, 'server.properties');
    if (!fs.existsSync(propertiesPath)) {
      this.createServerProperties(folderPath, config.port);
    }
    return fs.readFileSync(propertiesPath, 'utf-8');
  }

  async saveProperties(folderPath: string, content: string, config: any): Promise<void> {
    const propertiesPath = path.join(folderPath, 'server.properties');
    fs.writeFileSync(propertiesPath, content);
    
    // Sync DB cache
    await prisma.curseForgeServer.update({
      where: { id: config.id },
      data: { serverProperties: content },
    });
  }

  private createEula(folderPath: string) {
    const eulaContent = `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true`;
    fs.writeFileSync(path.join(folderPath, 'eula.txt'), eulaContent);
  }

  private createServerProperties(folderPath: string, port: number) {
    const propertiesPath = path.join(folderPath, 'server.properties');
    if (fs.existsSync(propertiesPath)) return;

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

    fs.writeFileSync(propertiesPath, propertiesContent);
  }
}
