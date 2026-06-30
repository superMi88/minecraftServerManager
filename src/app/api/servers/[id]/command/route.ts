import { NextRequest, NextResponse } from 'next/server';
import { sendCommand } from '@/lib/server-manager';

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return NextResponse.json({ success: false, error: 'Command parameter is required.' }, { status: 400 });
    }

    const result = sendCommand(id, command);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
