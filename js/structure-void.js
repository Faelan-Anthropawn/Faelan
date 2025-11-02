import { coordsXZY, indexXZY } from './schematic-reader.js';

const GRAVITY_BLOCKS = new Set([
  "minecraft:sand", "minecraft:red_sand", "minecraft:gravel", "minecraft:scaffolding", "minecraft:suspicous_sand", "minecraft:suspicous_gravel", "minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil", "minecraft:black_concrete_powder", "minecraft:blue_concrete_powder", "minecraft:cyan_concrete_powder", "minecraft:gray_concrete_powder", "minecraft:green_concrete_powder", "minecraft:light_blue_concrete_powder", "minecraft:light_gray_concrete_powder", "minecraft:lime_concrete_powder", "minecraft:magenta_concrete_powder", "minecraft:orange_concrete_powder", "minecraft:pink_concrete_powder", "minecraft:purple_concrete_powder", "minecraft:red_concrete_powder", "minecraft:white_concrete_powder", "minecraft:yellow_concrete_powder",
]);

function stripState(name) {
  return name ? name.split("[")[0] : "";
}

function isGravityBlock(name) {
  if (!name) return false;
  const base = stripState(name);
  return GRAVITY_BLOCKS.has(base);
}

function isAirBlock(name) {
  if (!name) return true;
  const base = stripState(name);
  return base === "air" || base === "minecraft:air" || base === "";
}

function addStructureVoidSupport(schem, baseGetKeyAt) {
  const { width: w, height: h, length: l } = schem;
  const structureVoidMap = new Map();
  const belowBoundsBarriers = [];
  const volume = w * h * l;

  for (let i = 0; i < volume; i++) {
    const blockName = baseGetKeyAt(i);
    if (!isGravityBlock(blockName)) continue;

    const [x, y, z] = coordsXZY(i, w, h, l);
    const belowY = y - 1;

    if (belowY >= 0) {
      const belowIndex = indexXZY(x, belowY, z, w, h, l);
      const belowBlock = baseGetKeyAt(belowIndex);
      if (isAirBlock(belowBlock)) {
        structureVoidMap.set(belowIndex, "barrier");
      }
    } else {
      const key = `${x},${z}`;
      if (!belowBoundsBarriers.some(b => `${b.x},${b.z}` === key)) {
        belowBoundsBarriers.push({ x, y: belowY, z });
      }
    }
  }

  const getter = (i) => structureVoidMap.get(i) ?? baseGetKeyAt(i);
  getter.belowBoundsBarriers = belowBoundsBarriers;
  return getter;
}

export {
  GRAVITY_BLOCKS,
  stripState,
  isGravityBlock,
  isAirBlock,
  addStructureVoidSupport,
};
