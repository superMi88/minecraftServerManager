import { NextRequest, NextResponse } from 'next/server';
import { startServer, stopServer } from '@/lib/server-manager';

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: 'Action parameter is required.' }, { status: 400 });
    }

    if (action === 'START') {
      const result = await startServer(id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    } else if (action === 'STOP') {
      const result = await stopServer(id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    } else if (action === 'RESTART') {
      await stopServer(id);
      // Wait a tiny bit for cleanup, then start
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await startServer(id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action. Supported: START, STOP, RESTART' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error controlling server:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
