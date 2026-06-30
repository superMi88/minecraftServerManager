import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isServerRunning, stopServer, deleteServerFiles, getServerFolderPath } from '@/lib/server-manager';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    let server: any = await prisma.minecraftServer.findUnique({
      where: { id },
    });
    let serverType = 'PAPER';

    if (!server) {
      server = await prisma.curseForgeServer.findUnique({
        where: { id },
      });
      serverType = 'CURSEFORGE';
    }

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    let availableShFiles: string[] = [];
    if (serverType === 'CURSEFORGE') {
      const folderPath = getServerFolderPath(id);
      if (fs.existsSync(folderPath)) {
        try {
          const files = fs.readdirSync(folderPath);
          availableShFiles = files.filter((file) => file.endsWith('.sh'));
        } catch (err) {
          console.error('Error reading server directory:', err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      server: {
        ...server,
        type: serverType,
        isRunning: isServerRunning(id),
        availableShFiles,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    let server: any = await prisma.minecraftServer.findUnique({
      where: { id },
    });
    let serverType = 'PAPER';

    if (!server) {
      server = await prisma.curseForgeServer.findUnique({
        where: { id },
      });
      serverType = 'CURSEFORGE';
    }

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    // Stop if running
    if (isServerRunning(id)) {
      await stopServer(id);
    }

    // Delete database entry
    if (serverType === 'PAPER') {
      await prisma.minecraftServer.delete({
        where: { id },
      });
    } else {
      await prisma.curseForgeServer.delete({
        where: { id },
      });
    }

    // Delete folder structure
    deleteServerFiles(id);

    return NextResponse.json({ success: true, message: 'Server deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting server:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { port, memoryMin, memoryMax, jarFile, opPlayer, curseForgeZip, startScript } = body;

    let server: any = await prisma.minecraftServer.findUnique({
      where: { id },
    });
    let serverType = 'PAPER';

    if (!server) {
      server = await prisma.curseForgeServer.findUnique({
        where: { id },
      });
      serverType = 'CURSEFORGE';
    }

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    const updateData: any = {};
    if (port !== undefined) {
      const portInt = parseInt(port, 10);
      if (isNaN(portInt)) {
        return NextResponse.json({ success: false, error: 'Port must be a valid number.' }, { status: 400 });
      }
      updateData.port = portInt;
    }

    if (memoryMin !== undefined) updateData.memoryMin = memoryMin;
    if (memoryMax !== undefined) updateData.memoryMax = memoryMax;
    
    if (startScript !== undefined && serverType === 'CURSEFORGE') {
      updateData.startScript = startScript;
    }
    
    if (jarFile !== undefined && serverType === 'PAPER') {
      updateData.jarFile = jarFile;
      const folderPath = getServerFolderPath(id);
      const globalJarPath = path.join(process.cwd(), 'uploads', 'jars', jarFile);
      if (fs.existsSync(globalJarPath)) {
        const destPath = path.join(folderPath, jarFile);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(globalJarPath, destPath);
        }
      }
    }

    if (curseForgeZip !== undefined && serverType === 'CURSEFORGE' && curseForgeZip !== server.curseForgeZip) {
      updateData.curseForgeZip = curseForgeZip;
      if (curseForgeZip) {
        const folderPath = getServerFolderPath(id);
        
        // Option B: Delete modpack folders before extracting new modpack
        const foldersToClean = ['mods', 'config', 'libraries', 'kubejs', 'defaultconfigs', 'scripts'];
        for (const dirName of foldersToClean) {
          const dirPath = path.join(folderPath, dirName);
          if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
          }
        }

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
          } catch (err: any) {
            console.error('Error extracting zip during server patch:', err);
          }
        }
      }
    }

    if (opPlayer !== undefined) updateData.opPlayer = opPlayer || null;

    let updatedServer: any;
    if (serverType === 'PAPER') {
      updatedServer = await prisma.minecraftServer.update({
        where: { id },
        data: updateData,
      });
      updatedServer.type = 'PAPER';
    } else {
      updatedServer = await prisma.curseForgeServer.update({
        where: { id },
        data: updateData,
      });
      updatedServer.type = 'CURSEFORGE';
    }

    return NextResponse.json({ success: true, server: updatedServer });
  } catch (error: any) {
    console.error('Error updating server:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
