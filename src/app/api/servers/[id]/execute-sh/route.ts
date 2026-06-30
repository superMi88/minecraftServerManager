import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  startScriptProcess,
  sendScriptInput,
  stopScriptProcess,
  getScriptConsoleLog,
  runningScripts,
  isServerRunning,
} from '@/lib/server-manager';

type Params = Promise<{ id: string }>;

// POST: Start running a script in the background
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { scriptName } = body;

    if (!scriptName || !scriptName.endsWith('.sh')) {
      return NextResponse.json(
        { success: false, error: 'Ungültiger Skriptname. Es muss eine .sh Datei sein.' },
        { status: 400 }
      );
    }

    // Verify server exists
    const server = await prisma.curseForgeServer.findUnique({
      where: { id },
    });

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server nicht gefunden.' }, { status: 404 });
    }

    // Ensure server is not running
    if (isServerRunning(id)) {
      return NextResponse.json(
        { success: false, error: 'Der Server muss gestoppt sein, um ein Skript auszuführen.' },
        { status: 400 }
      );
    }

    const result = await startScriptProcess(id, scriptName);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Skript gestartet.' });
  } catch (error: any) {
    console.error('Error starting script:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET: Retrieve execution logs and active status of the script
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;

    // Check if script is currently registered in runningScripts Map
    const running = runningScripts.get(id);
    const logs = getScriptConsoleLog(id);

    return NextResponse.json({
      success: true,
      isRunning: running ? !running.exited : false,
      exitCode: running ? running.exitCode : null,
      logs: logs,
    });
  } catch (error: any) {
    console.error('Error fetching script status:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT: Write input to script's stdin
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { input } = body;

    if (input === undefined) {
      return NextResponse.json({ success: false, error: 'Input parameter is required.' }, { status: 400 });
    }

    const result = sendScriptInput(id, input);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending input to script:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: Force kill/stop a running script
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;

    const result = stopScriptProcess(id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Skript wurde abgebrochen.' });
  } catch (error: any) {
    console.error('Error stopping script:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
