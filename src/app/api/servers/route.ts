import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isServerRunning, getServerFolderPath } from '@/lib/server-manager';
import { getAllServers, getHandler, ServerUnion } from '@/lib/servers/registry';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

// GET all servers
export async function GET() {
  try {
    const dbServers = await getAllServers();

    const serversWithStatus = dbServers.map((server) => ({
      ...server,
      isRunning: isServerRunning(server.id),
    }));

    return NextResponse.json({ success: true, servers: serversWithStatus });
  } catch (error) {
    console.error('Error fetching servers:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create server
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      type,
      port,
      memoryMin,
      memoryMax,
      jarFile,
      opPlayer,
      curseForgeZip,
      queryPort,
      rconPort,
      maxPlayers,
      map,
      serverPassword,
      adminPassword
    } = body;

    if (!name || !type || !port) {
      return NextResponse.json({ success: false, error: 'Name, Type, and Port are required.' }, { status: 400 });
    }

    // Port must be an integer
    const portInt = parseInt(port, 10);
    if (isNaN(portInt)) {
      return NextResponse.json({ success: false, error: 'Port must be a valid number.' }, { status: 400 });
    }

    // Check if name or port is already used across all tables
    const nameExistsInPaper = await prisma.minecraftServer.findUnique({ where: { name } });
    const nameExistsInCF = await prisma.curseForgeServer.findUnique({ where: { name } });
    const nameExistsInArk = await prisma.arkServer.findUnique({ where: { name } });
    if (nameExistsInPaper || nameExistsInCF || nameExistsInArk) {
      return NextResponse.json({ success: false, error: 'A server with this name already exists.' }, { status: 400 });
    }

    // Create database entry based on type
    let newServer: ServerUnion & { type?: 'PAPER' | 'CURSEFORGE' | 'ARK' };
    if (type === 'PAPER') {
      newServer = await prisma.minecraftServer.create({
        data: {
          name,
          port: portInt,
          memoryMin: memoryMin || '2048M',
          memoryMax: memoryMax || '6144M',
          jarFile: jarFile || 'server.jar',
          opPlayer: opPlayer || null,
        },
      });
      newServer.type = 'PAPER';
    } else if (type === 'CURSEFORGE') {
      newServer = await prisma.curseForgeServer.create({
        data: {
          name,
          port: portInt,
          memoryMin: memoryMin || '2048M',
          memoryMax: memoryMax || '6144M',
          curseForgeZip: curseForgeZip || null,
          opPlayer: opPlayer || null,
          startScript: 'run.sh',
        },
      });
      newServer.type = 'CURSEFORGE';
    } else if (type === 'ARK') {
      newServer = await prisma.arkServer.create({
        data: {
          name,
          port: portInt,
          queryPort: queryPort ? parseInt(queryPort, 10) : 27015,
          rconPort: rconPort ? parseInt(rconPort, 10) : 27020,
          maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : 20,
          map: map || 'TheIsland_WP',
          serverPassword: serverPassword || null,
          adminPassword: adminPassword || 'adminpass',
          installed: false,
        },
      });
      newServer.type = 'ARK';
    } else {
      return NextResponse.json({ success: false, error: 'Invalid server type.' }, { status: 400 });
    }

    // Create directory structure
    const folderPath = getServerFolderPath(newServer.id);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Setup initial properties
    const handler = getHandler(type);
    if (handler.preStart) {
      await handler.preStart(folderPath, newServer);
    }

    // Copy selected files or extract modpack if selected
    if (type === 'PAPER' && jarFile) {
      const globalJarPath = path.join(process.cwd(), 'uploads', 'jars', jarFile);
      if (fs.existsSync(globalJarPath)) {
        const destPath = path.join(folderPath, jarFile);
        fs.copyFileSync(globalJarPath, destPath);
      }
    } else if (type === 'CURSEFORGE' && curseForgeZip) {
      const globalZipPath = path.join(process.cwd(), 'uploads', 'zips', curseForgeZip);
      if (fs.existsSync(globalZipPath)) {
        try {
          const directory = await unzipper.Open.file(globalZipPath);
          const entries = directory.files;

          if (entries.length > 0) {
            const firstEntryPath = entries[0].path;
            const rootFolder = firstEntryPath.split('/')[0];
            
            let allHaveCommonRoot = true;
            for (const entry of entries) {
              if (!entry.path.startsWith(rootFolder + '/') && entry.path !== rootFolder) {
                allHaveCommonRoot = false;
                break;
              }
            }

            for (const entry of entries) {
              let relativePath = entry.path;
              if (allHaveCommonRoot && relativePath.startsWith(rootFolder + '/')) {
                relativePath = relativePath.slice(rootFolder.length + 1);
              }
              
              if (!relativePath) continue;

              const fullPath = path.join(folderPath, relativePath);

              if (entry.type === 'Directory') {
                fs.mkdirSync(fullPath, { recursive: true });
              } else {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                
                await new Promise<void>((resolve, reject) => {
                  entry.stream()
                    .pipe(fs.createWriteStream(fullPath))
                    .on('finish', resolve)
                    .on('error', reject);
                });
              }
            }
          }
        } catch (err) {
          console.error('Error extracting zip during server creation:', err);
        }
      }
    }

    return NextResponse.json({ success: true, server: newServer });
  } catch (error) {
    console.error('Error creating server:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
