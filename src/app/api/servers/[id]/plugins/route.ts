import { NextRequest, NextResponse } from 'next/server';
import { getServerFolderPath } from '@/lib/server-manager';
import path from 'path';
import fs from 'fs';

type Params = Promise<{ id: string }>;

// GET all plugins in servers/[id]/plugins
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const folderPath = getServerFolderPath(id);
    const pluginsPath = path.join(folderPath, 'plugins');

    if (!fs.existsSync(pluginsPath)) {
      return NextResponse.json({ success: true, plugins: [] });
    }

    const files = fs.readdirSync(pluginsPath);
    // Filter for only .jar files
    const jarFiles = files.filter((file) => file.toLowerCase().endsWith('.jar'));

    return NextResponse.json({ success: true, plugins: jarFiles });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE a specific plugin
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const pluginName = searchParams.get('name');

    if (!pluginName) {
      return NextResponse.json({ success: false, error: 'Plugin name parameter is required.' }, { status: 400 });
    }

    // Security check: no path traversal
    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return NextResponse.json({ success: false, error: 'Invalid plugin name.' }, { status: 400 });
    }

    const folderPath = getServerFolderPath(id);
    const filePath = path.join(folderPath, 'plugins', pluginName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" deleted successfully.` });
    } else {
      return NextResponse.json({ success: false, error: 'Plugin file not found.' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
