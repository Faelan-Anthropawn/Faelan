import { coordsXZY } from './schematic-reader.js';
import { generateChunkCommands } from './command-writer.js';
import { createNbtBuffer, convertCommandsToStructure } from './structure-converter.js';

function uuid() {
  return crypto.randomUUID();
}

let packBaseCache = null;
async function loadPackBase() {
  if (packBaseCache) return packBaseCache;
  
  const response = await fetch('pack_base.zip');
  const blob = await response.blob();
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(blob);
  
  packBaseCache = {
    manifest: JSON.parse(await unzipped.file('manifest.json').async('text')),
    builderScript: await unzipped.file('scripts/builder.js').async('text'),
    builderItem: await unzipped.file('items/builder.json').async('text'),
    packIcon: await unzipped.file('pack_icon.png').async('uint8array')
  };
  
  return packBaseCache;
}

const crc32Table = (() => {
  let t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return ~crc;
}

async function buildMcpack(schem, getKeyAt, packName, onProgress) {
  const CHUNK_SIZE = 40;
  const { width: w, height: h, length: l } = schem;

  if (onProgress) onProgress({ stage: 'loading', message: 'Loading pack base files...' });
  
  const packBase = await loadPackBase();

  if (onProgress) onProgress({ stage: 'analyzing', message: `Schematic dimensions: ${w}x${h}x${l}` });

  let schemMinX = Infinity, schemMinY = Infinity, schemMinZ = Infinity;
  const volume = w * h * l;
  for (let i = 0; i < volume; i++) {
    const k = getKeyAt(i);
    if (!k) continue;
    const [x, y, z] = coordsXZY(i, w, h, l);
    if (x < schemMinX) schemMinX = x;
    if (y < schemMinY) schemMinY = y;
    if (z < schemMinZ) schemMinZ = z;
  }
  if (schemMinX === Infinity) { schemMinX = 0; schemMinY = 0; schemMinZ = 0; }

  const chunksX = Math.ceil(w / CHUNK_SIZE);
  const chunksY = Math.ceil(h / CHUNK_SIZE);
  const chunksZ = Math.ceil(l / CHUNK_SIZE);
  const totalChunks = chunksX * chunksY * chunksZ;

  if (onProgress) onProgress({ stage: 'chunking', message: `Creating ${chunksX}x${chunksY}x${chunksZ} = ${totalChunks} chunks` });

  const chunkFiles = [];
  const chunkMetadata = [];
  let processedChunks = 0;
  let skippedAirChunks = 0;
  let totalProcessed = 0;

  for (let chunkY = 0; chunkY < chunksY; chunkY++) {
    for (let chunkZ = 0; chunkZ < chunksZ; chunkZ++) {
      for (let chunkX = 0; chunkX < chunksX; chunkX++) {
        const chunkName = `chunk_${chunkX}_${chunkY}_${chunkZ}`;
        const chunkFileName = `${chunkName}.mcstructure`;

        const minX = chunkX * CHUNK_SIZE;
        const minY = chunkY * CHUNK_SIZE;
        const minZ = chunkZ * CHUNK_SIZE;
        const maxX = Math.min(minX + CHUNK_SIZE - 1, w - 1);
        const maxY = Math.min(minY + CHUNK_SIZE - 1, h - 1);
        const maxZ = Math.min(minZ + CHUNK_SIZE - 1, l - 1);

        const chunkBounds = { minX, minY, minZ, maxX, maxY, maxZ };
        const commands = generateChunkCommands(schem, getKeyAt, chunkBounds, { useRelativeCoords: true });

        if (commands.length > 0) {
          const chunkHasBarriers = getKeyAt.belowBoundsBarriers &&
            getKeyAt.belowBoundsBarriers.some(b =>
              b.x >= minX && b.x <= maxX && b.z >= minZ && b.z <= maxZ
            );

          const baseY = chunkHasBarriers ? 1 : 0;
          const structureHeight = chunkHasBarriers ? CHUNK_SIZE + 1 : CHUNK_SIZE;
          const structureData = convertCommandsToStructure(commands, {
            width: CHUNK_SIZE,
            height: structureHeight,
            length: CHUNK_SIZE,
            baseCoords: [0, baseY, 0]
          });

          if (structureData) {
            const nbtBuffer = createNbtBuffer(structureData);
            const nbtBytes = new Uint8Array(nbtBuffer);

            const gridX = chunkX * CHUNK_SIZE;
            const gridY = chunkY * CHUNK_SIZE;
            const gridZ = chunkZ * CHUNK_SIZE;
            const loadOffsetY = chunkHasBarriers ? gridY - 1 : gridY;

            chunkFiles.push({ path: `structures/${chunkFileName}`, data: nbtBytes });
            chunkMetadata.push({
              name: chunkName,
              filename: chunkFileName,
              loadOffset: [gridX, loadOffsetY, gridZ],
              commands: commands.length
            });

            processedChunks++;
          }
        } else {
          skippedAirChunks++;
        }
        
        totalProcessed++;
        
        if (onProgress && totalProcessed % 20 === 0) {
          onProgress({ 
            stage: 'chunking', 
            message: `Processing chunks: ${processedChunks} with data, ${skippedAirChunks} empty (${totalProcessed}/${totalChunks})`
          });
        }
        
        if (totalProcessed % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
  }

  if (onProgress) {
    onProgress({ 
      stage: 'chunking', 
      message: `Skipped ${skippedAirChunks} empty air chunks`
    });
  }
  
  if (onProgress) {
    onProgress({ 
      stage: 'chunking', 
      message: `Total chunks processed: ${totalChunks} (${processedChunks} with data + ${skippedAirChunks} skipped)`
    });
  }

  if (onProgress) onProgress({ stage: 'building', message: `Creating mcpack with ${chunkMetadata.length} structures` });

  const structureLoadCommands = [];
  for (const chunk of chunkMetadata) {
    const { name, loadOffset } = chunk;
    const [ox = 0, oy = 0, oz = 0] = loadOffset || [0, 0, 0];
    structureLoadCommands.push(`structure load ${name} ~${ox} ~${oy} ~${oz} 0_degrees none layer_by_layer 5`);
  }

  const MAX_LINES = 25;
  let fileCount = 0;
  let buffer = [];

  for (const command of structureLoadCommands) {
    buffer.push(command);
    if (buffer.length === MAX_LINES) {
      fileCount++;
      chunkFiles.push({
        path: `functions/load_structures_${fileCount}.mcfunction`,
        data: new TextEncoder().encode(buffer.join("\n"))
      });
      buffer.length = 0;
    }
  }
  if (buffer.length) {
    fileCount++;
    chunkFiles.push({
      path: `functions/load_structures_${fileCount}.mcfunction`,
      data: new TextEncoder().encode(buffer.join("\n"))
    });
  }

  const manifest = JSON.parse(JSON.stringify(packBase.manifest));
  manifest.header.name = packName;
  manifest.header.uuid = uuid();
  manifest.modules[0].uuid = uuid();
  manifest.modules[1].uuid = uuid();

  chunkFiles.push({
    path: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2))
  });

  const builderScript = packBase.builderScript.replace(
    /const MAX_FUNCTIONS = \d+;/,
    `const MAX_FUNCTIONS = ${fileCount};`
  );

  chunkFiles.push({
    path: 'scripts/builder.js',
    data: new TextEncoder().encode(builderScript)
  });

  chunkFiles.push({
    path: 'items/builder.json',
    data: new TextEncoder().encode(packBase.builderItem)
  });

  chunkFiles.push({
    path: 'pack_icon.png',
    data: packBase.packIcon
  });

  if (onProgress) onProgress({ stage: 'zipping', message: 'Creating ZIP archive...' });

  const zip = new JSZip();
  for (const file of chunkFiles) {
    zip.file(file.path, file.data);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  if (onProgress) onProgress({ stage: 'complete', message: `Pack created with ${chunkMetadata.length} structures!` });

  return blob;
}

export { buildMcpack };
