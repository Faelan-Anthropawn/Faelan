import { loadWorldRegions, createBlockStreamFromWorld } from './world-reader.js';
import { loadSchematicFromStream } from './schematic-reader.js';
import { loadTranslationData, makeMergeKeyGetter, updateActiveReplacements, isValidBlockId } from './translation.js';
import { hollowOutSchematic } from './hollowing.js';
import { applyRotation } from './rotation.js';
import { applyMirroring } from './mirroring.js';
import { addStructureVoidSupport } from './structure-void.js';
import { generateCommands } from './command-writer.js';
import { createNbtBuffer, convertCommandsToStructure } from './structure-converter.js';
import { buildMcpack } from './pack.js';

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

const addReplacementBtn = document.getElementById('world-add-replacement');
const replacementList = document.getElementById('world-replacement-list');

function createReplacementRow() {
  const row = document.createElement('div');
  row.className = 'flex gap-2 items-center';
  row.innerHTML = `
    <input type="text" placeholder="Original" class="replacement-original input-field flex-1 h-9 px-3 rounded-lg text-sm text-white" style="background-color: rgba(15, 23, 42, 0.6);">
    <span class="material-symbols-outlined text-slate-500 text-sm">arrow_forward</span>
    <input type="text" placeholder="Replace" class="replacement-target input-field flex-1 h-9 px-3 rounded-lg text-sm text-white" style="background-color: rgba(15, 23, 42, 0.6);">
    <button type="button" class="remove-replacement p-1 text-slate-500 hover:text-red-400 transition-colors">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  `;
  
  row.querySelector('.remove-replacement').addEventListener('click', () => row.remove());
  return row;
}

if (addReplacementBtn) {
  addReplacementBtn.addEventListener('click', () => {
    replacementList.appendChild(createReplacementRow());
  });
}

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

function worldShowStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

async function handleFileSelect(file) {
  if (!file) return;
  
  if (!file.name.toLowerCase().endsWith('.zip')) {
    worldShowStatus('Please select a .zip file containing Minecraft world data', 'error');
    logToConsole('Error: Invalid file type. Please select a .zip file', 'error');
    alert('Please select a .zip file containing Minecraft world data');
    return;
  }
  
  worldFile = file;
  fileNameDisplay.textContent = file.name;
  worldShowStatus(`Loading world file: ${file.name}`, 'info');
  logToConsole(`Loading world file: ${file.name}`, 'info');
  
  try {
    mcaFiles = await loadWorldRegions(file);
    const regionCount = Object.keys(mcaFiles).length;
    worldShowStatus(`World loaded! Found ${regionCount} region file(s)`, 'success');
    logToConsole(`World loaded successfully! Found ${regionCount} region file(s)`, 'success');
    alert(`World loaded successfully!\nFound ${regionCount} region file(s).\nNow enter coordinates and click "Begin Conversion".`);
  } catch (error) {
    if (error.message === 'OLD_WORLD_FORMAT') {
      worldShowStatus('World file is too old to process', 'error');
      logToConsole('Error: World contains .mcr files (pre-1.2.2 format)', 'error');
      alert('This world is too old to process. Try updating it to a post 1.2.2 format using a tool like chunker or je2be.');
    } else {
      worldShowStatus('Error loading world file: ' + error.message, 'error');
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

const worldHelpButton = document.getElementById('world-help-button');

function openWorldHelpModal() {
  const modal = document.getElementById('help-modal');
  const content = document.getElementById('help-modal-content');
  
content.innerHTML = `
  <h3 class=\"text-xl font-bold text-white mb-2\">Output Formats</h3>
  <ul class=\"list-disc list-inside mb-4 leading-tight\">
    <li><strong class=\"text-white\">Build Pack</strong> — Structure-based build loading using an in-game GUI recommended for larger builds</li>
    <li><strong class=\"text-white\">McStructure</strong> — Creates a single .mcstructure file (max 250×250) — recommended for smaller builds</li>
    <li><strong class=\"text-white\">Command Dump</strong> — Exports a .txt file with fill/setblock commands — recommended for other tools</li>
  </ul>

  <h3 class=\"text-xl font-bold text-white mb-2\">Build Edits</h3>
  <ul class=\"list-disc list-inside mb-4 leading-tight\">
    <li><strong class=\"text-white\">Hollow Build</strong> — Removes interior blocks, keeping only the outer shell for faster loading.</li>
    <li><strong class=\"text-white\">No Falling Blocks</strong> — Adds barriers under gravity-affected blocks to prevent falling if there is air below it.</li>
  </ul>

  <h3 class=\"text-xl font-bold text-white mb-2\">Transformations</h3>
  <ul class=\"list-disc list-inside mb-4 leading-tight\">
    <li><strong class=\"text-white\">Rotation</strong> — Rotate the schematic 0°, 90°, 180°, or 270° clockwise.</li>
    <li><strong class=\"text-white\">Mirror</strong> — Mirror across X, Y, or Z axes (combinations supported).</li>
  </ul>

  <h3 class=\"text-xl font-bold text-white mb-2\">PSA</h3>
  <p class=\"leading-snug\">All processing is done client-side in your browser, so processing times may vary.</p>
  <p class=\"mt-1 leading-snug\">For XL regions, the site may become unresponsive — click “Wait” a few times and it should finish.</p>
  <p class=\"mt-1 leading-snug\">Requires a java world in anvil format (V 1.2.2 or higher).</p>
`;

modal.classList.remove('hidden');
modal.classList.add('flex');
document.body.style.overflow = 'hidden';
}

function closeWorldHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

worldHelpButton.addEventListener('click', openWorldHelpModal);

function normalizeBlockId(id) {
  if (!id) return '';
  let normalized = id.toLowerCase().trim().replace(/\s+/g, '_');
  if (!normalized.includes(':')) {
    normalized = 'minecraft:' + normalized;
  }
  return normalized;
}

function getReplacements() {
  const replacements = {};
  let errors = [];
  document.querySelectorAll('#world-replacement-list .flex').forEach(row => {
    const original = normalizeBlockId(row.querySelector('.replacement-original').value);
    const target = normalizeBlockId(row.querySelector('.replacement-target').value);
    if (original && target && original !== 'minecraft:' && target !== 'minecraft:') {
      if (!isValidBlockId(target)) {
        errors.push(`Invalid replacement block ID: ${target}`);
      }
      replacements[original] = target;
    }
  });
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return replacements;
}

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
  
  try {
    const replacements_obj = getReplacements();
    updateActiveReplacements(replacements_obj);
    
    convertButton.textContent = 'Converting...';
    clearConsole();
    logToConsole('=== Starting World Conversion Process ===', 'info');
    logToConsole(`Output format: ${outputFormat}`, 'info');
    logToConsole(`Output name: ${outputName}`, 'info');
    logToConsole(`Region: (${x1}, ${y1}, ${z1}) to (${x2}, ${y2}, ${z2})`, 'info');

    worldShowStatus('Loading translation data...', 'info');
    logToConsole('Loading translation data...', 'info');
    await loadTranslationData();
    logToConsole('Translation data loaded successfully', 'success');
    
    const progressCallback = (progress) => {
      logToConsole(`${progress.stage}: ${progress.message}`, 'info');
      convertButton.textContent = `${progress.stage}...`;
    };
    
    worldShowStatus('Creating block stream from world region...', 'info');
    convertButton.textContent = 'Streaming world data...';
    logToConsole('Creating block stream from world region...', 'info');
    
    const blockStream = await createBlockStreamFromWorld(
      mcaFiles, x1, y1, z1, x2, y2, z2, progressCallback
    );
    
    worldShowStatus('Loading schematic from stream...', 'info');
    convertButton.textContent = 'Processing blocks...';
    logToConsole('Loading schematic from stream...', 'info');
    
    const schem = await loadSchematicFromStream(blockStream);
    
    logToConsole(`World region loaded successfully`, 'success');
    logToConsole(`Dimensions: ${schem.width}x${schem.height}x${schem.length}`, 'info');
    worldShowStatus(`Region extracted: ${schem.width}x${schem.height}x${schem.length}`, 'success');
    
    let getKeyAt = makeMergeKeyGetter(schem, replacements_obj);
    let currentSchem = schem;
    
    if (rotation !== 0) {
      worldShowStatus(`Rotating ${rotation}°...`, 'info');
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
      worldShowStatus(`Mirroring across ${axes.join(', ')}...`, 'info');
      convertButton.textContent = 'Mirroring...';
      logToConsole(`Applying mirror transformation: ${axes.join(', ')} axis`, 'info');
      getKeyAt = applyMirroring(currentSchem, getKeyAt, mirrorX, mirrorY, mirrorZ);
      logToConsole('Mirroring applied successfully', 'success');
    }
    
    if (hollow) {
      worldShowStatus('Hollowing out schematic...', 'info');
      convertButton.textContent = 'Hollowing...';
      logToConsole('Hollowing out schematic...', 'info');
      getKeyAt = hollowOutSchematic(currentSchem, getKeyAt);
      logToConsole('Hollowing completed', 'success');
    }
    
    if (structureVoid) {
      worldShowStatus('Adding barrier support for gravity blocks...', 'info');
      convertButton.textContent = 'Adding barriers...';
      logToConsole('Adding barrier support for gravity blocks...', 'info');
      getKeyAt = addStructureVoidSupport(currentSchem, getKeyAt);
      logToConsole('Barrier support added', 'success');
    }
    
    if (outputFormat === 'command_dump') {
      worldShowStatus('Generating commands...', 'info');
      convertButton.textContent = 'Generating commands...';
      logToConsole('Generating commands...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      logToConsole(`Generated ${commands.length} commands`, 'success');
      
      logToConsole('Creating text file...', 'info');
      const text = commands.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `${outputName}.txt`);
      
      worldShowStatus(`✅ Success! Generated ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.txt`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert(`Success! Generated ${commands.length} commands`);
      
    } else if (outputFormat === 'mcstructure') {
      if (currentSchem.width > 250 || currentSchem.length > 250) {
        worldShowStatus('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.', 'error');
        logToConsole(`Error: Schematic dimensions (${currentSchem.width}x${currentSchem.length}) exceed McStructure limit (250x250)`, 'error');
        alert('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      worldShowStatus('Generating commands for structure...', 'info');
      convertButton.textContent = 'Generating structure...';
      logToConsole('Generating commands for structure...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      
      if (commands.length === 0) {
        worldShowStatus('No commands generated - structure is empty', 'error');
        logToConsole('Error: No commands generated - structure is empty', 'error');
        alert('No commands generated - structure is empty');
        convertButton.disabled = false;
        convertButton.textContent = 'Begin Conversion';
        return;
      }
      
      logToConsole(`Generated ${commands.length} commands`, 'success');
      worldShowStatus(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      convertButton.textContent = 'Creating .mcstructure...';
      logToConsole(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      const structureData = convertCommandsToStructure(commands, {
        width: currentSchem.width,
        height: currentSchem.height,
        length: currentSchem.length,
        baseCoords: [0, 0, 0]
      });
      
      if (!structureData) {
        worldShowStatus('Failed to convert commands to structure data', 'error');
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
      
      worldShowStatus(`✅ Success! Created .mcstructure with ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcstructure`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert(`Success! Created .mcstructure with ${commands.length} commands`);
      
    } else {
      worldShowStatus('Building mcpack...', 'info');
      convertButton.textContent = 'Building mcpack...';
      logToConsole('Building mcpack...', 'info');
      const blob = await buildMcpack(currentSchem, getKeyAt, outputName, (progress) => {
        worldShowStatus(`${progress.stage}: ${progress.message}`, 'info');
        logToConsole(`${progress.stage}: ${progress.message}`, 'info');
      });
      
      downloadBlob(blob, `${outputName}.mcpack`);
      
      worldShowStatus(`✅ Success! Build pack created!`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcpack`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
      alert('Success! Build pack created!');
    }
    
  } catch (error) {
    worldShowStatus('❌ Error: ' + error.message, 'error');
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
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.click();
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

window.buildTabCleanup = (function() {
  const originalCleanup = window.buildTabCleanup || function() {};
  return function() {
    originalCleanup();
    worldFile = null;
    mcaFiles = null;
    fileNameDisplay.textContent = '';
    fileInput.value = '';
    clearConsole();
  };
})();
