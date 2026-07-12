import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isServerRunning, getServerFolderPath } from '@/lib/server-manager';
import { findServer } from '@/lib/servers/registry';
import fs from 'fs';
import path from 'path';

type Params = Promise<{ id: string }>;

// POST rollback server
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;

    // Check server existence & determine type
    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    if (serverType === 'ARK') {
      return NextResponse.json({ success: false, error: 'Rollback wird für Ark-Server nicht unterstützt.' }, { status: 400 });
    }

    const isPaper = serverType === 'PAPER';

    // Check if server is running
    if (isServerRunning(id)) {
      return NextResponse.json({
        success: false,
        error: 'Der Server läuft noch. Bitte stoppe den Server, um das Rollback durchzuführen.',
      }, { status: 400 });
    }

    const serverFolder = getServerFolderPath(id);
    const oldServerFolder = serverFolder + '_old';

    if (!fs.existsSync(oldServerFolder)) {
      return NextResponse.json({
        success: false,
        error: 'Es wurde kein Rollback-Verzeichnis für diesen Server gefunden.',
      }, { status: 404 });
    }

    // 1. Delete the new/failed server folder
    console.log(`Deleting failed server folder ${serverFolder}...`);
    fs.rmSync(serverFolder, { recursive: true, force: true });

    // 2. Restore the old server folder (rename [id]_old to [id])
    console.log(`Restoring old server folder from ${oldServerFolder} to ${serverFolder}...`);
    fs.renameSync(oldServerFolder, serverFolder);

    // 3. Read metadata to restore database entries
    const metadataPath = path.join(serverFolder, 'update_metadata.json');
    let previousJarFile = 'server.jar';
    let previousCurseForgeZip: string | null = null;
    let previousStartScript = 'run.sh';

    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        previousJarFile = metadata.previousJarFile || 'server.jar';
        previousCurseForgeZip = metadata.previousCurseForgeZip || null;
        previousStartScript = metadata.previousStartScript || 'run.sh';
      } catch (err) {
        console.error('Error reading rollback metadata:', err);
      }

      // Delete metadata file from restored folder as rollback is complete
      try {
        fs.unlinkSync(metadataPath);
      } catch {}
    }

    // 4. Update database
    if (isPaper) {
      await prisma.minecraftServer.update({
        where: { id },
        data: { jarFile: previousJarFile },
      });
    } else {
      await prisma.curseForgeServer.update({
        where: { id },
        data: { curseForgeZip: previousCurseForgeZip, startScript: previousStartScript },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Rollback erfolgreich durchgeführt. Der vorherige Server-Zustand wurde wiederhergestellt.',
    });
  } catch (error) {
    console.error('Rollback server error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
