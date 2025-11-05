import { loadWorldRegions, extractRegion } from './js/world-reader.js';
import { loadTranslationData, makeMergeKeyGetter } from './js/translation.js';
import { hollowOutSchematic } from './js/hollowing.js';
import { applyRotation } from './js/rotation.js';
import { applyMirroring } from './js/mirroring.js';
import { addStructureVoidSupport } from './js/structure-void.js';
import { generateCommands } from './js/command-writer.js';
import { createNbtBuffer, convertCommandsToStructure } from './js/structure-converter.js';
import { buildMcpack } from './js/pack.js';

let worldFile = null;
let mcaFiles = null;

const dropZone = document.getElementById('drop-zone');
const browseButton = document.getElementById('browse-button');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');

const x1Input = document.querySelector('input[placeholder="X1"]');
const y1Input = document.querySelector('input[placeholder="Y1"]');
const z1Input = document.querySelector('input[placeholder="Z1"]');
const x2Input = document.querySelector('input[placeholder="X2"]');
const y2Input = document.querySelector('input[placeholder="Y2"]');
const z2Input = document.querySelector('input[placeholder="Z2"]');
const outputNameInput = document.querySelector('input[placeholder="Enter the name for the output file"]');
const outputFormatSelect = document.querySelector('select');
const hollowToggle = document.querySelector('input[type="checkbox"]');
const structureVoidToggle = document.querySelectorAll('input[type="checkbox"]')[1];
const rotationSelect = document.querySelectorAll('select')[1];
const mirrorXBtn = document.getElementById('mirror-x');
const mirrorYBtn = document.getElementById('mirror-y');
const mirrorZBtn = document.getElementById('mirror-z');
const convertButton = document.querySelector('.glow-shadow');

function showStatus(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);
}

async function handleFileSelect(file) {
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.zip')) {
    alert('Please select a .zip file containing Minecraft world data');
    return;
  }
  
  worldFile = file;
  fileNameDisplay.textContent = file.name;
  showStatus(`Loading world file: ${file.name}`, 'info');
  
  try {
    mcaFiles = await loadWorldRegions(file);
    const regionCount = Object.keys(mcaFiles).length;
    showStatus(`World loaded! Found ${regionCount} region file(s)`, 'success');
    alert(`World loaded successfully!\nFound ${regionCount} region file(s).\nNow enter coordinates and click "Begin Conversion".`);
  } catch (error) {
    console.error('Error loading world:', error);
    alert('Error loading world file: ' + error.message);
    worldFile = null;
    mcaFiles = null;
  }
}

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFileSelect(files[0]);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

browseButton.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

[mirrorXBtn, mirrorYBtn, mirrorZBtn].forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
  });
});

async function convertWorld() {
  if (!mcaFiles) {
    alert('Please load a world file first');
    return;
  }
  
  const x1 = parseInt(x1Input.value);
  const y1 = parseInt(y1Input.value);
  const z1 = parseInt(z1Input.value);
  const x2 = parseInt(x2Input.value);
  const y2 = parseInt(y2Input.value);
  const z2 = parseInt(z2Input.value);
  
  if (isNaN(x1) || isNaN(y1) || isNaN(z1) || isNaN(x2) || isNaN(y2) || isNaN(z2)) {
    alert('Please enter valid coordinates');
    return;
  }
  
  const width = Math.abs(x2 - x1) + 1;
  const height = Math.abs(y2 - y1) + 1;
  const length = Math.abs(z2 - z1) + 1;
  const totalBlocks = width * height * length;
  
  if (totalBlocks > 1000000) {
    const sizeWarning = `WARNING: This region contains ${totalBlocks.toLocaleString()} blocks (${width}x${height}x${length}).\n\n` +
      `Large regions may take time to process.\n\n` +
      `Recommended limits for best performance:\n` +
      `• Build Pack: ~1,000,000 blocks (100x100x100)\n` +
      `• McStructure: ~250,000 blocks (64x64x64)\n` +
      `• Command Dump: ~500,000 blocks (80x80x80)\n\n` +
      `Do you want to continue?`;
    
    if (!confirm(sizeWarning)) {
      return;
    }
  }
  
  const outputName = outputNameInput.value.trim() || 'world_export';
  const outputFormat = outputFormatSelect.value.toLowerCase().replace(' ', '_');
  const hollow = hollowToggle.checked;
  const structureVoid = structureVoidToggle.checked;
  const rotation = parseInt(rotationSelect.selectedIndex) * 90;
  const mirrorX = mirrorXBtn.classList.contains('active');
  const mirrorY = mirrorYBtn.classList.contains('active');
  const mirrorZ = mirrorZBtn.classList.contains('active');
  
  convertButton.disabled = true;
  convertButton.textContent = 'Converting...';
  
  try {
    await loadTranslationData();
    
    const progressCallback = (progress) => {
      console.log(`${progress.stage}: ${progress.message}`);
      convertButton.textContent = `${progress.stage}...`;
    };
    
    showStatus('Extracting world region as schematic...');
    convertButton.textContent = 'Extracting region...';
    
    const regionData = await extractRegion(
      mcaFiles, x1, y1, z1, x2, y2, z2, progressCallback
    );
    
    const blockIndices = regionData.blocks.map(b => b.block);
    
    const schem = {
      type: 'sponge',
      width: regionData.width,
      height: regionData.height,
      length: regionData.length,
      blocks: blockIndices,
      paletteStr: regionData.palette,
      offset: regionData.offset
    };
    
    console.log(`World region loaded as schematic: ${schem.width}x${schem.height}x${schem.length}`);
    showStatus(`Region extracted: ${schem.width}x${schem.height}x${schem.length}`);
    
    let getKeyAt = makeMergeKeyGetter(schem);
    let currentSchem = schem;
    
    if (rotation !== 0) {
      showStatus(`Rotating ${rotation}°...`);
      convertButton.textContent = `Rotating ${rotation}°...`;
      console.log(`Applying rotation: ${rotation}°`);
      const rotationResult = applyRotation(currentSchem, getKeyAt, rotation);
      getKeyAt = rotationResult.getKeyAt;
      currentSchem = rotationResult.rotatedSchem;
      console.log('Rotation applied successfully');
    }
    
    if (mirrorX || mirrorY || mirrorZ) {
      const axes = [];
      if (mirrorX) axes.push('X');
      if (mirrorY) axes.push('Y');
      if (mirrorZ) axes.push('Z');
      showStatus(`Mirroring across ${axes.join(', ')}...`);
      convertButton.textContent = 'Mirroring...';
      console.log(`Applying mirror transformation: ${axes.join(', ')} axis`);
      getKeyAt = applyMirroring(currentSchem, getKeyAt, mirrorX, mirrorY, mirrorZ);
      console.log('Mirroring applied successfully');
    }
    
    if (hollow) {
      showStatus('Hollowing out schematic...');
      convertButton.textContent = 'Hollowing...';
      console.log('Hollowing out schematic...');
      getKeyAt = hollowOutSchematic(currentSchem, getKeyAt);
      console.log('Hollowing completed');
    }
    
    if (structureVoid) {
      showStatus('Adding barrier support for gravity blocks...');
      convertButton.textContent = 'Adding barriers...';
      console.log('Adding barrier support for gravity blocks...');
      getKeyAt = addStructureVoidSupport(currentSchem, getKeyAt);
      console.log('Barrier support added');
    }
    
    if (outputFormat === 'command_dump') {
      showStatus('Generating commands...');
      convertButton.textContent = 'Generating commands...';
      console.log('Generating commands...');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      console.log(`Generated ${commands.length} commands`);
      
      const text = commands.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `${outputName}.txt`);
      
      alert(`Success! Generated ${commands.length} commands`);
      console.log('Conversion complete!');
      
    } else if (outputFormat === 'mcstructure') {
      if (currentSchem.width > 250 || currentSchem.length > 250) {
        alert('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      showStatus('Generating commands for structure...');
      convertButton.textContent = 'Generating structure...';
      console.log('Generating commands for structure...');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      
      if (commands.length === 0) {
        alert('No commands generated - structure is empty');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      console.log(`Generated ${commands.length} commands`);
      showStatus(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`);
      convertButton.textContent = 'Creating .mcstructure...';
      const structureData = convertCommandsToStructure(commands, {
        width: currentSchem.width,
        height: currentSchem.height,
        length: currentSchem.length,
        baseCoords: [0, 0, 0]
      });
      
      if (!structureData) {
        alert('Failed to convert commands to structure data');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      console.log('Converting to NBT format...');
      const nbtBuffer = createNbtBuffer(structureData);
      const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, `${outputName}.mcstructure`);
      
      alert(`Success! Created .mcstructure with ${commands.length} commands`);
      console.log('Conversion complete!');
      
    } else {
      showStatus('Building mcpack...');
      convertButton.textContent = 'Building mcpack...';
      console.log('Building mcpack...');
      const blob = await buildMcpack(currentSchem, getKeyAt, outputName, (progress) => {
        showStatus(`${progress.stage}: ${progress.message}`);
        console.log(`${progress.stage}: ${progress.message}`);
      });
      
      downloadBlob(blob, `${outputName}.mcpack`);
      
      alert('Success! Build pack created!');
      console.log('Conversion complete!');
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
    alert('Error during conversion: ' + error.message);
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = 'Begin Conversion';
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

if (convertButton) {
  convertButton.addEventListener('click', convertWorld);
}

console.log('World Converter initialized');
loadTranslationData().catch(console.error);
