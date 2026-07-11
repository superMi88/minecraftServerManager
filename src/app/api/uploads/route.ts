import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const ZIPS_DIR = path.join(UPLOADS_DIR, 'zips');
const JARS_DIR = path.join(UPLOADS_DIR, 'jars');
const PLUGINS_DIR = path.join(UPLOADS_DIR, 'plugins');

// Helper to ensure upload directories exist
function ensureDirs() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(ZIPS_DIR)) fs.mkdirSync(ZIPS_DIR, { recursive: true });
  if (!fs.existsSync(JARS_DIR)) fs.mkdirSync(JARS_DIR, { recursive: true });
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
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
    const plugins = readFilesFromDir(PLUGINS_DIR, '.jar');

    return NextResponse.json({ success: true, zips, jars, plugins });
  } catch (error) {
    console.error('Error fetching uploads:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST upload new ZIP, JAR, or Plugin
export async function POST(request: NextRequest) {
  try {
    ensureDirs();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    const chunkIndexStr = formData.get('chunkIndex') as string | null;
    const totalChunksStr = formData.get('totalChunks') as string | null;
    const originalName = formData.get('originalName') as string | null;
    const uploadType = formData.get('uploadType') as string | null; // 'zip' | 'jar' | 'plugin'

    const isChunked = chunkIndexStr !== null && totalChunksStr !== null && originalName !== null;

    if (isChunked) {
      const chunkIndex = parseInt(chunkIndexStr!, 10);
      const totalChunks = parseInt(totalChunksStr!, 10);
      const filename = path.basename(originalName!);
      const ext = path.extname(filename).toLowerCase();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      if (ext !== '.zip' && ext !== '.jar') {
        return NextResponse.json({ success: false, error: 'Only .zip and .jar files are allowed.' }, { status: 400 });
      }

      let targetDir = JARS_DIR;
      if (uploadType === 'zip' || (!uploadType && ext === '.zip')) {
        targetDir = ZIPS_DIR;
      } else if (uploadType === 'plugin') {
        targetDir = PLUGINS_DIR;
      }

      const tmpDirName = `tmp_upload_${sanitizedFilename}`;
      const tmpDirPath = path.join(targetDir, tmpDirName);

      if (chunkIndex === 0) {
        if (fs.existsSync(tmpDirPath)) {
          fs.rmSync(tmpDirPath, { recursive: true, force: true });
        }
        fs.mkdirSync(tmpDirPath, { recursive: true });
      } else if (!fs.existsSync(tmpDirPath)) {
        return NextResponse.json({ success: false, error: 'Upload session not found. Please restart.' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const chunkPath = path.join(tmpDirPath, `part_${chunkIndex}`);
      fs.writeFileSync(chunkPath, buffer);

      if (chunkIndex + 1 === totalChunks) {
        const finalPath = path.join(targetDir, sanitizedFilename);
        
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }

        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(tmpDirPath, `part_${i}`);
          if (!fs.existsSync(partPath)) {
            throw new Error(`Missing chunk part ${i}`);
          }
          const chunkData = fs.readFileSync(partPath);
          fs.appendFileSync(finalPath, chunkData);
        }

        // Clean up tmp directory
        fs.rmSync(tmpDirPath, { recursive: true, force: true });

        return NextResponse.json({
          success: true,
          message: `File "${sanitizedFilename}" uploaded successfully.`,
          filename: sanitizedFilename,
          type: ext === '.zip' ? 'ZIP' : (uploadType === 'plugin' ? 'PLUGIN' : 'JAR'),
        });
      }

      return NextResponse.json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} received.`,
      });
    } else {
      // Standard single-file upload
      const filename = path.basename(file.name);
      const ext = path.extname(filename).toLowerCase();
      
      // Sanitize filename to avoid directory traversal or bad characters
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      if (ext !== '.zip' && ext !== '.jar') {
        return NextResponse.json({ success: false, error: 'Only .zip and .jar files are allowed.' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      let targetDir = JARS_DIR;
      if (uploadType === 'zip' || (!uploadType && ext === '.zip')) {
        targetDir = ZIPS_DIR;
      } else if (uploadType === 'plugin') {
        targetDir = PLUGINS_DIR;
      }
      
      const targetPath = path.join(targetDir, sanitizedFilename);
      fs.writeFileSync(targetPath, buffer);

      return NextResponse.json({
        success: true,
        message: `File "${sanitizedFilename}" uploaded successfully.`,
        filename: sanitizedFilename,
        type: ext === '.zip' ? 'ZIP' : (uploadType === 'plugin' ? 'PLUGIN' : 'JAR'),
      });
    }
  } catch (error) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE an uploaded file
export async function DELETE(request: NextRequest) {
  try {
    ensureDirs();

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const type = searchParams.get('type'); // 'zip' | 'jar' | 'plugin'

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Parameters name and type are required.' }, { status: 400 });
    }

    const filename = path.basename(name);
    const ext = path.extname(filename).toLowerCase();

    if (type !== 'zip' && type !== 'jar' && type !== 'plugin') {
      return NextResponse.json({ success: false, error: 'Invalid type parameter. Must be "zip", "jar" or "plugin".' }, { status: 400 });
    }

    if (type === 'zip' && ext !== '.zip') {
      return NextResponse.json({ success: false, error: 'Filename does not match zip extension.' }, { status: 400 });
    }

    if ((type === 'jar' || type === 'plugin') && ext !== '.jar') {
      return NextResponse.json({ success: false, error: 'Filename does not match jar extension.' }, { status: 400 });
    }

    let targetDir = JARS_DIR;
    if (type === 'zip') {
      targetDir = ZIPS_DIR;
    } else if (type === 'plugin') {
      targetDir = PLUGINS_DIR;
    }
    
    const filePath = path.join(targetDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File not found.' }, { status: 404 });
    }

    fs.unlinkSync(filePath);

    return NextResponse.json({ success: true, message: `File "${filename}" deleted successfully.` });
  } catch (error) {
    console.error('Delete Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
