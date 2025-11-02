// Browser-compatible structure converter
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_FLOAT = 5;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

let nbtWriterCurrentOffset = 0;

function writeByte(buffer, offset, value) {
  buffer.setInt8(offset, value);
  return offset + 1;
}

function writeUnsignedShort(buffer, offset, value) {
  buffer.setUint16(offset, value, true);
  return offset + 2;
}

function writeInt(buffer, offset, value) {
  buffer.setInt32(offset, value, true);
  return offset + 4;
}

function writeStringPayload(buffer, offset, text) {
  if (text === null || text === undefined) text = "";
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(text);
  offset = writeUnsignedShort(buffer, offset, utf8Bytes.length);
  for (let i = 0; i < utf8Bytes.length; i++) {
    buffer.setUint8(offset + i, utf8Bytes[i]);
  }
  return offset + utf8Bytes.length;
}

function getNbtType(value) {
  if (typeof value === "boolean") return TAG_BYTE;
  if (typeof value === "number") {
    if (Number.isInteger(value)) return TAG_INT;
    return TAG_FLOAT;
  }
  if (typeof value === "string") return TAG_STRING;
  if (Array.isArray(value)) return TAG_LIST;
  if (typeof value === "object" && value !== null) return TAG_COMPOUND;
  throw new TypeError(`Unsupported JavaScript type for NBT conversion: ${typeof value}`);
}

function writeTagNonRecursive(buffer, name, value) {
  try {
    nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, getNbtType(value));

    if (name !== null && name !== undefined) {
      nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, name);
    }

    if (typeof value === "boolean") {
      nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, value ? 1 : 0);
    } else if (Number.isInteger(value)) {
      nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, value);
    } else if (typeof value === "number") {
      const floatArray = new Float32Array(1);
      floatArray[0] = value;
      const intValue = new Int32Array(floatArray.buffer)[0];
      nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
    } else if (typeof value === "string") {
      nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, value);
    } else if (Array.isArray(value)) {
      writeListNonRecursive(buffer, value);
    } else if (typeof value === "object" && value !== null) {
      const keys = Object.keys(value);
      for (const key of keys) {
        writeTagNonRecursive(buffer, key, value[key]);
      }
      nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
    }
  } catch (e) {
    console.error(`Error writing tag ${name}:`, e);
    throw e;
  }
}

function writeListNonRecursive(buffer, dataList) {
  try {
    if (!dataList.length) {
      nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
      nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, 0);
      return;
    }

    const firstItem = dataList[0];
    let elementType = getNbtType(firstItem);

    nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, elementType);
    nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, dataList.length);

    for (let i = 0; i < dataList.length; i++) {
      const item = dataList[i];

      if (typeof item === "boolean") {
        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, item ? 1 : 0);
      } else if (Number.isInteger(item)) {
        nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, item);
      } else if (typeof item === "number") {
        const floatArray = new Float32Array(1);
        floatArray[0] = item;
        const intValue = new Int32Array(floatArray.buffer)[0];
        nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
      } else if (typeof item === "string") {
        nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, item);
      } else if (Array.isArray(item)) {
        writeListNonRecursive(buffer, item);
      } else if (typeof item === "object" && item !== null) {
        const objKeys = Object.keys(item);
        for (const key of objKeys) {
          writeTagNonRecursive(buffer, key, item[key]);
        }
        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
      } else {
        console.warn(`Unsupported item type in list at index ${i}:`, item);
      }
    }
  } catch (e) {
    console.error("Error writing list:", e);
    throw e;
  }
}

function estimateNbtBufferSize(data) {
  const jsonSize = JSON.stringify(data).length;
  return Math.max(jsonSize * 4, 10 * 1024 * 1024);
}

function createNbtBuffer(data) {
  try {
    const estimatedSize = estimateNbtBufferSize(data);
    const arrayBuffer = new ArrayBuffer(estimatedSize);
    const buffer = new DataView(arrayBuffer);
    nbtWriterCurrentOffset = 0;

    nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_COMPOUND);
    nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, "");

    const rootKeys = Object.keys(data);
    for (const key of rootKeys) {
      writeTagNonRecursive(buffer, key, data[key]);
    }

    nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);

    return arrayBuffer.slice(0, nbtWriterCurrentOffset);
  } catch (e) {
    console.error("Error during NBT buffer creation:", e);
    throw e;
  }
}

function parseCmdStructCoordinate(coordStr) {
  coordStr = coordStr.trim();
  if (coordStr.startsWith('~')) {
    const offset = coordStr.substring(1);
    return offset ? parseInt(offset) : 0;
  } else {
    return parseInt(coordStr);
  }
}

function parseCmdStructBlockWithStates(blockStr) {
  blockStr = blockStr.trim();
  const match = blockStr.match(/^([\w:]+)(?:\[(.*)\])?/);
  if (!match) {
    console.warn(`Could not parse block string: ${blockStr}`);
    return [blockStr, {}];
  }
  const blockName = match[1];
  const statesStr = match[2] || '';
  const states = {};
  if (statesStr) {
    const statePairs = statesStr.match(/([\w:"\-]+)\s*=\s*([\w"\-.+]+)/g) || [];
    for (const pair of statePairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      const cleanKey = key.replace(/"/g, '');
      const valueLower = value.toLowerCase();
      if (valueLower === 'true') {
        states[cleanKey] = true;
      } else if (valueLower === 'false') {
        states[cleanKey] = false;
      } else {
        const numValue = parseInt(value);
        states[cleanKey] = isNaN(numValue) ? value.replace(/"/g, '') : numValue;
      }
    }
  }
  return [blockName, states];
}

function padStructureWithAir(blocksMap, minX, minY, minZ, padding = 40) {
  for (let x = 0; x < padding; x++) {
    blocksMap[minX + x] = blocksMap[minX + x] || {};
    blocksMap[minX + x][minY] = blocksMap[minX + x][minY] || {};
    blocksMap[minX + x][minY][minZ] = ["minecraft:air", {}];
  }

  for (let y = 0; y < padding; y++) {
    blocksMap[minX] = blocksMap[minX] || {};
    blocksMap[minX][minY + y] = blocksMap[minX][minY + y] || {};
    blocksMap[minX][minY + y][minZ] = ["minecraft:air", {}];
  }

  for (let z = 0; z < padding; z++) {
    blocksMap[minX] = blocksMap[minX] || {};
    blocksMap[minX][minY] = blocksMap[minX][minY] || {};
    blocksMap[minX][minY][minZ + z] = ["minecraft:air", {}];
  }
}

function convertCommandsToStructure(commandsArray, options = {}) {
  const { size = 40, width: optWidth, height: optHeight, length: optLength, baseCoords = [0, 0, 0] } = options;
  const [baseX, baseY, baseZ] = baseCoords;
  const blocksMap = {};

  const structureWidth = optWidth !== undefined ? optWidth : size;
  const structureHeight = optHeight !== undefined ? optHeight : size;
  const structureLength = optLength !== undefined ? optLength : size;
  const minX = 0, minY = 0, minZ = 0;

  if (optWidth === undefined && optHeight === undefined && optLength === undefined) {
    padStructureWithAir(blocksMap, minX, minY, minZ, size);
  }

  for (let lineNum = 0; lineNum < commandsArray.length; lineNum++) {
    const cmd = commandsArray[lineNum].trim();
    if (!cmd || cmd.startsWith('#')) continue;

    const parts = cmd.split(/\s+/);
    if (parts.length === 0) continue;

    const commandName = parts[0].toLowerCase();

    try {
      if (commandName === 'fill' && parts.length >= 8) {
        const x1 = baseX + parseCmdStructCoordinate(parts[1]);
        const y1 = baseY + parseCmdStructCoordinate(parts[2]);
        const z1 = baseZ + parseCmdStructCoordinate(parts[3]);
        const x2 = baseX + parseCmdStructCoordinate(parts[4]);
        const y2 = baseY + parseCmdStructCoordinate(parts[5]);
        const z2 = baseZ + parseCmdStructCoordinate(parts[6]);
        const blockStr = parts.slice(7).join(' ');
        const [blockName, states] = parseCmdStructBlockWithStates(blockStr);

        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        const startZ = Math.min(z1, z2);
        const endZ = Math.max(z1, z2);

        for (let x = startX; x <= endX; x++) {
          blocksMap[x] = blocksMap[x] || {};
          for (let y = startY; y <= endY; y++) {
            blocksMap[x][y] = blocksMap[x][y] || {};
            for (let z = startZ; z <= endZ; z++) {
              blocksMap[x][y][z] = [blockName, { ...states }];
            }
          }
        }
      } else if (commandName === 'setblock' && parts.length >= 5) {
        const x = baseX + parseCmdStructCoordinate(parts[1]);
        const y = baseY + parseCmdStructCoordinate(parts[2]);
        const z = baseZ + parseCmdStructCoordinate(parts[3]);
        const blockStr = parts.slice(4).join(' ');
        const [blockName, states] = parseCmdStructBlockWithStates(blockStr);

        blocksMap[x] = blocksMap[x] || {};
        blocksMap[x][y] = blocksMap[x][y] || {};
        blocksMap[x][y][z] = [blockName, { ...states }];
      }
    } catch (e) {
      console.error(`Error processing line ${lineNum + 1}: '${cmd}' - ${e.message}`);
    }
  }

  const width = structureWidth, height = structureHeight, depth = structureLength;
  const uniqueBlocks = new Map();
  const palette = [];
  const airIndex = -1;
  const blockIndicesLayer0 = [];

  for (let x = minX; x < minX + width; x++) {
    for (let y = minY; y < minY + height; y++) {
      for (let z = minZ; z < minZ + depth; z++) {
        const blockData = blocksMap[x]?.[y]?.[z];
        if (blockData) {
          const [blockName, states] = blockData;
          const fullName = blockName.includes(':') ? blockName : `minecraft:${blockName}`;
          const stateEntries = Object.entries(states || {}).sort((a, b) => a[0].localeCompare(b[0]));
          const blockKey = JSON.stringify([fullName, stateEntries]);

          let paletteIndex;
          if (!uniqueBlocks.has(blockKey)) {
            paletteIndex = palette.length;
            uniqueBlocks.set(blockKey, paletteIndex);
            palette.push({ name: fullName, states: states || {}, version: 18163713 });
          } else {
            paletteIndex = uniqueBlocks.get(blockKey);
          }
          blockIndicesLayer0.push(paletteIndex);
        } else {
          blockIndicesLayer0.push(airIndex);
        }
      }
    }
  }

  const blockIndicesLayer1 = new Array(width * height * depth).fill(airIndex);

  return {
    format_version: 1,
    size: [width, height, depth],
    structure: {
      block_indices: [blockIndicesLayer0, blockIndicesLayer1],
      entities: [],
      palette: {
        default: {
          block_palette: palette,
          block_position_data: {}
        }
      }
    },
    structure_world_origin: [minX, minY, minZ]
  };
}

export {
  createNbtBuffer,
  convertCommandsToStructure,
  parseCmdStructCoordinate,
  parseCmdStructBlockWithStates,
  padStructureWithAir
};
