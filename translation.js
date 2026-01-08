import { buildStateName, normalizeNamespace } from './schematic-reader.js';

let legacyMap = null;
let javaToBedrockMap = null;

async function loadTranslationData() {
  if (legacyMap && javaToBedrockMap) return;
  
  const [legacyResponse, javaToBedrockResponse] = await Promise.all([
    fetch('./legacy-conversion-map.json'),
    fetch('./java-to-bedrock.json')
  ]);
  
  legacyMap = await legacyResponse.json();
  javaToBedrockMap = await javaToBedrockResponse.json();
}

const INVALID_BLOCKS = new Set([
  "minecraft:piston_head",
  "minecraft:moving_block",
  "minecraft:moving_piston",
]);

const isAir = (n) => n === "minecraft:air" || n === "minecraft:cave_air" || n === "minecraft:void_air";

function isNumericOrBoolean(value) {
  if (typeof value === "boolean") return true;
  if (value === "true" || value === "false") return true;
  return Number.isFinite(Number(value));
}

function makeMergeKeyGetter(schem) {
  const { type } = schem;
  const paletteToBedrock = new Map();
  const classicToBedrock = new Map();

  if (type === "classic") {
    const blocks = schem.legacyBlocks;
    const data = schem.legacyData;
    return function (i) {
      const id = blocks[i];
      const dv = data[i] ?? 0;
      const key = `${id}:${dv}`;
      if (classicToBedrock.has(key)) return classicToBedrock.get(key);
      const javaName = legacyMap[key] ?? legacyMap[`${id}:0`] ?? "minecraft:air";
      const bedrockName = translateBlock(javaName);
      classicToBedrock.set(key, bedrockName);
      return bedrockName;
    };
  } else {
    const palette = schem.paletteStr || [];
    return function (i) {
      const paletteIndex = schem.blocks[i];
      if (paletteIndex == null || paletteIndex >= palette.length) return null;
      if (paletteToBedrock.has(paletteIndex)) return paletteToBedrock.get(paletteIndex);
      const javaName = palette[paletteIndex];
      const bedrockName = translateBlock(javaName);
      paletteToBedrock.set(paletteIndex, bedrockName);
      return bedrockName;
    };
  }
}

function translateBlock(javaBlock) {
  if (!javaBlock) return null;
  if (typeof javaBlock === "object") javaBlock = buildStateName(javaBlock);
  if (typeof javaBlock !== "string") javaBlock = String(javaBlock);

  let [namePart, stateStr] = javaBlock.split("[");
  let blockName = normalizeNamespace(namePart);

  if (isAir(blockName) || INVALID_BLOCKS.has(blockName)) return null;

  const mapEntry =
    javaToBedrockMap[blockName] ??
    javaToBedrockMap[blockName.replace(/^minecraft:/, "")] ??
    null;

  const javaStates = {};
  if (stateStr) {
    stateStr = stateStr.replace(/\]$/, "");
    if (stateStr.length) {
      for (const part of stateStr.split(",")) {
        const [k, v] = part.split("=");
        if (k) javaStates[k] = v;
      }
    }
  }

  if (mapEntry?.defaults && Object.keys(javaStates).length === 0) {
    for (const [k, v] of Object.entries(mapEntry.defaults)) {
      javaStates[k] = String(v);
    }
  }

  let bedrockName = null;
  let localAdditions = { ...(mapEntry?.additions ?? {}) };
  let localRemovals = [...(mapEntry?.removals ?? [])];
  let localRenames = { ...(mapEntry?.renames ?? {}) };
  let localRemaps = { ...(mapEntry?.remaps ?? {}) };

  if (mapEntry?.mapping && mapEntry.identifier) {
    const idKeys = Array.isArray(mapEntry.identifier) ? mapEntry.identifier : [mapEntry.identifier];
    let node = mapEntry.mapping;

    for (const key of idKeys) {
      const val = javaStates[key];
      if (val !== undefined && node[val] !== undefined) {
        node = node[val];
      } else if (node.def !== undefined) {
        node = node.def;
      } else {
        node = null;
        break;
      }
    }

    if (node) {
      if (typeof node === "string") {
        bedrockName = normalizeNamespace(node);
      } else if (node && typeof node === "object" && !Array.isArray(node)) {
        bedrockName = normalizeNamespace(node.name || buildStateName(node));
        if (node.additions) Object.assign(localAdditions, node.additions);
        if (node.removals) localRemovals.push(...node.removals);
        if (node.renames) Object.assign(localRenames, node.renames);
        if (node.remaps) Object.assign(localRemaps, node.remaps);
      }
    }

    for (const key of idKeys) delete javaStates[key];
  }

  if (!bedrockName && mapEntry?.name) bedrockName = normalizeNamespace(mapEntry.name);
  if (!bedrockName) bedrockName = blockName;

  for (const key of localRemovals) delete javaStates[key];
  if (mapEntry?.tile_extra) {
    for (const javaKey of Object.values(mapEntry.tile_extra)) delete javaStates[javaKey];
  }

  const bedrockStates = [];
  for (const [jKey, jValRaw] of Object.entries(javaStates)) {
    const renamedKey = localRenames[jKey] || jKey;
    let value = jValRaw;

    const remapSpec = localRemaps[renamedKey] ?? localRemaps[jKey];
    if (remapSpec !== undefined) {
      if (Array.isArray(remapSpec)) {
        const idx = Number(value);
        if (Number.isFinite(idx) && remapSpec[idx] !== undefined) value = remapSpec[idx];
      } else if (remapSpec && typeof remapSpec === "object" && !Array.isArray(remapSpec) && remapSpec[value] !== undefined) {
        value = remapSpec[value];
      }
    }

    const valStr = isNumericOrBoolean(value) ? String(value) : `"${value}"`;
    bedrockStates.push(`"${renamedKey}"=${valStr}`);
  }

  for (const [k, v] of Object.entries(localAdditions)) {
    const valStr = isNumericOrBoolean(v) ? String(v) : `"${v}"`;
    bedrockStates.push(`"${k}"=${valStr}`);
  }

  if (bedrockStates.length) bedrockName += `[${bedrockStates.join(",")}]`;

  if (typeof bedrockName === "object") bedrockName = buildStateName(bedrockName);
  if (typeof bedrockName !== "string") bedrockName = String(bedrockName);

  const outNameOnly = normalizeNamespace(bedrockName.split("[")[0]);
  if (isAir(outNameOnly) || INVALID_BLOCKS.has(outNameOnly)) return null;

  return bedrockName;
}

export {
  loadTranslationData,
  INVALID_BLOCKS,
  isAir,
  isNumericOrBoolean,
  makeMergeKeyGetter,
  translateBlock
};
