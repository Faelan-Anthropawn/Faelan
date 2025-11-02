import { loadSchematic } from './js/schematic-reader.js';
import { loadTranslationData, makeMergeKeyGetter } from './js/translation.js';
import { hollowOutSchematic } from './js/hollowing.js';
import { applyRotation } from './js/rotation.js';
import { applyMirroring } from './js/mirroring.js';
import { addStructureVoidSupport } from './js/structure-void.js';
import { generateCommands } from './js/command-writer.js';
import { createNbtBuffer, convertCommandsToStructure } from './js/structure-converter.js';
import { buildMcpack } from './js/pack.js';
//Hi
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

async function init() {
  try {
    showStatus('Loading translation data...', 'info');
    await loadTranslationData();
    showStatus('Ready to convert schematics!', 'success');
    setTimeout(() => hideStatus(), 2000);
  } catch (error) {
    showStatus('Error loading translation data: ' + error.message, 'error');
  }
}

function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = type;
  statusMessage.classList.remove('hidden');
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

function handleFileSelect(file) {
  if (!file) return;

  const ext = file.name.toLowerCase();
  if (!ext.endsWith('.schem') && !ext.endsWith('.schematic') && !ext.endsWith('.litematic')) {
    showStatus('Please select a valid schematic file (.schem, .schematic, or .litematic)', 'error');
    return;
  }

  currentFile = file;
  currentFileName = file.name;
  fileNameDisplay.textContent = file.name;

  if (!outputNameInput.value) {
    const baseName = file.name.replace(/\.(schem|schematic|litematic)$/i, '');
    outputNameInput.value = baseName;
  }

  showStatus('File loaded: ' + file.name, 'success');
  setTimeout(() => hideStatus(), 2000);
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

helpButton.addEventListener('click', () => {
  alert(`Faelans Schematic Converter

Upload a schematic file (.schem, .schematic, or .litematic) and choose your options:

Output Formats:
• Build Pack - Structure based build loading using an in game gui - Recommended for larger builds
• McStructure - Creates a single .mcstructure file (currently limited to a max of 250x250) - Recommended for smaller builds
• Command Dump - Creates a .txt file with fill/setblock commands - Recommended for use in other tools

Build Edits:
• Hollow Build - Removes interior blocks, keeping only the outer shell.  This makes loading faster and less resource intensive.
• No Falling Blocks - Adds barriers below gravity-affected blocks that would otherwise fall when loaded.

Transformations:
• Rotation - Rotate the schematic 0°, 90°, 180°, or 270° in the clockwise direction
• Mirror - Mirror across X, Y, or Z axes (can combine any amount of mirrors)

PSA
All processing is done client-side in your browser so processing times may vary.
For XL schematics the website may become unresponsive.  If you click wait a few times it should still finish the process.`);
});

convertButton.addEventListener('click', async () => {
  if (!currentFile) {
    showStatus('Please select a schematic file first', 'error');
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
    showStatus('Reading schematic file...', 'info');

    const arrayBuffer = await currentFile.arrayBuffer();
    const schem = await loadSchematic(arrayBuffer, currentFileName);

    const hasData = (schem.type === "classic")
      ? (schem.legacyBlocks && schem.legacyBlocks.length)
      : (schem.blocks && schem.blocks.length);

    if (!hasData) {
      showStatus('No block data found in schematic', 'error');
      convertButton.disabled = false;
      return;
    }

    showStatus(`Schematic loaded: ${schem.width}x${schem.height}x${schem.length}`, 'info');

    let getKeyAt = makeMergeKeyGetter(schem);
    let currentSchem = schem;

    if (rotation !== 0) {
      showStatus(`Rotating ${rotation}°...`, 'info');
      const rotationResult = applyRotation(currentSchem, getKeyAt, rotation);
      getKeyAt = rotationResult.getKeyAt;
      currentSchem = rotationResult.rotatedSchem;
    }

    if (mirrorX || mirrorY || mirrorZ) {
      const axes = [];
      if (mirrorX) axes.push('X');
      if (mirrorY) axes.push('Y');
      if (mirrorZ) axes.push('Z');
      showStatus(`Mirroring across ${axes.join(', ')}...`, 'info');
      getKeyAt = applyMirroring(currentSchem, getKeyAt, mirrorX, mirrorY, mirrorZ);
    }

    if (hollow) {
      showStatus('Hollowing out schematic...', 'info');
      getKeyAt = hollowOutSchematic(currentSchem, getKeyAt);
    }

    if (structureVoid) {
      showStatus('Adding barrier support for gravity blocks...', 'info');
      getKeyAt = addStructureVoidSupport(currentSchem, getKeyAt);
    }

    if (outputFormat === 'commands') {
      showStatus('Generating commands...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });

      const text = commands.join('\n');
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `${outputName}.txt`);

      showStatus(`✅ Success! Generated ${commands.length} commands`, 'success');
    } else if (outputFormat === 'mcstructure') {
      if (currentSchem.width > 250 || currentSchem.length > 250) {
        showStatus('Schematic too large for single McStructure (max 250x250). Use Build Pack instead.', 'error');
        convertButton.disabled = false;
        return;
      }

      showStatus('Generating commands for structure...', 'info');
      const commands = generateCommands(currentSchem, getKeyAt, { useRelativeCoords: true });

      if (commands.length === 0) {
        showStatus('No commands generated - structure is empty', 'error');
        convertButton.disabled = false;
        return;
      }

      showStatus(`Creating .mcstructure (${currentSchem.width}x${currentSchem.height}x${currentSchem.length})...`, 'info');
      const structureData = convertCommandsToStructure(commands, {
        width: currentSchem.width,
        height: currentSchem.height,
        length: currentSchem.length,
        baseCoords: [0, 0, 0]
      });

      if (!structureData) {
        showStatus('Failed to convert commands to structure data', 'error');
        convertButton.disabled = false;
        return;
      }

      const nbtBuffer = createNbtBuffer(structureData);
      const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
      downloadBlob(blob, `${outputName}.mcstructure`);

      showStatus(`✅ Success! Created .mcstructure with ${commands.length} commands`, 'success');
    } else if (outputFormat === 'pack') {
      const blob = await buildMcpack(currentSchem, getKeyAt, outputName, (progress) => {
        showStatus(`${progress.stage}: ${progress.message}`, 'info');
      });

      downloadBlob(blob, `${outputName}.mcpack`);

      showStatus(`✅ Success! Build pack created!`, 'success');
    }

  } catch (error) {
    console.error('Conversion error:', error);
    showStatus('❌ Error: ' + error.message, 'error');
  } finally {
    convertButton.disabled = false;
  }
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

init();
