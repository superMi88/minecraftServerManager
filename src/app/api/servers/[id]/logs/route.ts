import { NextRequest, NextResponse } from 'next/server';
import { getConsoleLogs, isServerRunning } from '@/lib/server-manager';

type Params = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 60;

    const logs = getConsoleLogs(id, limit);
    const isRunning = isServerRunning(id);

    return NextResponse.json({
      success: true,
      logs,
      isRunning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
