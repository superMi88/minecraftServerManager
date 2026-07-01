import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getServerFolderPath } from '@/lib/server-manager';

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return new Response('Missing name parameter', { status: 400 });
    }

    const filename = path.basename(name);
    if (!filename.toLowerCase().endsWith('.zip')) {
      return new Response('Invalid file extension', { status: 400 });
    }

    const serverFolder = getServerFolderPath(id);
    const filePath = path.join(serverFolder, 'backups', filename);

    if (!fs.existsSync(filePath)) {
      return new Response('Backup file not found', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.readFileSync(filePath);

    return new Response(fileStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Internal Server Error: ${message}`, { status: 500 });
  }
}
