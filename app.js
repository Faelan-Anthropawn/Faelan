import { loadSchematic } from './schematic-reader.js';
import { loadTranslationData, makeMergeKeyGetter, updateActiveReplacements, isValidBlockId } from './translation.js';
import { hollowOutSchematic } from './hollowing.js';
import { applyRotation } from './rotation.js';
import { applyMirroring } from './mirroring.js';
import { addStructureVoidSupport } from './structure-void.js';
import { generateCommands } from './command-writer.js';
import { createNbtBuffer, convertCommandsToStructure } from './structure-converter.js';
import { buildMcpack } from './pack.js';

let currentFile = null;
let currentFileName = '';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseButton = document.getElementById('browse-button');
const fileNameDisplay = document.getElementById('file-name');
const convertButton = document.getElementById('convert-button');
const statusMessage = document.getElementById('status-message');
const outputNameInput = document.getElementById('output-name');
const outputFormatSelect = document.getElementById('output-format');
const hollowToggle = document.getElementById('hollow-toggle');
const structureVoidToggle = document.getElementById('structure-void-toggle');
const rotationSelect = document.getElementById('rotation-select');
const mirrorXBtn = document.getElementById('mirror-x');
const mirrorYBtn = document.getElementById('mirror-y');
const mirrorZBtn = document.getElementById('mirror-z');
const helpButton = document.getElementById('help-button');
const consoleBox = document.getElementById('console-box');
const addReplacementBtn = document.getElementById('add-replacement');
const replacementList = document.getElementById('replacement-list');

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

async function init() {
  try {
    appShowStatus('Loading translation data...', 'info');
    logToConsole('Loading translation data...', 'info');
    await loadTranslationData();
    appShowStatus('Ready to convert schematics!', 'success');
    logToConsole('Translation data loaded successfully', 'success');
    logToConsole('Ready to convert schematics!', 'success');
  } catch (error) {
    appShowStatus('Error loading translation data: ' + error.message, 'error');
    logToConsole('Error loading translation data: ' + error.message, 'error');
  }
}

function appShowStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

function handleFileSelect(file) {
  if (!file) return;

  const ext = file.name.toLowerCase();
  if (!ext.endsWith('.schem') && !ext.endsWith('.schematic') && !ext.endsWith('.litematic')) {
    appShowStatus('Please select a valid schematic file (.schem, .schematic, or .litematic)', 'error');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  fileNameDisplay.textContent = file.name;

  if (!outputNameInput.value) {
    const baseName = file.name.replace(/\.(schem|schematic|litematic)$/i, '');
    outputNameInput.value = baseName;
  }

  appShowStatus('File loaded: ' + file.name, 'success');
  logToConsole('File loaded: ' + file.name, 'success');
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

function openHelpModal() {
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
  <p class=\"mt-1 leading-snug\">For XL schematics, the site may become unresponsive — click “Wait” a few times and it should finish.</p>
`;

modal.classList.remove('hidden');
modal.classList.add('flex');
document.body.style.overflow = 'hidden';
}

function closeHelpModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

helpButton.addEventListener('click', openHelpModal);

document.getElementById('help-modal-close-btn').addEventListener('click', closeHelpModal);

document.getElementById('help-modal').addEventListener('click', (e) => {
  if (e.target.id === 'help-modal') {
    closeHelpModal();
  }
});

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
  document.querySelectorAll('#replacement-list .flex').forEach(row => {
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

convertButton.addEventListener('click', async () => {
  if (!currentFile) {
    appShowStatus('Please select a schematic file first', 'error');
    logToConsole('Error: No schematic file selected', 'error');
    return;
  }

  const outputName = outputNameInput.value.trim() || 'output';
  const outputFormat = outputFormatSelect.value;
  const hollow = hollowToggle.checked;
  const structureVoid = structureVoidToggle.checked;
  const rotation = parseInt(rotationSelect.value);
  const mirrorX = mirrorXBtn.classList.contains('active');
  const mirrorY = mirrorYBtn.classList.contains('active');
  const mirrorZ = mirrorZBtn.classList.contains('active');

  convertButton.disabled = true;
  
  try {
    const replacements_obj = getReplacements();
    updateActiveReplacements(replacements_obj);
    
    clearConsole();
    logToConsole('=== Starting Conversion Process ===', 'info');
    logToConsole(`Output format: ${outputFormat}`, 'info');
    logToConsole(`Output name: ${outputName}`, 'info');

    appShowStatus('Reading schematic file...', 'info');
    logToConsole('Reading schematic file...', 'info');

    const arrayBuffer = await currentFile.arrayBuffer();
    const schem = await loadSchematic(arrayBuffer, currentFileName);

    const hasData = (schem.type === "classic")
      ? (schem.legacyBlocks && schem.legacyBlocks.length)
      : (schem.blocks && schem.blocks.length);

    if (!hasData) {
      appShowStatus('No block data found in schematic', 'error');
      logToConsole('Error: No block data found in schematic', 'error');
      convertButton.disabled = false;
      return;
    }

    appShowStatus(`Schematic loaded: ${schem.width}x${schem.height}x${schem.length}`, 'info');
    logToConsole(`Schematic loaded successfully`, 'success');
    logToConsole(`Dimensions: ${schem.width}x${schem.height}x${schem.length}`, 'info');
    
    if (schem.regionCount && schem.regionCount > 1) {
      logToConsole(`Multi-region litematic detected: ${schem.regionCount} regions merged`, 'info');
    }

    let getKeyAt = makeMergeKeyGetter(schem, replacements_obj);
    let currentSchem = schem;

    if (rotation !== 0) {
      appShowStatus(`Rotating ${rotation}°...`, 'info');
      logToConsole(`Applying rotation: ${rotation}°`, 'info');
      const rotationResult = applyRotation(currentSchem, getKeyAt, rotation);
      getKeyAt = rotationResult.getKeyAt;
      currentSchem = rotationResult.rotatedSchem;
      logToConsole(`Rotation applied successfully`, 'success');
    }

    if (mirrorX || mirrorY || mirrorZ) {
      const axes = [];
      if (mirrorX) axes.push('X');
      if (mirrorY) axes.push('Y');
      if (mirrorZ) axes.push('Z');
      appShowStatus(`Mirroring across ${axes.join(', ')}...`, 'info');
      logToConsole(`Applying mirror transformation: ${axes.join(', ')} axis`, 'info');
      getKeyAt = applyMirroring(currentSchem, getKeyAt, mirrorX, mirrorY, mirrorZ);
      logToConsole(`Mirroring applied successfully`, 'success');
    }

    if (hollow) {
      appShowStatus('Hollowing out schematic...', 'info');
      logToConsole('Hollowing out schematic...', 'info');
      getKeyAt = hollowOutSchematic(currentSchem, getKeyAt);
      logToConsole('Hollowing completed', 'success');
    }

    if (structureVoid) {
      appShowStatus('Adding barrier support for gravity blocks...', 'info');
      logToConsole('Adding barrier support for gravity blocks...', 'info');
      getKeyAt = addStructureVoidSupport(currentSchem, getKeyAt);
      logToConsole('Barrier support added', 'success');
    }

    if (outputFormat === 'commands') {
      appShowStatus('Generating commands...', 'info');
      logToConsole('Generating commands...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });
      logToConsole(`Generated ${commands.length} commands`, 'success');

      logToConsole('Creating text file...', 'info');
      const text = commands.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `${outputName}.txt`);

      appShowStatus(`✅ Success! Generated ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.txt`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
    } else if (outputFormat === 'mcstructure') {
      if (currentSchem.width > 250 || currentSchem.length > 250) {
        appShowStatus('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.', 'error');
        logToConsole(`Error: Schematic dimensions (${currentSchem.width}x${currentSchem.length}) exceed McStructure limit (250x250)`, 'error');
        convertButton.disabled = false;
        return;
      }

      appShowStatus('Generating commands for structure...', 'info');
      logToConsole('Generating commands for structure...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });

      if (commands.length === 0) {
        appShowStatus('No commands generated - structure is empty', 'error');
        logToConsole('Error: No commands generated - structure is empty', 'error');
        convertButton.disabled = false;
        return;
      }

      logToConsole(`Generated ${commands.length} commands`, 'success');
      appShowStatus(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      logToConsole(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      const structureData = convertCommandsToStructure(commands, {
        width: currentSchem.width,
        height: currentSchem.height,
        length: currentSchem.length,
        baseCoords: [0, 0, 0]
      });

      if (!structureData) {
        appShowStatus('Failed to convert commands to structure data', 'error');
        logToConsole('Error: Failed to convert commands to structure data', 'error');
        convertButton.disabled = false;
        return;
      }

      logToConsole('Converting to NBT format...', 'info');
      const nbtBuffer = createNbtBuffer(structureData);
      const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, `${outputName}.mcstructure`);

      appShowStatus(`✅ Success! Created .mcstructure with ${commands.length} commands`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcstructure`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
    } else if (outputFormat === 'pack') {
      const blob = await buildMcpack(currentSchem, getKeyAt, outputName, (progress) => {
        appShowStatus(`${progress.stage}: ${progress.message}`, 'info');
        logToConsole(`${progress.stage}: ${progress.message}`, 'info');
      });

      downloadBlob(blob, `${outputName}.mcpack`);

      appShowStatus(`✅ Success! Build pack created!`, 'success');
      logToConsole(`File downloaded: ${outputName}.mcpack`, 'success');
      logToConsole('=== Conversion Complete ===', 'success');
    }
  } catch (error) {
    console.error('Conversion error:', error);
    appShowStatus('❌ Error: ' + error.message, 'error');
    logToConsole('❌ Error: ' + error.message, 'error');
    logToConsole('=== Conversion Failed ===', 'error');
  } finally {
    convertButton.disabled = false;
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.click();
  URL.revokeObjectURL(url);
}

window.buildTabCleanup = function() {
  currentFile = null;
  currentFileName = '';
  fileNameDisplay.textContent = '';
  fileInput.value = '';
  clearConsole();
};

init();
