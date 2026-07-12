import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerFolderPath } from '@/lib/server-manager';
import { findServer } from '@/lib/servers/registry';
import path from 'path';
import fs from 'fs';
import unzipper from 'unzipper';

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const result = await findServer(id);

    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { server, type: serverType } = result;
    if (serverType === 'ARK') {
      return NextResponse.json({ success: false, error: 'Uploads werden für Ark-Server nicht über dieses Portal unterstützt. Nutze SteamCMD für Installationen/Updates.' }, { status: 400 });
    }

    server.type = serverType;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    const chunkIndexStr = formData.get('chunkIndex') as string | null;
    const totalChunksStr = formData.get('totalChunks') as string | null;
    const originalName = formData.get('originalName') as string | null;

    const isChunked = chunkIndexStr !== null && totalChunksStr !== null && originalName !== null;
    const serverFolder = getServerFolderPath(id);

    if (isChunked) {
      const chunkIndex = parseInt(chunkIndexStr!, 10);
      const totalChunks = parseInt(totalChunksStr!, 10);
      const filename = path.basename(originalName!);

      const tmpDirName = `tmp_upload_${filename}`;
      const tmpDirPath = path.join(serverFolder, tmpDirName);

      if (chunkIndex === 0) {
        if (fs.existsSync(tmpDirPath)) {
          fs.rmSync(tmpDirPath, { recursive: true, force: true });
        }
        fs.mkdirSync(tmpDirPath, { recursive: true });
      } else if (!fs.existsSync(tmpDirPath)) {
        return NextResponse.json({ success: false, error: 'Upload session not found. Please restart.' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const chunkPath = path.join(tmpDirPath, `part_${chunkIndex}`);
      fs.writeFileSync(chunkPath, buffer);

      if (chunkIndex + 1 === totalChunks) {
        let finalPath = '';
        if (server.type === 'PAPER') {
          if (filename.toLowerCase() === 'server.jar' || filename === server.jarFile) {
            finalPath = path.join(serverFolder, filename);
          } else {
            if (!filename.toLowerCase().endsWith('.jar')) {
              fs.rmSync(tmpDirPath, { recursive: true, force: true });
              return NextResponse.json({ success: false, error: 'Only .jar files are allowed for Paper Minecraft.' }, { status: 400 });
            }
            const pluginsFolder = path.join(serverFolder, 'plugins');
            if (!fs.existsSync(pluginsFolder)) {
              fs.mkdirSync(pluginsFolder, { recursive: true });
            }
            finalPath = path.join(pluginsFolder, filename);
          }
        } else if (server.type === 'CURSEFORGE') {
          if (!filename.toLowerCase().endsWith('.zip')) {
            fs.rmSync(tmpDirPath, { recursive: true, force: true });
            return NextResponse.json({ success: false, error: 'Only .zip files are allowed for CurseForge.' }, { status: 400 });
          }
          finalPath = path.join(serverFolder, filename);
        } else {
          fs.rmSync(tmpDirPath, { recursive: true, force: true });
          return NextResponse.json({ success: false, error: 'Unknown server type.' }, { status: 400 });
        }

        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }

        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(tmpDirPath, `part_${i}`);
          if (!fs.existsSync(partPath)) {
            throw new Error(`Missing chunk part ${i}`);
          }
          const chunkData = fs.readFileSync(partPath);
          fs.appendFileSync(finalPath, chunkData);
        }

        // Clean up tmp directory
        fs.rmSync(tmpDirPath, { recursive: true, force: true });

        // Post-processing
        if (server.type === 'PAPER') {
          if (filename.toLowerCase() === 'server.jar' || filename === server.jarFile) {
            // Update DB
            await prisma.minecraftServer.update({
              where: { id },
              data: { jarFile: filename },
            });
            return NextResponse.json({ success: true, message: `Server JAR "${filename}" uploaded successfully.` });
          } else {
            return NextResponse.json({ success: true, message: `Plugin "${filename}" uploaded successfully.` });
          }
        } else if (server.type === 'CURSEFORGE') {
          // Extract zip logic in background to prevent HTTP timeouts
          Promise.resolve().then(async () => {
            const logFile = path.join(serverFolder, 'console.txt');
            const appendLog = (msg: string) => {
              try { fs.appendFileSync(logFile, `[System] ${msg}\n`); } catch {}
            };

            appendLog(`Starte Entpacken von Modpack ZIP-Datei: ${filename}...`);
            console.log(`Extracting CurseForge zip file to ${serverFolder} in background...`);
            try {
              const directory = await unzipper.Open.file(finalPath);
              const entries = directory.files;

              if (entries.length === 0) {
                throw new Error('ZIP file is empty.');
              }

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

                const fullPath = path.join(serverFolder, relativePath);

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

              fs.unlinkSync(finalPath);

              await prisma.curseForgeServer.update({
                where: { id },
                data: { curseForgeZip: filename },
              });

              appendLog(`Modpack ZIP-Datei erfolgreich entpackt! Server ist jetzt bereit.`);
              console.log("Unzipping complete!");
            } catch (err) {
              console.error('Error during background zip extraction:', err);
              if (fs.existsSync(finalPath)) {
                try { fs.unlinkSync(finalPath); } catch {}
              }
              const message = err instanceof Error ? err.message : String(err);
              appendLog(`FEHLER beim Entpacken der Modpack ZIP-Datei: ${message}`);
            }
          });

          return NextResponse.json({ success: true, message: 'CurseForge zip file uploaded successfully. Extracting in background...' });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} received.`,
      });
    } else {
      // Standard single-file upload path
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (server.type === 'PAPER') {
        const filename = file.name;
        if (filename.toLowerCase() === 'server.jar' || filename === server.jarFile) {
          const filePath = path.join(serverFolder, filename);
          fs.writeFileSync(filePath, buffer);
          await prisma.minecraftServer.update({
            where: { id },
            data: { jarFile: filename },
          });
          return NextResponse.json({ success: true, message: `Server JAR "${filename}" uploaded successfully.` });
        } else {
          if (!filename.toLowerCase().endsWith('.jar')) {
            return NextResponse.json({ success: false, error: 'Only .jar files are allowed for Paper Minecraft.' }, { status: 400 });
          }
          const pluginsFolder = path.join(serverFolder, 'plugins');
          if (!fs.existsSync(pluginsFolder)) {
            fs.mkdirSync(pluginsFolder, { recursive: true });
          }
          const filePath = path.join(pluginsFolder, filename);
          fs.writeFileSync(filePath, buffer);
          return NextResponse.json({ success: true, message: `Plugin "${filename}" uploaded successfully.` });
        }
      } else if (server.type === 'CURSEFORGE') {
        const filename = file.name;
        if (!filename.toLowerCase().endsWith('.zip')) {
          return NextResponse.json({ success: false, error: 'Only .zip files are allowed for CurseForge.' }, { status: 400 });
        }
        const zipPath = path.join(serverFolder, filename);
        fs.writeFileSync(zipPath, buffer);
        
        Promise.resolve().then(async () => {
          const logFile = path.join(serverFolder, 'console.txt');
          const appendLog = (msg: string) => {
            try { fs.appendFileSync(logFile, `[System] ${msg}\n`); } catch {}
          };

          appendLog(`Starte Entpacken von Modpack ZIP-Datei: ${filename}...`);
          console.log(`Extracting CurseForge zip file to ${serverFolder} in background...`);
          try {
            const directory = await unzipper.Open.file(zipPath);
            const entries = directory.files;
            if (entries.length === 0) {
              throw new Error('ZIP file is empty.');
            }
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
              const fullPath = path.join(serverFolder, relativePath);
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
            fs.unlinkSync(zipPath);
            await prisma.curseForgeServer.update({
              where: { id },
              data: { curseForgeZip: filename },
            });
            appendLog(`Modpack ZIP-Datei erfolgreich entpackt! Server ist jetzt bereit.`);
            console.log("Unzipping complete!");
          } catch (err) {
            console.error('Error during background zip extraction:', err);
            if (fs.existsSync(zipPath)) {
              try { fs.unlinkSync(zipPath); } catch {}
            }
            const message = err instanceof Error ? err.message : String(err);
            appendLog(`FEHLER beim Entpacken der Modpack ZIP-Datei: ${message}`);
          }
        });

        return NextResponse.json({ success: true, message: 'CurseForge zip file uploaded successfully. Extracting in background...' });
      } else {
        return NextResponse.json({ success: false, error: 'Unknown server type.' }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
