import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const CURSEFORGE_DIR = path.join(UPLOADS_DIR, 'curseforge');
const MC_DIR = path.join(UPLOADS_DIR, 'minecraft');
const MC_JARS_DIR = path.join(MC_DIR, 'jars');
const MC_PLUGINS_DIR = path.join(MC_DIR, 'plugins');
const METADATA_FILE = path.join(UPLOADS_DIR, 'metadata.json');

// Legacy directories for auto-migration
const LEGACY_ZIPS_DIR = path.join(UPLOADS_DIR, 'zips');
const LEGACY_JARS_DIR = path.join(UPLOADS_DIR, 'jars');
const LEGACY_PLUGINS_DIR = path.join(UPLOADS_DIR, 'plugins');

interface FileMeta {
  description?: string;
  updatedAt?: string;
}

interface MetadataStore {
  curseforge: Record<string, FileMeta>;
  minecraftJars: Record<string, FileMeta>;
  minecraftPlugins: Record<string, FileMeta>;
}

function loadMetadata(): MetadataStore {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const content = fs.readFileSync(METADATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        curseforge: parsed.curseforge || {},
        minecraftJars: parsed.minecraftJars || parsed.minecraft?.jars || {},
        minecraftPlugins: parsed.minecraftPlugins || parsed.minecraft?.plugins || {},
      };
    }
  } catch (err) {
    console.error('Error reading metadata.json:', err);
  }
  return {
    curseforge: {},
    minecraftJars: {},
    minecraftPlugins: {},
  };
}

function saveMetadata(meta: MetadataStore) {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing metadata.json:', err);
  }
}

// Ensure upload directories exist and migrate legacy files if any
function ensureDirsAndMigrate() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(CURSEFORGE_DIR)) fs.mkdirSync(CURSEFORGE_DIR, { recursive: true });
  if (!fs.existsSync(MC_DIR)) fs.mkdirSync(MC_DIR, { recursive: true });
  if (!fs.existsSync(MC_JARS_DIR)) fs.mkdirSync(MC_JARS_DIR, { recursive: true });
  if (!fs.existsSync(MC_PLUGINS_DIR)) fs.mkdirSync(MC_PLUGINS_DIR, { recursive: true });

  // Migrate legacy zips -> curseforge
  if (fs.existsSync(LEGACY_ZIPS_DIR) && LEGACY_ZIPS_DIR !== CURSEFORGE_DIR) {
    try {
      const files = fs.readdirSync(LEGACY_ZIPS_DIR);
      for (const f of files) {
        if (f !== '.gitkeep') {
          const src = path.join(LEGACY_ZIPS_DIR, f);
          const dest = path.join(CURSEFORGE_DIR, f);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      }
    } catch (err) {
      console.error('Error migrating legacy zips:', err);
    }
  }

  // Migrate legacy jars -> minecraft/jars
  if (fs.existsSync(LEGACY_JARS_DIR) && LEGACY_JARS_DIR !== MC_JARS_DIR) {
    try {
      const files = fs.readdirSync(LEGACY_JARS_DIR);
      for (const f of files) {
        if (f !== '.gitkeep') {
          const src = path.join(LEGACY_JARS_DIR, f);
          const dest = path.join(MC_JARS_DIR, f);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      }
    } catch (err) {
      console.error('Error migrating legacy jars:', err);
    }
  }

  // Migrate legacy plugins -> minecraft/plugins
  if (fs.existsSync(LEGACY_PLUGINS_DIR) && LEGACY_PLUGINS_DIR !== MC_PLUGINS_DIR) {
    try {
      const files = fs.readdirSync(LEGACY_PLUGINS_DIR);
      for (const f of files) {
        if (f !== '.gitkeep') {
          const src = path.join(LEGACY_PLUGINS_DIR, f);
          const dest = path.join(MC_PLUGINS_DIR, f);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      }
    } catch (err) {
      console.error('Error migrating legacy plugins:', err);
    }
  }
}

function getTargetInfo(type: string | null, ext: string): { dir: string; metaKey: keyof MetadataStore } {
  const normType = (type || '').toLowerCase();
  if (normType === 'curseforge' || normType === 'zip' || ext === '.zip') {
    return { dir: CURSEFORGE_DIR, metaKey: 'curseforge' };
  }
  if (normType === 'plugin') {
    return { dir: MC_PLUGINS_DIR, metaKey: 'minecraftPlugins' };
  }
  return { dir: MC_JARS_DIR, metaKey: 'minecraftJars' };
}

// GET all uploaded files
export async function GET() {
  try {
    ensureDirsAndMigrate();
    const meta = loadMetadata();

    const readFilesFromDir = (dirPath: string, allowedExt: string, metaKey: keyof MetadataStore) => {
      if (!fs.existsSync(dirPath)) return [];
      const files = fs.readdirSync(dirPath);
      return files
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return ext === allowedExt && file !== '.gitkeep' && !file.startsWith('tmp_upload_');
        })
        .map((file) => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          const fileMeta = meta[metaKey]?.[file];
          return {
            name: file,
            size: stats.size,
            createdAt: stats.mtime,
            description: fileMeta?.description || '',
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    const curseforge = readFilesFromDir(CURSEFORGE_DIR, '.zip', 'curseforge');
    const jars = readFilesFromDir(MC_JARS_DIR, '.jar', 'minecraftJars');
    const plugins = readFilesFromDir(MC_PLUGINS_DIR, '.jar', 'minecraftPlugins');

    return NextResponse.json({
      success: true,
      curseforge,
      minecraft: {
        jars,
        plugins,
      },
      // Convenience aliases
      zips: curseforge,
      jars,
      plugins,
    });
  } catch (error) {
    console.error('Error fetching uploads:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST upload new CurseForge zip, Minecraft jar, or Minecraft plugin
export async function POST(request: NextRequest) {
  try {
    ensureDirsAndMigrate();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Keine Datei hochgeladen.' }, { status: 400 });
    }

    const chunkIndexStr = formData.get('chunkIndex') as string | null;
    const totalChunksStr = formData.get('totalChunks') as string | null;
    const originalName = formData.get('originalName') as string | null;
    const uploadType = formData.get('uploadType') as string | null; // 'curseforge' | 'zip' | 'jar' | 'plugin'
    const description = (formData.get('description') as string | null)?.trim() || '';

    const isChunked = chunkIndexStr !== null && totalChunksStr !== null && originalName !== null;

    if (isChunked) {
      const chunkIndex = parseInt(chunkIndexStr!, 10);
      const totalChunks = parseInt(totalChunksStr!, 10);
      const filename = path.basename(originalName!);
      const ext = path.extname(filename).toLowerCase();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      if (ext !== '.zip' && ext !== '.jar') {
        return NextResponse.json({ success: false, error: 'Nur .zip und .jar Dateien sind erlaubt.' }, { status: 400 });
      }

      const { dir: targetDir, metaKey } = getTargetInfo(uploadType, ext);

      const tmpDirName = `tmp_upload_${sanitizedFilename}`;
      const tmpDirPath = path.join(targetDir, tmpDirName);

      if (chunkIndex === 0) {
        if (fs.existsSync(tmpDirPath)) {
          fs.rmSync(tmpDirPath, { recursive: true, force: true });
        }
        fs.mkdirSync(tmpDirPath, { recursive: true });
      } else if (!fs.existsSync(tmpDirPath)) {
        return NextResponse.json({ success: false, error: 'Upload-Sitzung abgelaufen. Bitte neu starten.' }, { status: 400 });
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
            throw new Error(`Fehlender Chunk-Teil ${i}`);
          }
          const chunkData = fs.readFileSync(partPath);
          fs.appendFileSync(finalPath, chunkData);
        }

        // Clean up tmp directory
        fs.rmSync(tmpDirPath, { recursive: true, force: true });

        // Save description if provided
        if (description) {
          const meta = loadMetadata();
          meta[metaKey][sanitizedFilename] = {
            description,
            updatedAt: new Date().toISOString(),
          };
          saveMetadata(meta);
        }

        return NextResponse.json({
          success: true,
          message: `Datei "${sanitizedFilename}" erfolgreich hochgeladen.`,
          filename: sanitizedFilename,
          description,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} empfangen.`,
      });
    } else {
      // Standard single-file upload
      const filename = path.basename(file.name);
      const ext = path.extname(filename).toLowerCase();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      if (ext !== '.zip' && ext !== '.jar') {
        return NextResponse.json({ success: false, error: 'Nur .zip und .jar Dateien sind erlaubt.' }, { status: 400 });
      }

      const { dir: targetDir, metaKey } = getTargetInfo(uploadType, ext);
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const targetPath = path.join(targetDir, sanitizedFilename);
      fs.writeFileSync(targetPath, buffer);

      if (description) {
        const meta = loadMetadata();
        meta[metaKey][sanitizedFilename] = {
          description,
          updatedAt: new Date().toISOString(),
        };
        saveMetadata(meta);
      }

      return NextResponse.json({
        success: true,
        message: `Datei "${sanitizedFilename}" erfolgreich hochgeladen.`,
        filename: sanitizedFilename,
        description,
      });
    }
  } catch (error) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH update file description
export async function PATCH(request: NextRequest) {
  try {
    ensureDirsAndMigrate();
    const body = await request.json();
    const { name, type, description } = body;

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Name und Typ sind erforderlich.' }, { status: 400 });
    }

    const filename = path.basename(name);
    const ext = path.extname(filename).toLowerCase();
    const { dir, metaKey } = getTargetInfo(type, ext);

    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'Datei nicht gefunden.' }, { status: 404 });
    }

    const meta = loadMetadata();
    meta[metaKey][filename] = {
      description: (description || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    saveMetadata(meta);

    return NextResponse.json({
      success: true,
      message: 'Beschreibung erfolgreich aktualisiert.',
      name: filename,
      description: meta[metaKey][filename].description,
    });
  } catch (error) {
    console.error('PATCH Upload Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE an uploaded file
export async function DELETE(request: NextRequest) {
  try {
    ensureDirsAndMigrate();

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const type = searchParams.get('type'); // 'curseforge' | 'zip' | 'jar' | 'plugin'

    if (!name || !type) {
      return NextResponse.json({ success: false, error: 'Parameter name und type sind erforderlich.' }, { status: 400 });
    }

    const filename = path.basename(name);
    const ext = path.extname(filename).toLowerCase();
    const { dir, metaKey } = getTargetInfo(type, ext);

    const filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'Datei nicht gefunden.' }, { status: 404 });
    }

    fs.unlinkSync(filePath);

    // Clean up metadata
    const meta = loadMetadata();
    if (meta[metaKey]?.[filename]) {
      delete meta[metaKey][filename];
      saveMetadata(meta);
    }

    return NextResponse.json({ success: true, message: `Datei "${filename}" erfolgreich gelöscht.` });
  } catch (error) {
    console.error('Delete Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
