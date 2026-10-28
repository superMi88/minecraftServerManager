import { NextRequest, NextResponse } from 'next/server';
import { isServerRunning, getServerFolderPath } from '@/lib/server-manager';
import { findServer } from '@/lib/servers/registry';
import { migrateServerData, getLevelName } from '@/lib/servers/migrate';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

type Params = Promise<{ id: string }>;

// POST migrate/import server data from another server (or update)
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      sourceServerId,
      copyWorld = true,
      copyProperties = true,
      copyPlayers = true,
      copyPlugins = true,
    } = body;

      if (!sourceServerId) {
        return NextResponse.json(
          { success: false, error: 'Bitte wähle einen Quell-Server aus, von dem die Daten übernommen werden sollen.' },
          { status: 400 }
        );
      }

        if (sourceServerId === id) {
          return NextResponse.json(
            { success: false, error: 'Quell-Server und Ziel-Server dürfen nicht identisch sein.' },
            { status: 400 }
          );
        }

          // Check target server existence & determine type
          const targetResult = await findServer(id);
          if (!targetResult) {
            return NextResponse.json({ success: false, error: 'Ziel-Server nicht gefunden.' }, { status: 404 });
          }

            // Check source server existence
            const sourceResult = await findServer(sourceServerId);
            if (!sourceResult) {
              return NextResponse.json({ success: false, error: 'Ausgewählter Quell-Server nicht gefunden.' }, { status: 404 });
            }

              // Check if target server is running
              if (isServerRunning(id)) {
                return NextResponse.json(
                  {
                    success: false,
                    error: 'Dieser Server läuft noch. Bitte stoppe den Server, bevor du Daten von einem anderen Server übernimmst.',
                  },
                  { status: 400 }
                );
              }

                const targetServerFolder = getServerFolderPath(id);

                      // Optional safety: if the target server already has a world and we are overwriting it, create a backup in target's backups folder
                      if (copyWorld && fs.existsSync(targetServerFolder)) {
                        const targetLevelName = getLevelName(targetServerFolder);
                        const targetWorldPath = path.join(targetServerFolder, targetLevelName);
                        if (fs.existsSync(targetWorldPath)) {
                          try {
                            const backupsFolder = path.join(targetServerFolder, 'backups');
                            if (!fs.existsSync(backupsFolder)) {
                              fs.mkdirSync(backupsFolder, { recursive: true });
                            }
                            const timestamp = new Date()
                              .toISOString()
                              .replace(/T/, '_')
                              .replace(/\..+/, '')
                              .replace(/:/g, '-');
                            const backupFilename = `${targetLevelName}-pre-import-${timestamp}.zip`;
                            const backupPath = path.join(backupsFolder, backupFilename);
                            const zip = new AdmZip();
                            zip.addLocalFolder(targetWorldPath);
                            zip.writeZip(backupPath);
                          } catch (zipErr) {
                            console.error('Pre-import world backup failed:', zipErr);
                          }
                        }
                      }

                      const { copiedItems } = await migrateServerData({
                        sourceServerId,
                        targetServerId: id,
                        targetPort: targetResult.server.port,
                        targetType: targetResult.type,
                        copyWorld,
                        copyProperties,
                        copyPlayers,
                        copyPlugins,
                      });

                      const summary = copiedItems.length > 0 ? copiedItems.join(', ') : 'Keine Dateien gefunden';

                      return NextResponse.json({
                        success: true,
                        copiedItems,
                        message: `Daten erfolgreich von "${sourceResult.server.name}" übernommen (${summary}).`,
                      });
                    } catch (error) {
                      console.error('Migrate server data error:', error);
                      const message = error instanceof Error ? error.message : String(error);
                      return NextResponse.json({ success: false, error: message }, { status: 500 });
                    }
                  }
