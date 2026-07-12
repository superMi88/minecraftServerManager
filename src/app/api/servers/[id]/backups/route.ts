import { NextRequest, NextResponse } from 'next/server';
import { isServerRunning, getServerFolderPath } from '@/lib/server-manager';
import { findServer } from '@/lib/servers/registry';
import fs from 'fs';
import path from 'path';
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

// GET list of backups
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;

    // Check server existence
    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    if (serverType === 'ARK') {
      return NextResponse.json({ success: true, backups: [] });
    }

    const serverFolder = getServerFolderPath(id);
    const backupsFolder = path.join(serverFolder, 'backups');

    if (!fs.existsSync(backupsFolder)) {
      return NextResponse.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(backupsFolder);
    const backups = files
      .filter((file) => file.toLowerCase().endsWith('.zip'))
      .map((file) => {
        const filePath = path.join(backupsFolder, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          createdAt: stats.mtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({ success: true, backups });
  } catch (error) {
    console.error('Error fetching backups:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST create backup
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;

    // Check server existence
    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    if (serverType === 'ARK') {
      return NextResponse.json({ success: false, error: 'Backups werden für Ark-Server derzeit nicht unterstützt.' }, { status: 400 });
    }

    // Check if server is running
    if (isServerRunning(id)) {
      return NextResponse.json({
        success: false,
        error: 'Der Server läuft noch. Bitte stoppe den Server, um ein Backup zu erstellen.',
      }, { status: 400 });
    }

    const serverFolder = getServerFolderPath(id);
    const levelName = getLevelName(serverFolder);
    const worldPath = path.join(serverFolder, levelName);

    if (!fs.existsSync(worldPath)) {
      return NextResponse.json({
        success: false,
        error: `Welt-Ordner "${levelName}" wurde im Serververzeichnis nicht gefunden.`,
      }, { status: 400 });
    }

    const backupsFolder = path.join(serverFolder, 'backups');
    if (!fs.existsSync(backupsFolder)) {
      fs.mkdirSync(backupsFolder, { recursive: true });
    }

    // Generate zip filename: levelName-YYYY-MM-DD_HH-MM-SS.zip
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '_')
      .replace(/\..+/, '')
      .replace(/:/g, '-');
    const backupFilename = `${levelName}-${timestamp}.zip`;
    const backupPath = path.join(backupsFolder, backupFilename);

    console.log(`Creating backup for server ${id} at ${backupPath}...`);

    try {
      const zip = new AdmZip();
      zip.addLocalFolder(worldPath);
      zip.writeZip(backupPath);
    } catch (zipErr) {
      console.error('Zip packing failed:', zipErr);
      const message = zipErr instanceof Error ? zipErr.message : String(zipErr);
      return NextResponse.json({ success: false, error: `Backup-Erstellung fehlgeschlagen: ${message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Backup "${backupFilename}" erfolgreich erstellt.`,
      backup: {
        name: backupFilename,
        size: fs.statSync(backupPath).size,
        createdAt: fs.statSync(backupPath).mtime,
      },
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE a backup
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({ success: false, error: 'Parameter "name" ist erforderlich.' }, { status: 400 });
    }

    const filename = path.basename(name);
    if (!filename.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ success: false, error: 'Ungültiges Dateiformat. Backup muss eine ZIP-Datei sein.' }, { status: 400 });
    }

    const serverFolder = getServerFolderPath(id);
    const backupPath = path.join(serverFolder, 'backups', filename);

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ success: false, error: 'Backup-Datei nicht gefunden.' }, { status: 404 });
    }

    fs.unlinkSync(backupPath);

    return NextResponse.json({ success: true, message: `Backup "${filename}" erfolgreich gelöscht.` });
  } catch (error) {
    console.error('Error deleting backup:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
