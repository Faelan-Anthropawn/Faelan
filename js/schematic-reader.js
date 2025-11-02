import { litematicToWorldEdit } from './litematic.js';

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function maybeDecompress(raw) {
  try { return pako.ungzip(raw); } catch {}
  try { return pako.inflate(raw); } catch {}
  return raw;
}

class BinaryReader {
  constructor(b) {
    this.buffer = b instanceof Uint8Array ? b : new Uint8Array(b);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    this.offset = 0;
  }
  readByte() { const v = this.view.getInt8(this.offset); this.offset += 1; return v; }
  readUnsignedByte() { const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  readUnsignedShort() { const v = this.view.getUint16(this.offset, false); this.offset += 2; return v; }
  readShort() { const v = this.view.getInt16(this.offset, false); this.offset += 2; return v; }
  readInt() { const v = this.view.getInt32(this.offset, false); this.offset += 4; return v; }
  readLong() {
    const hi = this.readInt();
    const lo = this.readInt();
    return (BigInt(hi) << 32n) | BigInt(lo >>> 0);
  }
  readFloat() { const v = this.view.getFloat32(this.offset, false); this.offset += 4; return v; }
  readDouble() { const v = this.view.getFloat64(this.offset, false); this.offset += 8; return v; }
  readBytes(n) {
    const s = this.buffer.subarray(this.offset, this.offset + n);
    this.offset += n;
    return s;
  }
  readString() {
    const len = this.readUnsignedShort();
    const bytes = this.buffer.subarray(this.offset, this.offset + len);
    this.offset += len;
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function readPayload(type, r) {
  switch (type) {
    case 1: return r.readByte();
    case 2: return r.readShort();
    case 3: return r.readInt();
    case 4: return r.readLong();
    case 5: return r.readFloat();
    case 6: return r.readDouble();
    case 7: { const n = r.readInt(); return r.readBytes(n); }
    case 8: return r.readString();
    case 9: {
      const ct = r.readUnsignedByte();
      const n = r.readInt();
      const list = new Array(n);
      for (let i = 0; i < n; i++) list[i] = readPayload(ct, r);
      return list;
    }
    case 10: {
      const obj = {};
      for (;;) {
        const t = r.readUnsignedByte();
        if (t === 0) break;
        const nm = r.readString();
        obj[nm] = readPayload(t, r);
      }
      return obj;
    }
    case 11: {
      const n = r.readInt();
      const arr = new Int32Array(n);
      for (let i = 0; i < n; i++) arr[i] = r.readInt();
      return arr;
    }
    case 12: {
      const n = r.readInt();
      const arr = new BigInt64Array(n);
      for (let i = 0; i < n; i++) arr[i] = r.readLong();
      return arr;
    }
    default: throw new Error("Unsupported NBT tag type: " + type);
  }
}

function readTag(reader, expectName = true) {
  const type = reader.readUnsignedByte();
  if (type === 0) return { type: 0, name: null, value: null };
  const name = expectName ? reader.readString() : null;
  return { type, name, value: readPayload(type, reader) };
}

function parseNBT(buf) {
  const r = new BinaryReader(buf);
  const root = readTag(r, true);
  return root.value;
}

function normalizeNamespace(n) {
  if (!n) return "";
  if (typeof n !== "string") n = String(n);
  n = n.toLowerCase();
  return n.includes(":") ? n : `minecraft:${n}`;
}

function buildStateName(entry) {
  if (!entry) return "minecraft:air";
  if (typeof entry === "string") return normalizeNamespace(entry);
  if (typeof entry === "number") return String(entry);
  const name = normalizeNamespace(entry.Name || entry.name || "minecraft:air");
  const props = entry.Properties || entry.properties;
  if (props && Object.keys(props).length) {
    const pairs = Object.keys(props).sort().map(k => `${k}=${props[k]}`);
    return `${name}[${pairs.join(",")}]`;
  }
  return name;
}

function decodeLEB128Varints(bytes, expectedCount) {
  const out = new Uint32Array(expectedCount);
  let i = 0, w = 0;
  const n = bytes.length >>> 0;
  while (i < n && w < expectedCount) {
    let result = 0 >>> 0;
    let shift = 0;
    for (;;) {
      if (i >= n) throw new Error("Unexpected end of BlockData while decoding varint.");
      const b = bytes[i++];
      result |= (b & 0x7F) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error("Varint too long in BlockData.");
    }
    out[w++] = result >>> 0;
  }
  if (w !== expectedCount) throw new Error(`Decoded ${w} varints, expected ${expectedCount}.`);
  return out;
}

function decodePackedBlockStates(longArr, count, bitsPerEntry) {
  const maskVal = (1n << BigInt(bitsPerEntry)) - 1n;
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const bitIndex = BigInt(i * bitsPerEntry);
    const longIndex = Number(bitIndex >> 6n);
    const startBit = Number(bitIndex & 63n);
    const base = longArr[longIndex] & ((1n << 64n) - 1n);
    let val = (base >> BigInt(startBit)) & maskVal;
    const endBit = startBit + bitsPerEntry;
    if (endBit > 64) {
      const bitsFromNext = endBit - 64;
      const nextBase = longArr[longIndex + 1] & ((1n << 64n) - 1n);
      const nextPart = (nextBase & ((1n << BigInt(bitsFromNext)) - 1n)) << BigInt(64 - startBit);
      val |= nextPart & maskVal;
    }
    out[i] = Number(val);
  }
  return out;
}

function buildPaletteArray(pal) {
  if (!pal) return { arr: [], count: 0 };
  if (Array.isArray(pal)) {
    const arr = pal.map(buildStateName);
    return { arr, count: arr.length };
  }
  const arr = [];
  let count = 0;
  for (const [name, idx] of Object.entries(pal)) {
    const i = Number(idx);
    if (Number.isFinite(i)) {
      arr[i] = buildStateName(name);
      count++;
    }
  }
  return { arr, count: Math.max(count, arr.length) };
}

function normalizeClassicArray(input, mask = 0xFF) {
  if (!input) return null;
  if (input instanceof Uint8Array) {
    if (mask === 0xFF) return input;
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input[i] & mask;
    return out;
  }
  if (
    input instanceof Int32Array ||
    input instanceof Uint16Array ||
    input instanceof Int16Array ||
    input instanceof Int8Array
  ) {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input[i] & mask;
    return out;
  }
  if (Array.isArray(input)) {
    const out = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Number(input[i]) & mask;
    return out;
  }
  return null;
}

async function loadSchematic(arrayBuffer, filename) {
  const ext = filename.toLowerCase().endsWith('.litematic') ? '.litematic' : '.schem';
  
  if (ext === ".litematic") {
    console.log("Converting .litematic to .schem...");
    const litematicData = await litematicToWorldEdit(arrayBuffer, filename);
    if (!litematicData) throw new Error("Conversion failed, no schem created");
    arrayBuffer = litematicData;
    console.log(`Converted litematic to schem format`);
  }

  const buf = maybeDecompress(new Uint8Array(arrayBuffer));
  let root = parseNBT(buf);

  if (isObj(root) && isObj(root.Schematic)) root = root.Schematic;

  let fmt = "unknown";
  const has = (k) => Object.prototype.hasOwnProperty.call(root, k);

  if (isObj(root.Blocks) && (root.Blocks.Palette || root.Blocks.BlockStatePalette || root.Blocks.BlockStates || root.Blocks.BlockData || root.Blocks.Data)) {
    fmt = "states_wrapped";
  } else if ((has("Palette") || has("BlockStatePalette")) && (has("BlockStates") || has("BlockData") || has("Blocks") || has("Data"))) {
    fmt = "modern";
  } else if (has("Width") && has("Height") && has("Length") && (has("Blocks") || has("Data") || has("BlockData"))) {
    fmt = "classic";
  }

  let width = 0, height = 0, length = 0;
  let blocks;
  let paletteStr;
  let legacyBlocks;
  let legacyData;

  const setDimsFrom = (obj) => {
    if (obj.Size && Array.isArray(obj.Size) && obj.Size.length >= 3) {
      width = obj.Size[0] | 0; height = obj.Size[1] | 0; length = obj.Size[2] | 0;
    } else {
      width = obj.Width | 0; height = obj.Height | 0; length = obj.Length | 0;
    }
  };
  const volume = () => (width | 0) * (height | 0) * (length | 0);

  if (fmt === "classic") {
    setDimsFrom(root);
    const vol = volume();

    const bRaw = root.Blocks ?? null;
    const dRaw = root.Data ?? null;
    const addRaw = root.AddBlocks ?? root.Add ?? null;

    const b = normalizeClassicArray(bRaw, 0xFF);
    const d = normalizeClassicArray(dRaw, 0x0F) || new Uint8Array(vol);

    if (!b) throw new Error("Classic schematic: Unsupported Blocks encoding (could not normalize).");

    let ids;
    const add = normalizeClassicArray(addRaw, 0xFF);
    if (add && add.length >= Math.ceil(vol / 2)) {
      const out = new Uint16Array(vol);
      for (let i = 0; i < vol; i++) {
        const hiByte = add[i >> 1] ?? 0;
        const hi4 = (i & 1) ? (hiByte & 0x0F) : (hiByte >> 4);
        out[i] = ((hi4 & 0x0F) << 8) | (b[i] & 0xFF);
      }
      ids = out;
    } else {
      ids = b;
    }

    legacyBlocks = ids;
    legacyData = d;
  }
  else if (fmt === "modern") {
    setDimsFrom(root);
    const vol = volume();

    const palObj = root.Palette || root.BlockStatePalette || {};
    const { arr: palArr, count: palCount } = buildPaletteArray(palObj);
    paletteStr = palArr;

    if (root.BlockStates) {
      const bits = Math.max(4, Math.ceil(Math.log2(Math.max(1, palCount))));
      if (!(root.BlockStates instanceof BigInt64Array)) throw new Error("BlockStates must be long[]");
      blocks = decodePackedBlockStates(root.BlockStates, vol, bits);
    } else if (root.BlockData) {
      const bytes = root.BlockData;
      if (!(bytes instanceof Uint8Array)) throw new Error("BlockData must be ByteArray");
      blocks = decodeLEB128Varints(bytes, vol);
    } else if (root.Blocks || root.Data) {
      const arr = root.Blocks || root.Data;
      if (arr instanceof Int32Array && arr.length === vol) blocks = new Uint32Array(arr);
      else if (arr instanceof Uint8Array) blocks = (arr.length === vol) ? new Uint32Array(arr) : decodeLEB128Varints(arr, vol);
      else throw new Error("Unsupported Blocks/Data encoding in modern .schem");
    } else {
      throw new Error("No block data found in modern .schem");
    }
  }
  else if (fmt === "states_wrapped") {
    setDimsFrom(root);
    const vol = volume();
    const inner = root.Blocks || {};

    const palObj = inner.Palette || inner.BlockStatePalette || {};
    const { arr: palArr, count: palCount } = buildPaletteArray(palObj);
    paletteStr = palArr;

    if (inner.BlockStates) {
      const count = Math.max(1, palCount);
      const bits = Math.max(4, Math.ceil(Math.log2(count)));
      if (!(inner.BlockStates instanceof BigInt64Array)) throw new Error("Blocks.BlockStates must be long[]");
      blocks = decodePackedBlockStates(inner.BlockStates, vol, bits);
    } else if (inner.BlockData) {
      const bytes = inner.BlockData;
      if (!(bytes instanceof Uint8Array)) throw new Error("Blocks.BlockData must be ByteArray");
      blocks = decodeLEB128Varints(bytes, vol);
    } else if (inner.Data) {
      const arr = inner.Data;
      if (arr instanceof Int32Array && arr.length === vol) blocks = new Uint32Array(arr);
      else if (arr instanceof Uint8Array) blocks = (arr.length === vol) ? new Uint32Array(arr) : decodeLEB128Varints(arr, vol);
      else throw new Error("Unsupported Blocks.Data encoding in wrapped .schem");
    } else {
      const lowerKeys = Object.keys(inner).filter(k => /block/i.test(k));
      let picked = null;
      for (const k of lowerKeys) {
        const v = inner[k];
        if (v instanceof BigInt64Array) { picked = { type: "BlockStates", v }; break; }
        if (v instanceof Uint8Array) { picked = { type: "ByteArray", v }; break; }
        if (v instanceof Int32Array) { picked = { type: "IntArray", v }; break; }
      }
      if (!picked) throw new Error("No block arrays found in inner Blocks.");
      if (picked.type === "BlockStates") {
        const bits = Math.max(4, Math.ceil(Math.log2(Math.max(1, palCount))));
        blocks = decodePackedBlockStates(picked.v, vol, bits);
      } else if (picked.type === "ByteArray") {
        blocks = decodeLEB128Varints(picked.v, vol);
      } else if (picked.type === "IntArray") {
        blocks = new Uint32Array(picked.v);
      }
    }
  }
  else {
    const tryGeneric = () => {
      const objs = [root, root.Blocks].filter(Boolean);
      for (const obj of objs) {
        const palObj = obj?.Palette || obj?.BlockStatePalette;
        const anyBlockArray = obj?.BlockStates || obj?.BlockData || obj?.Data;
        if (palObj && anyBlockArray) {
          setDimsFrom(root);
          const vol = volume();
          const { arr: palArr, count: palCount } = buildPaletteArray(palObj);
          paletteStr = palArr;
          if (obj.BlockStates) {
            const bits = Math.max(4, Math.ceil(Math.log2(Math.max(1, palCount))));
            blocks = decodePackedBlockStates(obj.BlockStates, vol, bits);
          } else if (obj.BlockData) {
            const bytes = obj.BlockData;
            blocks = decodeLEB128Varints(bytes, vol);
          } else if (obj.Data) {
            const arr = obj.Data;
            if (arr instanceof Int32Array && arr.length === vol) blocks = new Uint32Array(arr);
            else if (arr instanceof Uint8Array) blocks = (arr.length === vol) ? new Uint32Array(arr) : decodeLEB128Varints(arr, vol);
          }
          return true;
        }
      }
      return false;
    };
    if (!tryGeneric()) throw new Error("Unknown/unsupported schematic format (no palette/block arrays found)");
  }

  console.log(`Detected schematic type: ${fmt}`);
  console.log(`Dims: ${width}x${height}x${length}  Volume=${(width | 0) * (height | 0) * (length | 0)}`);

  return {
    width,
    height,
    length,
    type: fmt,
    order: "XZY",
    legacyBlocks,
    legacyData,
    blocks,
    paletteStr
  };
}

function coordsXZY(i, w, h, l) {
  const x = i % w;
  const z = Math.floor(i / w) % l;
  const y = Math.floor(i / (w * l));
  return [x, y, z];
}

function indexXZY(x, y, z, w, h, l) {
  return x + z * w + y * w * l;
}

export {
  maybeDecompress,
  parseNBT,
  normalizeNamespace,
  buildStateName,
  decodeLEB128Varints,
  decodePackedBlockStates,
  buildPaletteArray,
  normalizeClassicArray,
  loadSchematic,
  coordsXZY,
  indexXZY
};
