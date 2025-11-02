import { coordsXZY, indexXZY } from './schematic-reader.js';

const exact = new Set([ 
  "minecraft:air", "minecraft:azalea", "minecraft:pale_hanging_moss", "minecraft:lever", "minecraft:hopper", "minecraft:heavy_core", "minecraft:glow_lichen", "minecraft:mangrove_propagule", "minecraft:dandelion", "minecraft:poppy", "minecraft:blue_orchid", "minecraft:allium", "minecraft:azure_bluet", "minecraft:oxeye_daisy", "minecraft:wither_rose", "minecraft:peony", "minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroots", "minecraft:melon_stem", "minecraft:pumpkin_stem", "minecraft:cocoa", "minecraft:nether_wart", "minecraft:bamboo", "minecraft:sugar_cane", "minecraft:kelp", "minecraft:seagrass", "minecraft:sea_pickle", "minecraft:red_mushroom", "minecraft:brown_mushroom", "minecraft:decorated_pot", "minecraft:vault", "minecraft:leaf_litter", "minecraft:pink_petals", "minecraft:nether_sprouts", "minecraft:pitcher_crop", "minecraft:open_eyeblossom", "minecraft:closed_eyeblossom", "minecraft:portal", "minecraft:end_portal_frame", "minecraft:lantern", "minecraft:campfire", "minecraft:soul_campfire", "minecraft:brewing_stand", "minecraft:grindstone", "minecraft:enchanting_table", "minecraft:lectern", "minecraft:redstone_wire", "minecraft:repeater", "minecraft:comparator", "minecraft:bed", "minecraft:ladder", "minecraft:scaffolding", "minecraft:bell", "minecraft:tripwire", "minecraft:string", "minecraft:painting", "minecraft:item_frame", "minecraft:glow_item_frame", "minecraft:barrier", "minecraft:web", "minecraft:beacon", "minecraft:conduit", "minecraft:stonecutter_block", "minecraft:frog_spawn", "minecraft:amethyst_cluster", "minecraft:structure_void", "minecraft:grass_path", "minecraft:farmland", "minecraft:resin_clump", "minecraft:ominous_vault", "minecraft:dried_ghast", "minecraft:ice", "minecraft:honey_block", "minecraft:slime", "minecraft:light_block", "minecraft:tripwire_hook", "minecraft:snow_layer", "minecraft:powder_snow"
]);

const includes = [
  "_leaves", "water", "_slab", "_stairs", "_shelf", "_door", "trapdoor", "_button", "pressure_plate", "glass", "_egg", "cake", "chest", "rail", "candle", "_wall", "_fence", "_coral", "chain", "sign", "_statue", "sapling", "anvil", "banner", "vine", "carpet", "_bar", "cactus", "_lantern", "_tulip", "_grate", "_grass", "bush", "fern", "torch", "rod", "_head", "flower", "_roots", "_plant", "_skull", "_bud", "lava", "_drip", ":lil", "spawner",
];

function stripState(name) {
  return name ? name.split("[")[0] : "";
}

const NON_SOLID_BLOCKS = new Set();

for (const id of EXACT_NON_SOLID) {
  NON_SOLID_BLOCKS.add(id);
}

function matchesIncludes(name) {
  return INCLUDES_NON_SOLID.some(sub => name.includes(sub));
}

function isNonSolid(name) {
  if (!name) return false;
  const base = stripState(name);
  return NON_SOLID_BLOCKS.has(base) || matchesIncludes(base);
}

function makeIsSolidBlock() {
  const cache = new Map();
  return function isSolidBlock(name) {
    if (!name) return false;
    if (cache.has(name)) return cache.get(name);
    const solid = !isNonSolid(name);
    cache.set(name, solid);
    return solid;
  };
}

const isSolidBlock = makeIsSolidBlock();

function isHollowBlock(i, getKeyAt, w, h, l) {
  const [x, y, z] = coordsXZY(i, w, h, l);

  if (x <= 0 || y <= 0 || z <= 0 || x >= w - 1 || y >= h - 1 || z >= l - 1) return false;

  if (!isSolidBlock(getKeyAt(indexXZY(x + 1, y, z, w, h, l)))) return false;
  if (!isSolidBlock(getKeyAt(indexXZY(x - 1, y, z, w, h, l)))) return false;
  if (!isSolidBlock(getKeyAt(indexXZY(x, y + 1, z, w, h, l)))) return false;
  if (!isSolidBlock(getKeyAt(indexXZY(x, y - 1, z, w, h, l)))) return false;
  if (!isSolidBlock(getKeyAt(indexXZY(x, y, z + 1, w, h, l)))) return false;
  if (!isSolidBlock(getKeyAt(indexXZY(x, y, z - 1, w, h, l)))) return false;

  return true;
}

function hollowOutSchematic(schem, baseGetKeyAt) {
  const { width: w, height: h, length: l } = schem;
  const volume = w * h * l;
  const hollowMask = new Uint8Array(volume);

  for (let i = 0; i < volume; i++) {
    const k = baseGetKeyAt(i);
    if (!isSolidBlock(k)) continue;
    if (isHollowBlock(i, baseGetKeyAt, w, h, l)) hollowMask[i] = 1;
  }

  return i => (hollowMask[i] ? null : baseGetKeyAt(i));
}

export {
  NON_SOLID_BLOCKS,
  stripState,
  isSolidBlock,
  isHollowBlock,
  hollowOutSchematic
};
