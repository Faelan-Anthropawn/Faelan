import { maybeDecompress, parseNBT, buildStateName, decodePackedBlockStates } from './schematic-reader.js';

async function litematicToWorldEdit(arrayBuffer, filename) {
  const buf = maybeDecompress(new Uint8Array(arrayBuffer));
  const root = parseNBT(buf);
  const dataVersion = root.MinecraftDataVersion ?? 2730;
  const regions = root.Regions;

  for (const [regionName, region] of Object.entries(regions)) {
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

  throw new Error("No regions found in litematic file");
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
