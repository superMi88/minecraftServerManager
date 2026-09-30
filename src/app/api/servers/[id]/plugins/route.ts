import { NextRequest, NextResponse } from 'next/server';
import { getServerFolderPath } from '@/lib/server-manager';
import { findServer } from '@/lib/servers/registry';
import path from 'path';
import fs from 'fs';

type Params = Promise<{ id: string }>;

// GET all plugins/mods in server folder
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    
    // Check server existence & determine type
    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    const isPaper = serverType === 'PAPER';
    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const pluginsPath = path.join(folderPath, folderName);

    if (!fs.existsSync(pluginsPath)) {
      return NextResponse.json({ success: true, plugins: [] });
    }

    const files = fs.readdirSync(pluginsPath);
    const jarFiles = files.filter((file) => file.toLowerCase().endsWith('.jar'));

    return NextResponse.json({ success: true, plugins: jarFiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST enable (copy) or disable (delete) a plugin from global storage to server folder
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { pluginName, selected } = body;

    if (!pluginName) {
      return NextResponse.json({ success: false, error: 'Plugin name is required.' }, { status: 400 });
    }

    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return NextResponse.json({ success: false, error: 'Invalid plugin name.' }, { status: 400 });
    }

    // Check server existence & determine type
    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    const isPaper = serverType === 'PAPER';
    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const serverDir = path.join(folderPath, folderName);
    const targetPath = path.join(serverDir, pluginName);

    if (selected) {
      const globalPluginPath = path.join(process.cwd(), 'uploads', 'minecraft', 'plugins', pluginName);
      if (!fs.existsSync(globalPluginPath)) {
        return NextResponse.json({ success: false, error: 'Globales Plugin nicht gefunden.' }, { status: 404 });
      }

      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }

      fs.copyFileSync(globalPluginPath, targetPath);
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" erfolgreich aktiviert.` });
    } else {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" erfolgreich deaktiviert.` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE a specific plugin directly
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const pluginName = searchParams.get('name');

    if (!pluginName) {
      return NextResponse.json({ success: false, error: 'Plugin name parameter is required.' }, { status: 400 });
    }

    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return NextResponse.json({ success: false, error: 'Invalid plugin name.' }, { status: 400 });
    }

    const result = await findServer(id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { type: serverType } = result;
    const isPaper = serverType === 'PAPER';
    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const filePath = path.join(folderPath, folderName, pluginName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" erfolgreich entfernt.` });
    } else {
      return NextResponse.json({ success: false, error: 'Plugin-Datei nicht gefunden.' }, { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
