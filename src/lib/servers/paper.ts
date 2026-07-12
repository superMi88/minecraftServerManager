import { ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { GameServerHandler, StartResult } from './base';
import { prisma } from '../db';

interface PaperConfig {
  id: string;
  port: number;
  jarFile?: string | null;
  memoryMax: string;
  memoryMin: string;
}

export class PaperHandler implements GameServerHandler {
  async preStart(folderPath: string, config: Record<string, unknown>): Promise<void> {
    const cfg = config as unknown as PaperConfig;
    this.createEula(folderPath);
    this.createServerProperties(folderPath, cfg.port);
  }

  async getStartCommand(folderPath: string, config: Record<string, unknown>): Promise<StartResult> {
    const cfg = config as unknown as PaperConfig;
    const jarFile = cfg.jarFile || 'server.jar';
    const jarPath = path.join(folderPath, jarFile);
    if (!fs.existsSync(jarPath)) {
      return { success: false, message: `JAR file ${jarFile} not found in server folder.` };
    }

    return {
      success: true,
      command: 'java',
      args: [
        `-Xmx${cfg.memoryMax}`,
        `-Xms${cfg.memoryMin}`,
        '-jar',
        jarFile,
        'nogui',
      ],
      options: {
        cwd: folderPath,
        env: process.env,
        shell: true,
      }
    };
  }

  async stop(process: ChildProcess, _folderPath: string): Promise<{ success: boolean; message?: string }> {
    void _folderPath;
    try {
      process.stdin?.write('stop\n');
      return { success: true };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async sendCommand(process: ChildProcess, command: string): Promise<{ success: boolean; message?: string }> {
    try {
      process.stdin?.write(command + '\n');
      return { success: true };
    } catch (_error) {
      void _error;
      return { success: false, message: 'Failed to write to stdin.' };
    }
  }

  async getProperties(folderPath: string, config: Record<string, unknown>): Promise<string> {
    const cfg = config as unknown as PaperConfig;
    const propertiesPath = path.join(folderPath, 'server.properties');
    if (!fs.existsSync(propertiesPath)) {
      this.createServerProperties(folderPath, cfg.port);
    }
    return fs.readFileSync(propertiesPath, 'utf-8');
  }

  async saveProperties(folderPath: string, content: string, config: Record<string, unknown>): Promise<void> {
    const cfg = config as unknown as PaperConfig;
    const propertiesPath = path.join(folderPath, 'server.properties');
    fs.writeFileSync(propertiesPath, content);
    
    // Sync DB cache
    await prisma.minecraftServer.update({
      where: { id: cfg.id },
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
