import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isServerRunning, createServerProperties, createEula, getServerFolderPath } from '@/lib/server-manager';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

// GET all servers
export async function GET() {
  try {
    const paperServers = await prisma.minecraftServer.findMany();
    const cfServers = await prisma.curseForgeServer.findMany();

    const dbServers = [
      ...paperServers.map((s) => ({ ...s, type: 'PAPER' as const })),
      ...cfServers.map((s) => ({ ...s, type: 'CURSEFORGE' as const })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const serversWithStatus = dbServers.map((server) => ({
      ...server,
      isRunning: isServerRunning(server.id),
    }));

    return NextResponse.json({ success: true, servers: serversWithStatus });
  } catch (error: any) {
    console.error('Error fetching servers:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST create server
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, port, memoryMin, memoryMax, jarFile, opPlayer, curseForgeZip } = body;

    if (!name || !type || !port) {
      return NextResponse.json({ success: false, error: 'Name, Type, and Port are required.' }, { status: 400 });
    }

    // Port must be an integer
    const portInt = parseInt(port, 10);
    if (isNaN(portInt)) {
      return NextResponse.json({ success: false, error: 'Port must be a valid number.' }, { status: 400 });
    }

    // Check if name or port is already used across both tables
    const nameExistsInPaper = await prisma.minecraftServer.findUnique({ where: { name } });
    const nameExistsInCF = await prisma.curseForgeServer.findUnique({ where: { name } });
    if (nameExistsInPaper || nameExistsInCF) {
      return NextResponse.json({ success: false, error: 'A server with this name already exists.' }, { status: 400 });
    }


    // Create database entry based on type
    let newServer: any;
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
    } else {
      return NextResponse.json({ success: false, error: 'Invalid server type.' }, { status: 400 });
    }

    // Create directory structure
    const folderPath = getServerFolderPath(newServer.id);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Write initial files
    createEula(folderPath);
    createServerProperties(folderPath, portInt);

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
            // Find if there's a common root folder in the zip file
            const firstEntryPath = entries[0].path;
            const rootFolder = firstEntryPath.split('/')[0];
            
            let allHaveCommonRoot = true;
            for (const entry of entries) {
              if (!entry.path.startsWith(rootFolder + '/') && entry.path !== rootFolder) {
                allHaveCommonRoot = false;
                break;
              }
            }

            // Extract each entry
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
        } catch (err: any) {
          console.error('Error extracting zip during server creation:', err);
        }
      }
    }

    return NextResponse.json({ success: true, server: newServer });
  } catch (error: any) {
    console.error('Error creating server:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
