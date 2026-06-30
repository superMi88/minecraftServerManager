import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ZIPS_DIR = path.join(UPLOADS_DIR, 'zips');
const JARS_DIR = path.join(UPLOADS_DIR, 'jars');

// Helper to ensure upload directories exist
function ensureDirs() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(ZIPS_DIR)) fs.mkdirSync(ZIPS_DIR, { recursive: true });
  if (!fs.existsSync(JARS_DIR)) fs.mkdirSync(JARS_DIR, { recursive: true });
}

// GET all uploaded files
export async function GET() {
  try {
    ensureDirs();

    const readFilesFromDir = (dirPath: string, allowedExt: string) => {
      if (!fs.existsSync(dirPath)) return [];
      const files = fs.readdirSync(dirPath);
      return files
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ext === allowedExt && file !== '.gitkeep';
        })
        .map((file) => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            createdAt: stats.mtime,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    };

    const zips = readFilesFromDir(ZIPS_DIR, '.zip');
    const jars = readFilesFromDir(JARS_DIR, '.jar');

    return NextResponse.json({ success: true, zips, jars });
  } catch (error: any) {
    console.error('Error fetching uploads:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST upload new ZIP or JAR
export async function POST(request: NextRequest) {
  try {
    ensureDirs();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    const filename = path.basename(file.name);
    const ext = path.extname(filename).toLowerCase();
    
    // Sanitize filename to avoid directory traversal or bad characters
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (ext !== '.zip' && ext !== '.jar') {
      return NextResponse.json({ success: false, error: 'Only .zip and .jar files are allowed.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const targetDir = ext === '.zip' ? ZIPS_DIR : JARS_DIR;
    const targetPath = path.join(targetDir, sanitizedFilename);

    fs.writeFileSync(targetPath, buffer);

    return NextResponse.json({
      success: true,
      message: `File "${sanitizedFilename}" uploaded successfully.`,
      filename: sanitizedFilename,
      type: ext === '.zip' ? 'ZIP' : 'JAR',
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE an uploaded file
export async function DELETE(request: NextRequest) {
  try {
    ensureDirs();

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const type = searchParams.get('type'); // 'zip' or 'jar'

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Parameters name and type are required.' }, { status: 400 });
    }

    const filename = path.basename(name);
    const ext = path.extname(filename).toLowerCase();

    if (type !== 'zip' && type !== 'jar') {
      return NextResponse.json({ success: false, error: 'Invalid type parameter. Must be "zip" or "jar".' }, { status: 400 });
    }

    if (type === 'zip' && ext !== '.zip') {
      return NextResponse.json({ success: false, error: 'Filename does not match zip extension.' }, { status: 400 });
    }

    if (type === 'jar' && ext !== '.jar') {
      return NextResponse.json({ success: false, error: 'Filename does not match jar extension.' }, { status: 400 });
    }

    const targetDir = type === 'zip' ? ZIPS_DIR : JARS_DIR;
    const filePath = path.join(targetDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File not found.' }, { status: 404 });
    }

    fs.unlinkSync(filePath);

    return NextResponse.json({ success: true, message: `File "${filename}" deleted successfully.` });
  } catch (error: any) {
    console.error('Delete Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
