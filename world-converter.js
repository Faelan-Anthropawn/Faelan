import { loadWorldRegions, createBlockStreamFromWorld } from './js/world-reader.js';
import { loadSchematicFromStream } from './js/schematic-reader.js';
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

const dropZone = document.getElementById('world-drop-zone');
const browseButton = document.getElementById('world-browse-button');
const fileInput = document.getElementById('world-file-input');
const fileNameDisplay = document.getElementById('world-file-name');

const x1Input = document.getElementById('world-x1');
const y1Input = document.getElementById('world-y1');
const z1Input = document.getElementById('world-z1');
const x2Input = document.getElementById('world-x2');
const y2Input = document.getElementById('world-y2');
const z2Input = document.getElementById('world-z2');
const outputNameInput = document.getElementById('world-output-name');
const outputFormatSelect = document.getElementById('world-output-format');
const hollowToggle = document.getElementById('world-hollow-toggle');
const structureVoidToggle = document.getElementById('world-structure-void-toggle');
const rotationSelect = document.getElementById('world-rotation-select');
const mirrorXBtn = document.getElementById('world-mirror-x');
const mirrorYBtn = document.getElementById('world-mirror-y');
const mirrorZBtn = document.getElementById('world-mirror-z');
const convertButton = document.getElementById('world-convert-button');
const statusMessage = document.getElementById('world-status-message');
const consoleBox = document.getElementById('world-console-box');

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

function logToConsole(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'console-entry';
  
  const timestamp = document.createElement('span');
  timestamp.className = 'console-timestamp';
  timestamp.textContent = `[${getTimestamp()}]`;
  
  const text = document.createElement('span');
  text.textContent = message;
  
  if (type === 'error') {
    text.style.color = '#ef4444';
  } else if (type === 'success') {
    text.style.color = '#22c55e';
  } else if (type === 'info') {
    text.style.color = '#3b82f6';
  }
  
  entry.appendChild(timestamp);
  entry.appendChild(text);
  consoleBox.appendChild(entry);
  
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

function clearConsole() {
  consoleBox.innerHTML = '';
}

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

async function handleFileSelect(file) {
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showStatus('Please select a .zip file containing Minecraft world data', 'error');
    logToConsole('Error: Invalid file type. Please select a .zip file', 'error');
    alert('Please select a .zip file containing Minecraft world data');
    return;
  }
  
  worldFile = file;
  fileNameDisplay.textContent = file.name;
  showStatus(`Loading world file: ${file.name}`, 'info');
  logToConsole(`Loading world file: ${file.name}`, 'info');
  
  try {
    mcaFiles = await loadWorldRegions(file);
    const regionCount = Object.keys(mcaFiles).length;
    showStatus(`World loaded! Found ${regionCount} region file(s)`, 'success');
    logToConsole(`World loaded successfully! Found ${regionCount} region file(s)`, 'success');
    alert(`World loaded successfully!\nFound ${regionCount} region file(s).\nNow enter coordinates and click "Begin Conversion".`);
  } catch (error) {
    if (error.message === 'OLD_WORLD_FORMAT') {
      showStatus('World file is too old to process', 'error');
      logToConsole('Error: World contains .mcr files (pre-1.2.2 format)', 'error');
      alert('This world is too old to process. Try updating it to a post 1.2.2 format using a tool like chunker or je2be.');
    } else {
      showStatus('Error loading world file: ' + error.message, 'error');
      logToConsole('Error loading world: ' + error.message, 'error');
      alert('Error loading world file: ' + error.message);
    }
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
      `This runs entirely in your browser and can be processing heavy\n` +
      `Weak devices likely wont be able to run this conversion\n` +
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
  clearConsole();
  logToConsole('=== Starting World Conversion Process ===', 'info');
  logToConsole(`Output format: ${outputFormat}`, 'info');
  logToConsole(`Output name: ${outputName}`, 'info');
  logToConsole(`Region: (${x1}, ${y1}, ${z1}) to (${x2}, ${y2}, ${z2})`, 'info');
  
  try {
    showStatus('Loading translation data...', 'info');
    logToConsole('Loading translation data...', 'info');
    await loadTranslationData();
    logToConsole('Translation data loaded successfully', 'success');
    
    const progressCallback = (progress) => {
      logToConsole(`${progress.stage}: ${progress.message}`, 'info');
      convertButton.textContent = `${progress.stage}...`;
    };
    
    showStatus('Creating block stream from world region...', 'info');
    convertButton.textContent = 'Streaming world data...';
    logToConsole('Creating block stream from world region...', 'info');
    
    const blockStream = await createBlockStreamFromWorld(
      mcaFiles, x1, y1, z1, x2, y2, z2, progressCallback
    );
    
    showStatus('Loading schematic from stream...', 'info');
    convertButton.textContent = 'Processing blocks...';
    logToConsole('Loading schematic from stream...', 'info');
    
    const schem = await loadSchematicFromStream(blockStream);
    
    logToConsole(`World region loaded successfully`, 'success');
    logToConsole(`Dimensions: ${schem.width}x${schem.height}x${schem.length}`, 'info');
    showStatus(`Region extracted: ${schem.width}x${schem.height}x${schem.length}`, 'success');
    
    let getKeyAt = makeMergeKeyGetter(schem);
    let currentSchem = schem;
    
    if (rotation !== 0) {
      showStatus(`Rotating ${rotation}°...`, 'info');
      convertButton.textContent = `Rotating ${rotation}°...`;
      logToConsole(`Applying rotation: ${rotation}°`, 'info');
      const rotationResult = applyRotation(currentSchem, getKeyAt, rotation);
      getKeyAt = rotationResult.getKeyAt;
      currentSchem = rotationResult.rotatedSchem;
      logToConsole('Rotation applied successfully', 'success');
    }
    
    if (mirrorX || mirrorY || mirrorZ) {
      const axes = [];
      if (mirrorX) axes.push('X');
      if (mirrorY) axes.push('Y');
      if (mirrorZ) axes.push('Z');
      showStatus(`Mirroring across ${axes.join(', ')}...`, 'info');
      convertButton.textContent = 'Mirroring...';
      logToConsole(`Applying mirror transformation: ${axes.join(', ')} axis`, 'info');
      getKeyAt = applyMirroring(currentSchem, getKeyAt, mirrorX, mirrorY, mirrorZ);
      logToConsole('Mirroring applied successfully', 'success');
    }
    
    if (hollow) {
      showStatus('Hollowing out schematic...', 'info');
      convertButton.textContent = 'Hollowing...';
      logToConsole('Hollowing out schematic...', 'info');
      getKeyAt = hollowOutSchematic(currentSchem, getKeyAt);
      logToConsole('Hollowing completed', 'success');
    }
    
    if (structureVoid) {
      showStatus('Adding barrier support for gravity blocks...', 'info');
      convertButton.textContent = 'Adding barriers...';
      logToConsole('Adding barrier support for gravity blocks...', 'info');
      getKeyAt = addStructureVoidSupport(currentSchem, getKeyAt);
      logToConsole('Barrier support added', 'success');
    }
    
    if (outputFormat === 'command_dump') {
      showStatus('Generating commands...', 'info');
      convertButton.textContent = 'Generating commands...';
      logToConsole('Generating commands...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      logToConsole(`Generated ${commands.length} commands`, 'success');
      
      logToConsole('Creating text file...', 'info');
      const text = commands.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `${outputName}.txt`);
      
      showStatus(`✅ Success! Generated ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.txt`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert(`Success! Generated ${commands.length} commands`);
      
    } else if (outputFormat === 'mcstructure') {
      if (currentSchem.width > 250 || currentSchem.length > 250) {
        showStatus('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.', 'error');
        logToConsole(`Error: Schematic dimensions (${currentSchem.width}x${currentSchem.length}) exceed McStructure limit (250x250)`, 'error');
        alert('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      showStatus('Generating commands for structure...', 'info');
      convertButton.textContent = 'Generating structure...';
      logToConsole('Generating commands for structure...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      
      if (commands.length === 0) {
        showStatus('No commands generated - structure is empty', 'error');
        logToConsole('Error: No commands generated - structure is empty', 'error');
        alert('No commands generated - structure is empty');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      logToConsole(`Generated ${commands.length} commands`, 'success');
      showStatus(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      convertButton.textContent = 'Creating .mcstructure...';
      logToConsole(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      const structureData = convertCommandsToStructure(commands, {
        width: currentSchem.width,
        height: currentSchem.height,
        length: currentSchem.length,
        baseCoords: [0, 0, 0]
      });
      
      if (!structureData) {
        showStatus('Failed to convert commands to structure data', 'error');
        logToConsole('Error: Failed to convert commands to structure data', 'error');
        alert('Failed to convert commands to structure data');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      logToConsole('Converting to NBT format...', 'info');
      const nbtBuffer = createNbtBuffer(structureData);
      const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, `${outputName}.mcstructure`);
      
      showStatus(`✅ Success! Created .mcstructure with ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcstructure`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert(`Success! Created .mcstructure with ${commands.length} commands`);
      
    } else {
      showStatus('Building mcpack...', 'info');
      convertButton.textContent = 'Building mcpack...';
      logToConsole('Building mcpack...', 'info');
      const blob = await buildMcpack(currentSchem, getKeyAt, outputName, (progress) => {
        showStatus(`${progress.stage}: ${progress.message}`, 'info');
        logToConsole(`${progress.stage}: ${progress.message}`, 'info');
      });
      
      downloadBlob(blob, `${outputName}.mcpack`);
      
      showStatus(`✅ Success! Build pack created!`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcpack`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert('Success! Build pack created!');
    }
    
  } catch (error) {
    showStatus('❌ Error: ' + error.message, 'error');
    logToConsole('❌ Error: ' + error.message, 'error');
    logToConsole('=== Conversion Failed ===', 'error');
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

logToConsole('World Converter initialized', 'success');
loadTranslationData().then(() => {
  logToConsole('Translation data loaded', 'success');
}).catch((error) => {
  logToConsole('Error loading translation data: ' + error.message, 'error');
});
