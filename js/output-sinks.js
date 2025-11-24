import { generateCommands } from './command-writer.js';
import { convertCommandsToStructure, createNbtBuffer } from './structure-converter.js';
import { buildMcpack } from './pack.js';

class CommandSink {
  constructor() {
    this.blocks = [];
    this.palette = new Map();
    this.paletteIndex = 0;
    this.metadata = null;
  }

  async process(blockStream, onProgress) {
    return new Promise((resolve, reject) => {
      blockStream
        .onMetadata(metadata => {
          this.metadata = metadata;
          this.palette.set('minecraft:air', this.paletteIndex++);
        })
        .onBlock(block => {
          if (block.blockState !== 'minecraft:air') {
            if (!this.palette.has(block.blockState)) {
              this.palette.set(block.blockState, this.paletteIndex++);
            }
            this.blocks.push({
              x: block.x,
              y: block.y,
              z: block.z,
              block: this.palette.get(block.blockState)
            });
          }
        })
        .onComplete(() => {
          try {
            const paletteArray = Array.from(this.palette.entries())
              .sort((a, b) => a[1] - b[1])
              .map(([name]) => name);
            
            const schem = {
              width: this.metadata.width,
              height: this.metadata.height,
              length: this.metadata.length,
              blocks: this.blocks,
              palette: paletteArray,
              type: 'modern'
            };
            
            const getKeyAt = (x, y, z) => {
              const block = this.blocks.find(b => b.x === x && b.y === y && b.z === z);
              return block ? paletteArray[block.block] : 'minecraft:air';
            };
            
            if (onProgress) {
              onProgress({ stage: 'Generating', message: 'Creating commands...' });
            }
            
            const commands = generateCommands(schem, getKeyAt, { useRelativeCoords: true });
            const text = commands.join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            
            resolve({ blob, commands });
          } catch (error) {
            reject(error);
          }
        });
    });
  }
}

class StructureSink {
  constructor() {
    this.blocks = [];
    this.palette = new Map();
    this.paletteIndex = 0;
    this.metadata = null;
  }

  async process(blockStream, onProgress) {
    return new Promise((resolve, reject) => {
      blockStream
        .onMetadata(metadata => {
          this.metadata = metadata;
          this.palette.set('minecraft:air', this.paletteIndex++);
          
          if (metadata.width > 250 || metadata.length > 250) {
            reject(new Error(`Schematic too large for McStructure (${metadata.width}x${metadata.length}). Maximum is 250x250. Use Build Pack instead.`));
          }
        })
        .onBlock(block => {
          if (block.blockState !== 'minecraft:air') {
            if (!this.palette.has(block.blockState)) {
              this.palette.set(block.blockState, this.paletteIndex++);
            }
            this.blocks.push({
              x: block.x,
              y: block.y,
              z: block.z,
              block: this.palette.get(block.blockState)
            });
          }
        })
        .onComplete(() => {
          try {
            const paletteArray = Array.from(this.palette.entries())
              .sort((a, b) => a[1] - b[1])
              .map(([name]) => name);
            
            const schem = {
              width: this.metadata.width,
              height: this.metadata.height,
              length: this.metadata.length,
              blocks: this.blocks,
              palette: paletteArray,
              type: 'modern'
            };
            
            const getKeyAt = (x, y, z) => {
              const block = this.blocks.find(b => b.x === x && b.y === y && b.z === z);
              return block ? paletteArray[block.block] : 'minecraft:air';
            };
            
            if (onProgress) {
              onProgress({ stage: 'Generating', message: 'Creating commands...' });
            }
            
            const commands = generateCommands(schem, getKeyAt, { useRelativeCoords: true });
            
            if (onProgress) {
              onProgress({ stage: 'Converting', message: 'Creating mcstructure...' });
            }
            
            const structureData = convertCommandsToStructure(commands, {
              width: this.metadata.width,
              height: this.metadata.height,
              length: this.metadata.length,
              baseCoords: [0, 0, 0]
            });
            
            const nbtBuffer = createNbtBuffer(structureData);
            const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
            
            resolve({ blob, commands });
          } catch (error) {
            reject(error);
          }
        });
    });
  }
}

class PackSink {
  constructor() {
    this.blocks = [];
    this.palette = new Map();
    this.paletteIndex = 0;
    this.metadata = null;
  }

  async process(blockStream, onProgress) {
    return new Promise((resolve, reject) => {
      blockStream
        .onMetadata(metadata => {
          this.metadata = metadata;
          this.palette.set('minecraft:air', this.paletteIndex++);
        })
        .onBlock(block => {
          if (block.blockState !== 'minecraft:air') {
            if (!this.palette.has(block.blockState)) {
              this.palette.set(block.blockState, this.paletteIndex++);
            }
            this.blocks.push({
              x: block.x,
              y: block.y,
              z: block.z,
              block: this.palette.get(block.blockState)
            });
          }
        })
        .onComplete(async () => {
          try {
            const paletteArray = Array.from(this.palette.entries())
              .sort((a, b) => a[1] - b[1])
              .map(([name]) => name);
            
            const schem = {
              width: this.metadata.width,
              height: this.metadata.height,
              length: this.metadata.length,
              blocks: this.blocks,
              palette: paletteArray,
              type: 'modern'
            };
            
            const getKeyAt = (x, y, z) => {
              const block = this.blocks.find(b => b.x === x && b.y === y && b.z === z);
              return block ? paletteArray[block.block] : 'minecraft:air';
            };
            
            const blob = await buildMcpack(schem, getKeyAt, 'world_export', onProgress);
            resolve({ blob });
          } catch (error) {
            reject(error);
          }
        });
    });
  }
}

export { CommandSink, StructureSink, PackSink };
