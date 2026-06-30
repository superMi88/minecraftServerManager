import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerFolderPath, createServerProperties } from '@/lib/server-manager';
import path from 'path';
import fs from 'fs';

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    let server: any = await prisma.minecraftServer.findUnique({
      where: { id },
    });

    if (!server) {
      server = await prisma.curseForgeServer.findUnique({
        where: { id },
      });
    }

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found.' }, { status: 404 });
    }

    const folderPath = getServerFolderPath(id);
    const propertiesPath = path.join(folderPath, 'server.properties');

    if (!fs.existsSync(propertiesPath)) {
      createServerProperties(folderPath, server.port);
    }

    const content = fs.readFileSync(propertiesPath, 'utf-8');
    return NextResponse.json({ success: true, content });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (content === undefined) {
      return NextResponse.json({ success: false, error: 'Content parameter is required.' }, { status: 400 });
    }

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

    const folderPath = getServerFolderPath(id);
    const propertiesPath = path.join(folderPath, 'server.properties');

    fs.writeFileSync(propertiesPath, content);

    // Sync database cache if necessary
    if (serverType === 'PAPER') {
      await prisma.minecraftServer.update({
        where: { id },
        data: { serverProperties: content },
      });
    } else {
      await prisma.curseForgeServer.update({
        where: { id },
        data: { serverProperties: content },
      });
    }

    return NextResponse.json({ success: true, message: 'server.properties saved successfully.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
