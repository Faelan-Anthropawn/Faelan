import { maybeDecompress, parseNBT, buildStateName, decodePackedBlockStates } from './schematic-reader.js';

async function litematicToWorldEdit(arrayBuffer, filename) {
  const buf = maybeDecompress(new Uint8Array(arrayBuffer));
  const root = parseNBT(buf);
  const dataVersion = root.MinecraftDataVersion ?? 2730;
  const regions = root.Regions;
  
  const regionEntries = Object.entries(regions);
  
  if (regionEntries.length === 0) {
    throw new Error("No regions found in litematic file");
  }
  
  const regionCount = regionEntries.length;
  
  if (regionEntries.length === 1) {
    return { buffer: convertSingleRegion(regionEntries[0][1], dataVersion), regionCount: 1 };
  }
  
  return { buffer: mergeRegions(regionEntries, dataVersion), regionCount };
}

function convertSingleRegion(region, dataVersion) {
  const size = region.Size;
  const pos = region.Position;
  const x = size.x, y = size.y, z = size.z;
  const offsetx = pos.x + (x < 0 ? x + 1 : 0);
  const offsety = pos.y + (y < 0 ? y + 1 : 0);
  const offsetz = pos.z + (z < 0 ? z + 1 : 0);

  const palette = region.BlockStatePalette;
  const paletteArr = palette.map(buildStateName);

  const longs = region.BlockStates;
  const bitsPerBlock = Math.max(2, 32 - Math.clz32(paletteArr.length - 1));
  const vol = Math.abs(x * y * z);
  const blockIds = decodePackedBlockStates(BigInt64Array.from(longs), vol, bitsPerBlock);

  const blockBytesArr = [];
  for (let i = 0; i < vol; i++) {
    let v = blockIds[i];
    while ((v & ~0x7F) !== 0) {
      blockBytesArr.push((v & 0x7F) | 0x80);
      v >>>= 7;
    }
    blockBytesArr.push(v & 0x7F);
  }
  const blockBytes = new Uint8Array(blockBytesArr);

  const wePalette = {};
  paletteArr.forEach((n, i) => { wePalette[n] = i; });

  const weTileEntities = [];
  for (const t of region.TileEntities || []) {
    const tx = t.x, ty = t.y, tz = t.z;
    const id = t.id;
    const copy = { ...t };
    delete copy.x; delete copy.y; delete copy.z; delete copy.id;
    weTileEntities.push({
      Pos: Int32Array.from([tx, ty, tz]),
      Id: id,
      ...copy
    });
  }

  const schematic = {
    Metadata: { WEOffsetX: offsetx, WEOffsetY: offsety, WEOffsetZ: offsetz },
    Palette: wePalette,
    BlockEntities: weTileEntities,
    DataVersion: dataVersion,
    Height: Math.abs(y),
    Length: Math.abs(z),
    PaletteMax: Object.keys(wePalette).length,
    Version: 2,
    Width: Math.abs(x),
    BlockData: blockBytes,
    Offset: Int32Array.from([0, 0, 0])
  };

  const rootOut = { Schematic: schematic };
  const nbtBuffer = encodeNBT(rootOut);
  const gzipped = pako.gzip(nbtBuffer);
  
  return gzipped.buffer;
}

function mergeRegions(regionEntries, dataVersion) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  const regionData = [];
  
  for (const [regionName, region] of regionEntries) {
    const size = region.Size;
    const pos = region.Position;
    const x = size.x, y = size.y, z = size.z;
    
    const regionMinX = pos.x + (x < 0 ? x + 1 : 0);
    const regionMinY = pos.y + (y < 0 ? y + 1 : 0);
    const regionMinZ = pos.z + (z < 0 ? z + 1 : 0);
    const regionMaxX = pos.x + (x > 0 ? x - 1 : 0);
    const regionMaxY = pos.y + (y > 0 ? y - 1 : 0);
    const regionMaxZ = pos.z + (z > 0 ? z - 1 : 0);
    
    minX = Math.min(minX, regionMinX);
    minY = Math.min(minY, regionMinY);
    minZ = Math.min(minZ, regionMinZ);
    maxX = Math.max(maxX, regionMaxX);
    maxY = Math.max(maxY, regionMaxY);
    maxZ = Math.max(maxZ, regionMaxZ);
    
    const palette = region.BlockStatePalette;
    const paletteArr = palette.map(buildStateName);
    
    const longs = region.BlockStates;
    const bitsPerBlock = Math.max(2, 32 - Math.clz32(paletteArr.length - 1));
    const vol = Math.abs(x * y * z);
    const blockIds = decodePackedBlockStates(BigInt64Array.from(longs), vol, bitsPerBlock);
    
    regionData.push({
      name: regionName,
      position: pos,
      size: size,
      regionMin: { x: regionMinX, y: regionMinY, z: regionMinZ },
      palette: paletteArr,
      blockIds: blockIds,
      tileEntities: region.TileEntities || []
    });
  }
  
  const totalWidth = maxX - minX + 1;
  const totalHeight = maxY - minY + 1;
  const totalLength = maxZ - minZ + 1;
  
  const globalPalette = new Map();
  globalPalette.set('minecraft:air', 0);
  let nextPaletteId = 1;
  
  const volume = totalWidth * totalHeight * totalLength;
  const mergedBlockIds = new Array(volume).fill(0);
  
  for (const rd of regionData) {
    const localToGlobal = new Map();
    for (let i = 0; i < rd.palette.length; i++) {
      const blockName = rd.palette[i];
      if (!globalPalette.has(blockName)) {
        globalPalette.set(blockName, nextPaletteId++);
      }
      localToGlobal.set(i, globalPalette.get(blockName));
    }
    
    const rw = Math.abs(rd.size.x);
    const rh = Math.abs(rd.size.y);
    const rl = Math.abs(rd.size.z);
    
    const xNegative = rd.size.x < 0;
    const yNegative = rd.size.y < 0;
    const zNegative = rd.size.z < 0;
    
    for (let ly = 0; ly < rh; ly++) {
      for (let lz = 0; lz < rl; lz++) {
        for (let lx = 0; lx < rw; lx++) {
          const localIndex = ly * rw * rl + lz * rw + lx;
          const localBlockId = rd.blockIds[localIndex];
          const globalBlockId = localToGlobal.get(localBlockId) || 0;
          
          const worldX = rd.regionMin.x + (xNegative ? (rw - 1 - lx) : lx);
          const worldY = rd.regionMin.y + (yNegative ? (rh - 1 - ly) : ly);
          const worldZ = rd.regionMin.z + (zNegative ? (rl - 1 - lz) : lz);
          
          const gx = worldX - minX;
          const gy = worldY - minY;
          const gz = worldZ - minZ;
          
          if (gx >= 0 && gx < totalWidth && gy >= 0 && gy < totalHeight && gz >= 0 && gz < totalLength) {
            const globalIndex = gy * totalWidth * totalLength + gz * totalWidth + gx;
            mergedBlockIds[globalIndex] = globalBlockId;
          }
        }
      }
    }
  }
  
  const blockBytesArr = [];
  for (let i = 0; i < volume; i++) {
    let v = mergedBlockIds[i];
    while ((v & ~0x7F) !== 0) {
      blockBytesArr.push((v & 0x7F) | 0x80);
      v >>>= 7;
    }
    blockBytesArr.push(v & 0x7F);
  }
  const blockBytes = new Uint8Array(blockBytesArr);
  
  const wePalette = {};
  for (const [blockName, id] of globalPalette.entries()) {
    wePalette[blockName] = id;
  }
  
  const weTileEntities = [];
  for (const rd of regionData) {
    for (const t of rd.tileEntities) {
      const tx = (rd.regionMin.x + t.x) - minX;
      const ty = (rd.regionMin.y + t.y) - minY;
      const tz = (rd.regionMin.z + t.z) - minZ;
      const id = t.id;
      const copy = { ...t };
      delete copy.x; delete copy.y; delete copy.z; delete copy.id;
      weTileEntities.push({
        Pos: Int32Array.from([tx, ty, tz]),
        Id: id,
        ...copy
      });
    }
  }
  
  const schematic = {
    Metadata: { WEOffsetX: minX, WEOffsetY: minY, WEOffsetZ: minZ },
    Palette: wePalette,
    BlockEntities: weTileEntities,
    DataVersion: dataVersion,
    Height: totalHeight,
    Length: totalLength,
    PaletteMax: globalPalette.size,
    Version: 2,
    Width: totalWidth,
    BlockData: blockBytes,
    Offset: Int32Array.from([0, 0, 0])
  };

  const rootOut = { Schematic: schematic };
  const nbtBuffer = encodeNBT(rootOut);
  const gzipped = pako.gzip(nbtBuffer);
  
  return gzipped.buffer;
}

function encodeNBT(root) {
  const chunks = [];
  function writeTag(type, name, value) {
    chunks.push(new Uint8Array([type]));
    if (name != null) {
      const nb = new TextEncoder().encode(name);
      const lenBuf = new Uint8Array(2);
      new DataView(lenBuf.buffer).setUint16(0, nb.length, false);
      chunks.push(lenBuf, nb);
    }
    switch (type) {
      case 1: {
        const b = new Uint8Array(1);
        new DataView(b.buffer).setInt8(0, value);
        chunks.push(b); break;
      }
      case 3: {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setInt32(0, value, false);
        chunks.push(b); break;
      }
      case 8: {
        const sb = new TextEncoder().encode(value);
        const lb = new Uint8Array(2);
        new DataView(lb.buffer).setUint16(0, sb.length, false);
        chunks.push(lb, sb); break;
      }
      case 7: {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setInt32(0, value.length, false);
        chunks.push(b, new Uint8Array(value)); break;
      }
      case 11: {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setInt32(0, value.length, false);
        chunks.push(b);
        const arr = new Uint8Array(value.length * 4);
        const view = new DataView(arr.buffer);
        value.forEach((v, i) => view.setInt32(i * 4, v, false));
        chunks.push(arr); break;
      }
      case 10: {
        for (const [k, v] of Object.entries(value)) {
          if (v instanceof Int32Array) writeTag(11, k, Array.from(v));
          else if (v instanceof Uint8Array) writeTag(7, k, v);
          else if (typeof v === "string") writeTag(8, k, v);
          else if (typeof v === "number") writeTag(3, k, v);
          else if (v && typeof v === "object") writeTag(10, k, v);
        }
        chunks.push(new Uint8Array([0]));
        break;
      }
    }
  }
  writeTag(10, "", root);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export { litematicToWorldEdit };
