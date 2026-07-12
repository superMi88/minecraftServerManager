import { NextRequest, NextResponse } from 'next/server';
import { getServerFolderPath } from '@/lib/server-manager';
import { findServer, getHandler } from '@/lib/servers/registry';

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const result = await findServer(id);

    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { server, type } = result;
    const handler = getHandler(type);
    const content = await handler.getProperties(getServerFolderPath(id), server);

    return NextResponse.json({ success: true, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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

    const result = await findServer(id);

    if (!result) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    const { server, type } = result;
    const handler = getHandler(type);
    await handler.saveProperties(getServerFolderPath(id), content, server);

    return NextResponse.json({ success: true, message: 'Einstellungen erfolgreich gespeichert.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
