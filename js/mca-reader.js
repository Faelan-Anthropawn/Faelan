function readUint32BE(buffer, offset) {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  ) >>> 0;
}

function readUint24BE(buffer, offset) {
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function parseNBT(buffer) {
  let offset = 0;
  
  function readByte() {
    const value = buffer[offset++];
    return value > 127 ? value - 256 : value;
  }
  
  function readShort() {
    const value = (buffer[offset] << 8) | buffer[offset + 1];
    offset += 2;
    return value > 32767 ? value - 65536 : value;
  }
  
  function readInt() {
    const value = readUint32BE(buffer, offset);
    offset += 4;
    return value;
  }
  
  function readLong() {
    const high = readInt();
    const low = readInt();
    return (BigInt(high) << 32n) | BigInt(low >>> 0);
  }
  
  function readFloat() {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    offset += 4;
    return view.getFloat32(0, false);
  }
  
  function readDouble() {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    offset += 8;
    return view.getFloat64(0, false);
  }
  
  function readString() {
    const length = readShort();
    const str = new TextDecoder('utf-8').decode(buffer.slice(offset, offset + length));
    offset += length;
    return str;
  }
  
  function readByteArray() {
    const length = readInt();
    const arr = Array.from(buffer.slice(offset, offset + length));
    offset += length;
    return arr;
  }
  
  function readIntArray() {
    const length = readInt();
    const arr = [];
    for (let i = 0; i < length; i++) {
      arr.push(readInt());
    }
    return arr;
  }
  
  function readLongArray() {
    const length = readInt();
    const arr = new Array(length);
    for (let i = 0; i < length; i++) {
      arr[i] = readLong();
    }
    return arr;
  }
  
  function readTag() {
    const type = readByte();
    if (type === 0) return null;
    
    const name = readString();
    const value = readTagValue(type);
    
    return { name, value, type };
  }
  
  function readTagValue(type) {
    switch (type) {
      case 1: return readByte();
      case 2: return readShort();
      case 3: return readInt();
      case 4: return readLong();
      case 5: return readFloat();
      case 6: return readDouble();
      case 7: return readByteArray();
      case 8: return readString();
      case 9: {
        const listType = readByte();
        const length = readInt();
        const list = [];
        for (let i = 0; i < length; i++) {
          list.push(readTagValue(listType));
        }
        return list;
      }
      case 10: {
        const compound = {};
        while (true) {
          const tag = readTag();
          if (!tag) break;
          compound[tag.name] = tag.value;
        }
        return compound;
      }
      case 11: return readIntArray();
      case 12: return readLongArray();
      default: throw new Error(`Unknown NBT tag type: ${type}`);
    }
  }
  
  const rootTag = readTag();
  return rootTag ? rootTag.value : null;
}

async function readMCAFile(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const chunks = new Map();
  
  for (let i = 0; i < 1024; i++) {
    const locationOffset = i * 4;
    const offset = readUint24BE(data, locationOffset);
    const sectorCount = data[locationOffset + 3];
    
    if (offset === 0 || sectorCount === 0) continue;
    
    const chunkX = i % 32;
    const chunkZ = Math.floor(i / 32);
    
    const byteOffset = offset * 4096;
    const length = readUint32BE(data, byteOffset);
    const compressionType = data[byteOffset + 4];
    
    if (length === 0) continue;
    
    const compressedData = data.slice(byteOffset + 5, byteOffset + 4 + length);
    
    let chunkData;
    try {
      if (compressionType === 2) {
        chunkData = pako.inflate(compressedData);
      } else if (compressionType === 1) {
        chunkData = pako.ungzip(compressedData);
      } else {
        chunkData = compressedData;
      }
      
      const nbt = parseNBT(chunkData);
      chunks.set(`${chunkX},${chunkZ}`, { x: chunkX, z: chunkZ, data: nbt });
    } catch (e) {
      console.warn(`Failed to parse chunk ${chunkX},${chunkZ}:`, e);
    }
  }
  
  return chunks;
}

function getBlockFromChunk(chunkData, localX, y, localZ) {
  const chunk = chunkData.data;
  
  let sections, level = null;
  if (chunk.Level && chunk.Level.Sections) {
    sections = chunk.Level.Sections;
    level = chunk.Level;
  } else if (chunk.sections) {
    sections = chunk.sections;
  } else {
    return null;
  }
  
  const sectionY = Math.floor(y / 16);
  const section = sections.find(s => s.Y === sectionY);
  
  if (!section) return null;
  
  if (section.block_states && section.block_states.palette) {
    const palette = section.block_states.palette;
    if (!palette || palette.length === 0) return null;
    
    if (palette.length === 1) {
      const entry = palette[0];
      let blockState = entry.Name || null;
      if (entry.Properties) {
        const props = Object.entries(entry.Properties)
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        blockState = `${blockState}[${props}]`;
      }
      return blockState;
    }
    
    const blockData = section.block_states.data;
    if (!blockData || blockData.length === 0) return palette[0].Name || null;
    
    const inSectionY = y % 16;
    const index = inSectionY * 256 + localZ * 16 + localX;
    
    const bitsPerBlock = Math.max(4, Math.ceil(Math.log2(palette.length)));
    const blocksPerLong = Math.floor(64 / bitsPerBlock);
    const longIndex = Math.floor(index / blocksPerLong);
    const bitOffset = (index % blocksPerLong) * bitsPerBlock;
    
    if (longIndex >= blockData.length) return palette[0].Name || null;
    
    let long = blockData[longIndex];
    if (long === undefined || long === null) {
      return palette[0].Name || null;
    }
    if (typeof long !== 'bigint') {
      long = BigInt(long);
    }
    const mask = (1n << BigInt(bitsPerBlock)) - 1n;
    const paletteIndex = Number((long >> BigInt(bitOffset)) & mask);
    
    if (paletteIndex < 0 || paletteIndex >= palette.length) return null;
    
    const entry = palette[paletteIndex];
    if (!entry) return null;
    
    let blockState = entry.Name || null;
    if (entry.Properties) {
      const props = Object.entries(entry.Properties)
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
      blockState = `${blockState}[${props}]`;
    }
    return blockState;
  }
  
  if (section.Blocks) {
    const inSectionY = y % 16;
    const index = inSectionY * 256 + localZ * 16 + localX;
    
    if (index >= section.Blocks.length) return null;
    
    let blockId = section.Blocks[index];
    if (section.Add && section.Add.length > 0) {
      const addIndex = Math.floor(index / 2);
      const nibble = (index % 2 === 0) 
        ? (section.Add[addIndex] & 0x0F) 
        : ((section.Add[addIndex] >> 4) & 0x0F);
      blockId = blockId | (nibble << 8);
    }
    
    if (section.Data && section.Data.length > 0) {
      const dataIndex = Math.floor(index / 2);
      const data = (index % 2 === 0)
        ? (section.Data[dataIndex] & 0x0F)
        : ((section.Data[dataIndex] >> 4) & 0x0F);
      return `minecraft:legacy_${blockId}:${data}`;
    }
    
    return `minecraft:legacy_${blockId}`;
  }
  
  return null;
}

export { readMCAFile, getBlockFromChunk, parseNBT };
