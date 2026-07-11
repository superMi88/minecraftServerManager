import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isServerRunning, getServerFolderPath } from '@/lib/server-manager';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import AdmZip from 'adm-zip';

type Params = Promise<{ id: string }>;

// Helper to parse level-name from server.properties
function getLevelName(serverFolder: string): string {
  const propertiesPath = path.join(serverFolder, 'server.properties');
  if (!fs.existsSync(propertiesPath)) {
    return 'world';
  }

  try {
    const content = fs.readFileSync(propertiesPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('level-name=')) {
        return line.trim().split('=')[1] || 'world';
      }
    }
  } catch (e) {
    console.error('Failed to read server.properties:', e);
  }

  return 'world';
}

// POST update server
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { targetJar, targetZip } = body;

    // Check server existence & determine type
    let server: import('@prisma/client').MinecraftServer | import('@prisma/client').CurseForgeServer | null =
      await prisma.minecraftServer.findUnique({ where: { id } });
    const isPaper = !!server;
    if (!server) {
      server = await prisma.curseForgeServer.findUnique({ where: { id } });
    }
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    // Check if server is running
    if (isServerRunning(id)) {
      return NextResponse.json({
        success: false,
        error: 'Der Server läuft noch. Bitte stoppe den Server, um das Update durchzuführen.',
      }, { status: 400 });
    }

    const serverFolder = getServerFolderPath(id);
    const oldServerFolder = serverFolder + '_old';
    const newServerFolder = serverFolder + '_new';

    // 1. Create a world backup first
    const levelName = getLevelName(serverFolder);
    const worldPath = path.join(serverFolder, levelName);
    
    if (fs.existsSync(worldPath)) {
      const backupsFolder = path.join(serverFolder, 'backups');
      if (!fs.existsSync(backupsFolder)) {
        fs.mkdirSync(backupsFolder, { recursive: true });
      }
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/T/, '_')
        .replace(/\..+/, '')
        .replace(/:/g, '-');
      const backupFilename = `${levelName}-pre-update-${timestamp}.zip`;
      const backupPath = path.join(backupsFolder, backupFilename);

      console.log(`Creating pre-update backup for server ${id} at ${backupPath}...`);
      try {
        const zip = new AdmZip();
        zip.addLocalFolder(worldPath);
        zip.writeZip(backupPath);
      } catch (zipErr) {
        console.error('Pre-update world backup failed:', zipErr);
        // Continue update even if world backup fails, but log it
      }
    }

    // 2. Backup the current server directory to [id]_old
    console.log(`Backing up server folder ${serverFolder} to ${oldServerFolder}...`);
    if (fs.existsSync(oldServerFolder)) {
      fs.rmSync(oldServerFolder, { recursive: true, force: true });
    }
    fs.cpSync(serverFolder, oldServerFolder, { recursive: true });

    // 3. Create fresh new server directory
    if (fs.existsSync(newServerFolder)) {
      fs.rmSync(newServerFolder, { recursive: true, force: true });
    }
    fs.mkdirSync(newServerFolder, { recursive: true });

    // 4. Extract / install the new server core files
    if (isPaper) {
      if (!targetJar) {
        return NextResponse.json({ success: false, error: 'Bitte wähle eine JAR-Datei aus.' }, { status: 400 });
      }
      const globalJarPath = path.join(process.cwd(), 'uploads', 'jars', targetJar);
      if (!fs.existsSync(globalJarPath)) {
        return NextResponse.json({ success: false, error: `JAR-Datei "${targetJar}" wurde nicht in den Uploads gefunden.` }, { status: 404 });
      }
      fs.copyFileSync(globalJarPath, path.join(newServerFolder, targetJar));
    } else {
      if (!targetZip) {
        return NextResponse.json({ success: false, error: 'Bitte wähle eine ZIP-Datei aus.' }, { status: 400 });
      }
      const globalZipPath = path.join(process.cwd(), 'uploads', 'zips', targetZip);
      if (!fs.existsSync(globalZipPath)) {
        return NextResponse.json({ success: false, error: `ZIP-Datei "${targetZip}" wurde nicht in den Uploads gefunden.` }, { status: 404 });
      }

      // Extract ZIP into newServerFolder
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
            const fullPath = path.join(newServerFolder, relativePath);

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
      } catch (zipErr) {
        console.error('Error extracting new zip file:', zipErr);
        return NextResponse.json({ success: false, error: `ZIP-Extraktion fehlgeschlagen: ${zipErr}` }, { status: 500 });
      }
    }

    // 5. Copy user/persistent files from oldServerFolder to newServerFolder
    // a) World folders
    const oldWorldPath = path.join(oldServerFolder, levelName);
    if (fs.existsSync(oldWorldPath)) {
      fs.cpSync(oldWorldPath, path.join(newServerFolder, levelName), { recursive: true });
      console.log(`Copied world folder ${levelName} to new server.`);
    }
    if (isPaper) {
      const netherPath = oldWorldPath + '_nether';
      const endPath = oldWorldPath + '_the_end';
      if (fs.existsSync(netherPath)) {
        fs.cpSync(netherPath, path.join(newServerFolder, levelName + '_nether'), { recursive: true });
      }
      if (fs.existsSync(endPath)) {
        fs.cpSync(endPath, path.join(newServerFolder, levelName + '_the_end'), { recursive: true });
      }
    }

    // b) Whitelist, properties, ops, etc.
    const filesToMigrate = [
      'server.properties',
      'whitelist.json',
      'ops.json',
      'banned-players.json',
      'banned-ips.json',
      'usercache.json',
      'usernamecache.json',
      'eula.txt',
    ];

    for (const fileName of filesToMigrate) {
      const srcFile = path.join(oldServerFolder, fileName);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(newServerFolder, fileName));
        console.log(`Copied system file ${fileName} to new server.`);
      }
    }

    // c) Copy old backups folder to new server folder so backup history is kept!
    const oldBackupsFolder = path.join(oldServerFolder, 'backups');
    if (fs.existsSync(oldBackupsFolder)) {
      fs.cpSync(oldBackupsFolder, path.join(newServerFolder, 'backups'), { recursive: true });
    }

    // d) For Paper, copy old plugins folder
    if (isPaper) {
      const oldPluginsPath = path.join(oldServerFolder, 'plugins');
      if (fs.existsSync(oldPluginsPath)) {
        fs.cpSync(oldPluginsPath, path.join(newServerFolder, 'plugins'), { recursive: true });
        console.log('Copied existing plugins to new server.');
      }
    }

    // 6. Write update_metadata.json for rollback
    const metadata = {
      previousJarFile: isPaper ? server.jarFile : null,
      previousCurseForgeZip: !isPaper ? server.curseForgeZip : null,
      previousStartScript: !isPaper ? server.startScript : null,
      updatedJarFile: isPaper ? targetJar : null,
      updatedCurseForgeZip: !isPaper ? targetZip : null,
      updateTime: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(newServerFolder, 'update_metadata.json'), JSON.stringify(metadata, null, 2));
    fs.writeFileSync(path.join(oldServerFolder, 'update_metadata.json'), JSON.stringify(metadata, null, 2));

    // 7. Swapping the folders
    console.log('Swapping server folders...');
    const tempFolder = serverFolder + '_temp';
    if (fs.existsSync(tempFolder)) {
      fs.rmSync(tempFolder, { recursive: true, force: true });
    }

    fs.renameSync(serverFolder, tempFolder);
    fs.renameSync(newServerFolder, serverFolder);
    fs.rmSync(tempFolder, { recursive: true, force: true });

    // 8. Update DB fields
    if (isPaper) {
      await prisma.minecraftServer.update({
        where: { id },
        data: { jarFile: targetJar },
      });
    } else {
      // Find start scripts in new folder if available
      let startScript = 'run.sh';
      try {
        const files = fs.readdirSync(serverFolder);
        const shFiles = files.filter(f => f.endsWith('.sh'));
        if (shFiles.length > 0) {
          // Prefer run.sh or whatever was startScript before if still exists
          if (server.startScript && shFiles.includes(server.startScript)) {
            startScript = server.startScript;
          } else {
            startScript = shFiles[0];
          }
        }
      } catch {}

      await prisma.curseForgeServer.update({
        where: { id },
        data: { curseForgeZip: targetZip, startScript },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Server erfolgreich auf die neue Version geupdated.',
    });
  } catch (error) {
    console.error('Update server error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
