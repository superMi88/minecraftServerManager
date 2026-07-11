import { NextRequest, NextResponse } from 'next/server';
import { getServerFolderPath } from '@/lib/server-manager';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

type Params = Promise<{ id: string }>;

// GET all plugins/mods in server folder
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    
    // Check server existence & determine type
    let server: import('@prisma/client').MinecraftServer | import('@prisma/client').CurseForgeServer | null =
      await prisma.minecraftServer.findUnique({ where: { id } });
    const isPaper = !!server;
    if (!server) {
      server = await prisma.curseForgeServer.findUnique({ where: { id } });
    }
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const pluginsPath = path.join(folderPath, folderName);

    if (!fs.existsSync(pluginsPath)) {
      return NextResponse.json({ success: true, plugins: [] });
    }

    const files = fs.readdirSync(pluginsPath);
    // Filter for only .jar files
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

    // Security check: no path traversal
    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return NextResponse.json({ success: false, error: 'Invalid plugin name.' }, { status: 400 });
    }

    // Check server existence & determine type
    let server: import('@prisma/client').MinecraftServer | import('@prisma/client').CurseForgeServer | null =
      await prisma.minecraftServer.findUnique({ where: { id } });
    const isPaper = !!server;
    if (!server) {
      server = await prisma.curseForgeServer.findUnique({ where: { id } });
    }
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const serverDir = path.join(folderPath, folderName);
    const targetPath = path.join(serverDir, pluginName);

    if (selected) {
      // Copy plugin from global storage to server folder
      const globalPluginPath = path.join(process.cwd(), 'uploads', 'plugins', pluginName);
      if (!fs.existsSync(globalPluginPath)) {
        return NextResponse.json({ success: false, error: 'Global plugin file not found.' }, { status: 404 });
      }

      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
      }

      fs.copyFileSync(globalPluginPath, targetPath);
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" enabled successfully.` });
    } else {
      // Delete plugin from server folder
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" disabled successfully.` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE a specific plugin directly (existing endpoint fallback)
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

    let server: import('@prisma/client').MinecraftServer | import('@prisma/client').CurseForgeServer | null =
      await prisma.minecraftServer.findUnique({ where: { id } });
    const isPaper = !!server;
    if (!server) {
      server = await prisma.curseForgeServer.findUnique({ where: { id } });
    }
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    const folderPath = getServerFolderPath(id);
    const folderName = isPaper ? 'plugins' : 'mods';
    const filePath = path.join(folderPath, folderName, pluginName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: `Plugin "${pluginName}" deleted successfully.` });
    } else {
      return NextResponse.json({ success: false, error: 'Plugin file not found.' }, { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
