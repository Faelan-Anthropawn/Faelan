import { readMCAFile, getBlockFromChunk } from './mca-reader.js';
import { BlockStream } from './block-stream.js';

async function loadWorldRegions(zipFile) {
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(zipFile);
  
  const mcrPattern = /\.mcr$/i;
  for (const [path, file] of Object.entries(unzipped.files)) {
    if (mcrPattern.test(path) && !file.dir) {
      throw new Error('OLD_WORLD_FORMAT');
    }
  }
  
  const mcaFiles = {};
  const regionPattern = /\/region\/r\.(-?\d+)\.(-?\d+)\.mca$/;
  
  for (const [path, file] of Object.entries(unzipped.files)) {
    const match = path.match(regionPattern);
    if (match && !file.dir) {
      const regionX = parseInt(match[1]);
      const regionZ = parseInt(match[2]);
      const arrayBuffer = await file.async('arraybuffer');
      
      const key = `${regionX},${regionZ}`;
      mcaFiles[key] = { x: regionX, z: regionZ, data: arrayBuffer };
      console.log(`Found region file: ${path} -> region (${regionX}, ${regionZ})`);
    }
  }
  
  console.log(`Total region files loaded: ${Object.keys(mcaFiles).length}`);
  return mcaFiles;
}

function getRegionCoords(blockX, blockZ) {
  return {
    regionX: Math.floor(blockX / 512),
    regionZ: Math.floor(blockZ / 512)
  };
}

function getChunkCoords(blockX, blockZ) {
  return {
    chunkX: Math.floor(blockX / 16),
    chunkZ: Math.floor(blockZ / 16)
  };
}

function getLocalChunkCoords(chunkX, chunkZ) {
  return {
    localX: ((chunkX % 32) + 32) % 32,
    localZ: ((chunkZ % 32) + 32) % 32
  };
}

async function extractRegionStreaming(mcaFiles, x1, y1, z1, x2, y2, z2, onBlock, onProgress) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const length = maxZ - minZ + 1;
  
  if (onProgress) {
    onProgress({ 
      stage: 'Analyzing', 
      message: `Region size: ${width}x${height}x${length} blocks` 
    });
  }
  
  const neededRegions = new Set();
  const minChunkX = Math.floor(minX / 16);
  const maxChunkX = Math.floor(maxX / 16);
  const minChunkZ = Math.floor(minZ / 16);
  const maxChunkZ = Math.floor(maxZ / 16);
  
  for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
      const regionX = Math.floor(chunkX / 32);
      const regionZ = Math.floor(chunkZ / 32);
      neededRegions.add(`${regionX},${regionZ}`);
    }
  }
  
  if (onProgress) {
    onProgress({ 
      stage: 'Loading', 
      message: `Loading ${neededRegions.size} region file(s)...` 
    });
  }
  
  const parsedRegions = new Map();
  let regionCount = 0;
  
  for (const regionKey of neededRegions) {
    if (!mcaFiles[regionKey]) {
      console.warn(`Region ${regionKey} not found in world files`);
      continue;
    }
    
    regionCount++;
    if (onProgress) {
      onProgress({ 
        stage: 'Parsing', 
        message: `Parsing region ${regionCount}/${neededRegions.size}...` 
      });
    }
    
    const chunks = await readMCAFile(mcaFiles[regionKey].data);
    const [rx, rz] = regionKey.split(',').map(Number);
    
    for (const [chunkKey, chunkData] of chunks) {
      const [localX, localZ] = chunkKey.split(',').map(Number);
      const absoluteChunkX = rx * 32 + localX;
      const absoluteChunkZ = rz * 32 + localZ;
      parsedRegions.set(`${absoluteChunkX},${absoluteChunkZ}`, chunkData);
    }
  }
  
  if (onProgress) {
    onProgress({ 
      stage: 'Extracting', 
      message: `Extracting blocks from ${parsedRegions.size} chunks...` 
    });
  }
  
  let blocksProcessed = 0;
  const totalBlocks = width * height * length;
  let lastProgress = 0;
  
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const { chunkX, chunkZ } = getChunkCoords(x, z);
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = parsedRegions.get(chunkKey);
        
        let blockName = 'minecraft:air';
        if (chunk) {
          const localX = ((x % 16) + 16) % 16;
          const localZ = ((z % 16) + 16) % 16;
          const foundBlock = getBlockFromChunk(chunk, localX, y, localZ);
          if (foundBlock) {
            blockName = foundBlock;
          }
        }
        
        onBlock(blockName);
        
        blocksProcessed++;
        const progress = Math.floor((blocksProcessed / totalBlocks) * 100);
        if (progress > lastProgress && progress % 10 === 0) {
          lastProgress = progress;
          if (onProgress) {
            onProgress({ 
              stage: 'Extracting', 
              message: `${progress}% complete (${blocksProcessed.toLocaleString()}/${totalBlocks.toLocaleString()} blocks)` 
            });
          }
        }
      }
    }
  }
  
  return { width, height, length };
}

async function extractRegion(mcaFiles, x1, y1, z1, x2, y2, z2, onProgress) {
  const blocks = [];
  const palette = new Map();
  palette.set('minecraft:air', 0);
  let paletteIndex = 1;
  
  const result = await extractRegionStreaming(
    mcaFiles, x1, y1, z1, x2, y2, z2,
    (blockName) => {
      if (!palette.has(blockName)) {
        palette.set(blockName, paletteIndex++);
      }
      blocks.push(palette.get(blockName));
    },
    onProgress
  );
  
  const paletteArray = Array.from(palette.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);
  
  const blockObjects = blocks.map((paletteIdx, i) => {
    const x = i % result.width;
    const z = Math.floor((i % (result.width * result.length)) / result.width);
    const y = Math.floor(i / (result.width * result.length));
    return { x, y, z, block: paletteIdx };
  });
  
  return {
    ...result,
    blocks: blockObjects,
    palette: paletteArray,
    offset: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) }
  };
}

async function createBlockStreamFromWorld(mcaFiles, x1, y1, z1, x2, y2, z2, onProgress) {
  const blockStream = new BlockStream();
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const length = maxZ - minZ + 1;
  
  setTimeout(async () => {
    try {
      blockStream.emitMetadata({ width, height, length });
      
      if (onProgress) {
        onProgress({ stage: 'Analyzing', message: `Region size: ${width}x${height}x${length} blocks` });
      }
      
      const neededRegions = new Set();
      const minChunkX = Math.floor(minX / 16);
      const maxChunkX = Math.floor(maxX / 16);
      const minChunkZ = Math.floor(minZ / 16);
      const maxChunkZ = Math.floor(maxZ / 16);
      
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
        for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
          const regionX = Math.floor(chunkX / 32);
          const regionZ = Math.floor(chunkZ / 32);
          neededRegions.add(`${regionX},${regionZ}`);
        }
      }
      
      if (onProgress) {
        onProgress({ stage: 'Loading', message: `Loading ${neededRegions.size} region file(s)...` });
      }
      
      const parsedRegions = new Map();
      let regionCount = 0;
      
      for (const regionKey of neededRegions) {
        if (!mcaFiles[regionKey]) {
          console.warn(`Region ${regionKey} not found in world files`);
          continue;
        }
        
        regionCount++;
        if (onProgress) {
          onProgress({ stage: 'Parsing', message: `Parsing region ${regionCount}/${neededRegions.size}...` });
        }
        
        const chunks = await readMCAFile(mcaFiles[regionKey].data);
        const [rx, rz] = regionKey.split(',').map(Number);
        
        for (const [chunkKey, chunkData] of chunks) {
          const [localX, localZ] = chunkKey.split(',').map(Number);
          const absoluteChunkX = rx * 32 + localX;
          const absoluteChunkZ = rz * 32 + localZ;
          parsedRegions.set(`${absoluteChunkX},${absoluteChunkZ}`, chunkData);
        }
      }
      
      if (onProgress) {
        onProgress({ stage: 'Extracting', message: `Extracting blocks from ${parsedRegions.size} chunks...` });
      }
      
      let blocksProcessed = 0;
      const totalBlocks = width * height * length;
      let lastProgress = 0;
      
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            const { chunkX, chunkZ } = getChunkCoords(x, z);
            const chunkKey = `${chunkX},${chunkZ}`;
            const chunk = parsedRegions.get(chunkKey);
            
            let blockState = 'minecraft:air';
            if (chunk) {
              const localX = ((x % 16) + 16) % 16;
              const localZ = ((z % 16) + 16) % 16;
              const foundBlock = getBlockFromChunk(chunk, localX, y, localZ);
              if (foundBlock) {
                blockState = foundBlock;
              }
            }
            
            blockStream.emitBlock(x - minX, y - minY, z - minZ, blockState);
            
            blocksProcessed++;
            const progress = Math.floor((blocksProcessed / totalBlocks) * 100);
            if (progress > lastProgress && progress % 10 === 0) {
              lastProgress = progress;
              if (onProgress) {
                onProgress({ 
                  stage: 'Extracting', 
                  message: `${progress}% complete (${blocksProcessed.toLocaleString()}/${totalBlocks.toLocaleString()} blocks)` 
                });
              }
            }
          }
        }
      }
      
      blockStream.emitComplete();
    } catch (error) {
      console.error('Error in block stream:', error);
      throw error;
    }
  }, 0);
  
  return blockStream;
}

export { loadWorldRegions, extractRegion, extractRegionStreaming, getRegionCoords, getChunkCoords, createBlockStreamFromWorld };
