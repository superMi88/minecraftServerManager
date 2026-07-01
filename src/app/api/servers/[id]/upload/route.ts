import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerFolderPath } from '@/lib/server-manager';
import path from 'path';
import fs from 'fs';
import unzipper from 'unzipper';

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    let server: {
      id: string;
      jarFile?: string | null;
      type?: string;
    } | null = await prisma.minecraftServer.findUnique({
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

    server.type = serverType;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const serverFolder = getServerFolderPath(id);

    if (server.type === 'PAPER') {
      // For Paper, we can upload plugins (.jar files) or the server jar itself (.jar files to root)
      const filename = file.name;
      
      // If it's the server.jar itself
      if (filename.toLowerCase() === 'server.jar' || filename === server.jarFile) {
        const filePath = path.join(serverFolder, filename);
        fs.writeFileSync(filePath, buffer);
        
        // Update DB
        await prisma.minecraftServer.update({
          where: { id },
          data: { jarFile: filename },
        });

        return NextResponse.json({ success: true, message: `Server JAR "${filename}" uploaded successfully.` });
      } else {
        // Otherwise, it's a plugin JAR
        if (!filename.toLowerCase().endsWith('.jar')) {
          return NextResponse.json({ success: false, error: 'Only .jar files are allowed for Paper Minecraft.' }, { status: 400 });
        }
        
        const pluginsFolder = path.join(serverFolder, 'plugins');
        if (!fs.existsSync(pluginsFolder)) {
          fs.mkdirSync(pluginsFolder, { recursive: true });
        }

        const filePath = path.join(pluginsFolder, filename);
        fs.writeFileSync(filePath, buffer);

        return NextResponse.json({ success: true, message: `Plugin "${filename}" uploaded successfully.` });
      }
    } else if (server.type === 'CURSEFORGE') {
      // For CurseForge, we expect a ZIP file containing the server pack
      const filename = file.name;
      if (!filename.toLowerCase().endsWith('.zip')) {
        return NextResponse.json({ success: false, error: 'Only .zip files are allowed for CurseForge.' }, { status: 400 });
      }

      const zipPath = path.join(serverFolder, filename);
      fs.writeFileSync(zipPath, buffer);

      // Now extract the ZIP file
      console.log(`Extracting CurseForge zip file to ${serverFolder}...`);
      
      try {
        const directory = await unzipper.Open.file(zipPath);
        const entries = directory.files;

        if (entries.length === 0) {
          throw new Error('ZIP file is empty.');
        }

        // Find if there's a common root folder in the zip file
        const firstEntryPath = entries[0].path;
        const rootFolder = firstEntryPath.split('/')[0];
        
        let allHaveCommonRoot = true;
        for (const entry of entries) {
          if (!entry.path.startsWith(rootFolder + '/') && entry.path !== rootFolder) {
            allHaveCommonRoot = false;
            break;
          }
        }

        // Extract each entry
        for (const entry of entries) {
          let relativePath = entry.path;
          if (allHaveCommonRoot && relativePath.startsWith(rootFolder + '/')) {
            relativePath = relativePath.slice(rootFolder.length + 1);
          }
          
          if (!relativePath) continue;

          const fullPath = path.join(serverFolder, relativePath);

          if (entry.type === 'Directory') {
            fs.mkdirSync(fullPath, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            
            await new Promise<void>((resolve, reject) => {
              entry.stream()
                .pipe(fs.createWriteStream(fullPath))
                .on('finish', resolve)
                .on('error', reject);
            });
          }
        }

        // Delete the temporary zip file
        fs.unlinkSync(zipPath);

        // Update DB
        await prisma.curseForgeServer.update({
          where: { id },
          data: { curseForgeZip: filename },
        });

        return NextResponse.json({ success: true, message: 'CurseForge zip file successfully extracted.' });
      } catch (err) {
        console.error('Error during zip extraction:', err);
        // Clean up zip if it exists
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ success: false, error: `Unzipping failed: ${message}` }, { status: 500 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Unknown server type.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
