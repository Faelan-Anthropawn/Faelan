function createNBTWriter() {
  const chunks = [];
  
  function writeByte(value) {
    chunks.push(new Uint8Array([value & 0xFF]));
  }
  
  function writeShort(value) {
    chunks.push(new Uint8Array([
      (value >> 8) & 0xFF,
      value & 0xFF
    ]));
  }
  
  function writeInt(value) {
    chunks.push(new Uint8Array([
      (value >> 24) & 0xFF,
      (value >> 16) & 0xFF,
      (value >> 8) & 0xFF,
      value & 0xFF
    ]));
  }
  
  function writeString(str) {
    const encoded = new TextEncoder().encode(str);
    writeShort(encoded.length);
    chunks.push(encoded);
  }
  
  function writeByteArray(arr) {
    writeInt(arr.length);
    chunks.push(new Uint8Array(arr));
  }
  
  function writeIntArray(arr) {
    writeInt(arr.length);
    for (const val of arr) {
      writeInt(val);
    }
  }
  
  function writeTag(type, name, value) {
    writeByte(type);
    if (type !== 0) {
      writeString(name);
      writeTagValue(type, value);
    }
  }
  
  function writeTagValue(type, value) {
    switch (type) {
      case 1: writeByte(value); break;
      case 2: writeShort(value); break;
      case 3: writeInt(value); break;
      case 8: writeString(value); break;
      case 7: writeByteArray(value); break;
      case 9:
        writeByte(value.type);
        writeInt(value.list.length);
        for (const item of value.list) {
          writeTagValue(value.type, item);
        }
        break;
      case 10:
        for (const [key, val] of Object.entries(value)) {
          writeTag(val.type, key, val.value);
        }
        writeByte(0);
        break;
      case 11: writeIntArray(value); break;
    }
  }
  
  function getBuffer() {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  
  return { writeTag, getBuffer };
}

function convertToSchematic(extractedData) {
  const { width, height, length, blocks, palette } = extractedData;
  
  const paletteNBT = {};
  palette.forEach((blockName, index) => {
    paletteNBT[blockName] = { type: 3, value: index };
  });
  
  const blockDataArray = new Int32Array(width * height * length);
  blockDataArray.fill(0);
  
  for (const block of blocks) {
    const index = (block.y * width * length) + (block.z * width) + block.x;
    blockDataArray[index] = block.block;
  }
  
  const blockDataBytes = [];
  for (let i = 0; i < blockDataArray.length; i++) {
    const varInt = blockDataArray[i];
    let value = varInt;
    while ((value & 0xFFFFFF80) !== 0) {
      blockDataBytes.push((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    blockDataBytes.push(value & 0x7F);
  }
  
  const schematic = {
    type: 10,
    value: {
      Version: { type: 3, value: 2 },
      DataVersion: { type: 3, value: 2975 },
      Width: { type: 2, value: width },
      Height: { type: 2, value: height },
      Length: { type: 2, value: length },
      Palette: { type: 10, value: paletteNBT },
      BlockData: { type: 7, value: blockDataBytes },
      PaletteMax: { type: 3, value: palette.length },
      Metadata: {
        type: 10,
        value: {
          WEOffsetX: { type: 3, value: 0 },
          WEOffsetY: { type: 3, value: 0 },
          WEOffsetZ: { type: 3, value: 0 }
        }
      }
    }
  };
  
  const writer = createNBTWriter();
  writer.writeTag(10, 'Schematic', schematic.value);
  
  return writer.getBuffer();
}

async function createSchematicBlob(extractedData) {
  const nbtData = convertToSchematic(extractedData);
  const compressed = pako.gzip(nbtData);
  return new Blob([compressed], { type: 'application/octet-stream' });
}

class SchematicStreamWriter {
  constructor(width, height, length) {
    this.width = width;
    this.height = height;
    this.length = length;
    this.volume = width * height * length;
    
    this.paletteMap = new Map();
    this.paletteList = [];
    this.paletteMap.set('minecraft:air', 0);
    this.paletteList.push('minecraft:air');
    
    this.blockDataChunks = [];
    this.currentChunk = [];
    this.chunkSize = 65536;
    this.blocksWritten = 0;
  }
  
  addBlock(blockName) {
    let paletteIndex = this.paletteMap.get(blockName);
    if (paletteIndex === undefined) {
      paletteIndex = this.paletteList.length;
      this.paletteMap.set(blockName, paletteIndex);
      this.paletteList.push(blockName);
    }
    
    let value = paletteIndex;
    while ((value & 0xFFFFFF80) !== 0) {
      this.currentChunk.push((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    this.currentChunk.push(value & 0x7F);
    
    if (this.currentChunk.length >= this.chunkSize) {
      this.blockDataChunks.push(new Uint8Array(this.currentChunk));
      this.currentChunk = [];
    }
    
    this.blocksWritten++;
  }
  
  finalize() {
    if (this.currentChunk.length > 0) {
      this.blockDataChunks.push(new Uint8Array(this.currentChunk));
    }
    
    const totalLength = this.blockDataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const blockData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.blockDataChunks) {
      blockData.set(chunk, offset);
      offset += chunk.length;
    }
    
    const paletteNBT = {};
    this.paletteList.forEach((blockName, index) => {
      paletteNBT[blockName] = { type: 3, value: index };
    });
    
    const schematic = {
      type: 10,
      value: {
        Version: { type: 3, value: 2 },
        DataVersion: { type: 3, value: 2975 },
        Width: { type: 2, value: this.width },
        Height: { type: 2, value: this.height },
        Length: { type: 2, value: this.length },
        Palette: { type: 10, value: paletteNBT },
        BlockData: { type: 7, value: Array.from(blockData) },
        PaletteMax: { type: 3, value: this.paletteList.length },
        Metadata: {
          type: 10,
          value: {
            WEOffsetX: { type: 3, value: 0 },
            WEOffsetY: { type: 3, value: 0 },
            WEOffsetZ: { type: 3, value: 0 }
          }
        }
      }
    };
    
    const writer = createNBTWriter();
    writer.writeTag(10, 'Schematic', schematic.value);
    const nbtData = writer.getBuffer();
    
    const compressed = pako.gzip(nbtData);
    return compressed.buffer;
  }
}

export { convertToSchematic, createSchematicBlob, SchematicStreamWriter };
