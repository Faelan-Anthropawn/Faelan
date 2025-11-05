class BlockStream {
  constructor() {
    this.listeners = [];
    this.metadataHandlers = [];
    this.completeHandlers = [];
  }

  onBlock(callback) {
    this.listeners.push(callback);
    return this;
  }

  onMetadata(callback) {
    this.metadataHandlers.push(callback);
    return this;
  }

  onComplete(callback) {
    this.completeHandlers.push(callback);
    return this;
  }

  emitMetadata(metadata) {
    this.metadataHandlers.forEach(handler => handler(metadata));
  }

  emitBlock(x, y, z, blockState) {
    this.listeners.forEach(listener => listener({ x, y, z, blockState }));
  }

  emitComplete() {
    this.completeHandlers.forEach(handler => handler());
  }
}

class StreamingTransformer extends BlockStream {
  constructor(sourceStream) {
    super();
    this.sourceStream = sourceStream;
    this.metadata = null;
  }

  start() {
    this.sourceStream
      .onMetadata(metadata => this.handleMetadata(metadata))
      .onBlock(block => this.handleBlock(block))
      .onComplete(() => this.handleComplete());
    return this;
  }

  handleMetadata(metadata) {
    this.metadata = metadata;
    this.emitMetadata(this.transformMetadata(metadata));
  }

  handleBlock(block) {
    const transformed = this.transformBlock(block);
    if (transformed) {
      this.emitBlock(transformed.x, transformed.y, transformed.z, transformed.blockState);
    }
  }

  handleComplete() {
    this.emitComplete();
  }

  transformMetadata(metadata) {
    return metadata;
  }

  transformBlock(block) {
    return block;
  }
}

class RotationTransformer extends StreamingTransformer {
  constructor(sourceStream, rotation) {
    super(sourceStream);
    this.rotation = rotation;
  }

  transformMetadata(metadata) {
    const { width, height, length } = metadata;
    
    if (this.rotation === 90 || this.rotation === 270) {
      return {
        ...metadata,
        width: length,
        length: width
      };
    }
    
    return metadata;
  }

  transformBlock(block) {
    const { width, height, length } = this.metadata;
    let { x, y, z } = block;
    
    switch (this.rotation) {
      case 90:
        return { x: length - 1 - z, y, z: x, blockState: this.rotateBlockState(block.blockState, 90) };
      case 180:
        return { x: width - 1 - x, y, z: length - 1 - z, blockState: this.rotateBlockState(block.blockState, 180) };
      case 270:
        return { x: z, y, z: width - 1 - x, blockState: this.rotateBlockState(block.blockState, 270) };
      default:
        return block;
    }
  }

  rotateBlockState(blockState, rotation) {
    const facingMatch = blockState.match(/facing=(\w+)/);
    if (!facingMatch) return blockState;
    
    const facing = facingMatch[1];
    const rotations = {
      90: { north: 'east', east: 'south', south: 'west', west: 'north' },
      180: { north: 'south', east: 'west', south: 'north', west: 'east' },
      270: { north: 'west', east: 'north', south: 'east', west: 'south' }
    };
    
    const newFacing = rotations[rotation][facing] || facing;
    return blockState.replace(/facing=\w+/, `facing=${newFacing}`);
  }
}

class MirrorTransformer extends StreamingTransformer {
  constructor(sourceStream, mirrorX, mirrorY, mirrorZ) {
    super(sourceStream);
    this.mirrorX = mirrorX;
    this.mirrorY = mirrorY;
    this.mirrorZ = mirrorZ;
  }

  transformBlock(block) {
    const { width, height, length } = this.metadata;
    let { x, y, z, blockState } = block;
    
    if (this.mirrorX) {
      x = width - 1 - x;
      blockState = this.mirrorBlockStateX(blockState);
    }
    if (this.mirrorY) {
      y = height - 1 - y;
      blockState = this.mirrorBlockStateY(blockState);
    }
    if (this.mirrorZ) {
      z = length - 1 - z;
      blockState = this.mirrorBlockStateZ(blockState);
    }
    
    return { x, y, z, blockState };
  }

  mirrorBlockStateX(blockState) {
    return blockState
      .replace(/facing=east/g, '__TEMP_WEST__')
      .replace(/facing=west/g, 'facing=east')
      .replace(/__TEMP_WEST__/g, 'facing=west');
  }

  mirrorBlockStateY(blockState) {
    return blockState
      .replace(/half=top/g, '__TEMP_BOTTOM__')
      .replace(/half=bottom/g, 'half=top')
      .replace(/__TEMP_BOTTOM__/g, 'half=bottom');
  }

  mirrorBlockStateZ(blockState) {
    return blockState
      .replace(/facing=north/g, '__TEMP_SOUTH__')
      .replace(/facing=south/g, 'facing=north')
      .replace(/__TEMP_SOUTH__/g, 'facing=south');
  }
}

class HollowTransformer extends StreamingTransformer {
  constructor(sourceStream) {
    super(sourceStream);
    this.slicesByY = new Map();
    this.processedSlices = new Set();
    this.yLevels = [];
  }

  handleBlock(block) {
    if (block.blockState === 'minecraft:air') return;
    
    if (!this.slicesByY.has(block.y)) {
      this.slicesByY.set(block.y, new Map());
      this.yLevels.push(block.y);
      this.yLevels.sort((a, b) => a - b);
    }
    
    const key = `${block.x},${block.z}`;
    this.slicesByY.get(block.y).set(key, block.blockState);
  }

  handleComplete() {
    const { width, height, length } = this.metadata;
    
    for (const y of this.yLevels) {
      const slice = this.slicesByY.get(y);
      
      for (const [key, blockState] of slice.entries()) {
        if (blockState !== 'minecraft:air') {
          const [x, z] = key.split(',').map(Number);
          
          if (x === 0 || x === width - 1 || y === 0 || y === height - 1 || z === 0 || z === length - 1) {
            this.emitBlock(x, y, z, blockState);
          } else {
            const hasTop = this.hasBlockAt(x, y + 1, z);
            const hasBottom = this.hasBlockAt(x, y - 1, z);
            const hasNorth = this.hasBlockAt(x, y, z - 1);
            const hasSouth = this.hasBlockAt(x, y, z + 1);
            const hasEast = this.hasBlockAt(x + 1, y, z);
            const hasWest = this.hasBlockAt(x - 1, y, z);
            
            if (hasTop && hasBottom && hasNorth && hasSouth && hasEast && hasWest) {
              this.emitBlock(x, y, z, 'minecraft:air');
            } else {
              this.emitBlock(x, y, z, blockState);
            }
          }
        }
      }
    }
    
    this.emitComplete();
  }

  hasBlockAt(x, y, z) {
    const slice = this.slicesByY.get(y);
    if (!slice) return false;
    const key = `${x},${z}`;
    const block = slice.get(key);
    return block && block !== 'minecraft:air';
  }
}

class StructureVoidTransformer extends StreamingTransformer {
  constructor(sourceStream) {
    super(sourceStream);
    this.slicesByY = new Map();
    this.yLevels = [];
    this.gravityBlocks = new Set([
      'minecraft:sand', 'minecraft:red_sand', 'minecraft:gravel',
      'minecraft:anvil', 'minecraft:dragon_egg', 'minecraft:concrete_powder'
    ]);
  }

  handleBlock(block) {
    if (block.blockState === 'minecraft:air') return;
    
    if (!this.slicesByY.has(block.y)) {
      this.slicesByY.set(block.y, new Map());
      this.yLevels.push(block.y);
      this.yLevels.sort((a, b) => a - b);
    }
    
    const key = `${block.x},${block.z}`;
    this.slicesByY.get(block.y).set(key, block.blockState);
  }

  handleComplete() {
    for (const y of this.yLevels) {
      const slice = this.slicesByY.get(y);
      
      for (const [key, blockState] of slice.entries()) {
        const [x, z] = key.split(',').map(Number);
        
        if (this.gravityBlocks.has(blockState) && y > 0) {
          const sliceBelow = this.slicesByY.get(y - 1);
          const blockBelow = sliceBelow ? sliceBelow.get(key) : null;
          
          if (!blockBelow || blockBelow === 'minecraft:air') {
            this.emitBlock(x, y - 1, z, 'minecraft:barrier');
          }
        }
        
        this.emitBlock(x, y, z, blockState);
      }
    }
    
    this.emitComplete();
  }
}

export {
  BlockStream,
  StreamingTransformer,
  RotationTransformer,
  MirrorTransformer,
  HollowTransformer,
  StructureVoidTransformer
};
