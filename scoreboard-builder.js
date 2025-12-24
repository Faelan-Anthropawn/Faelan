let rowCounter = 0;

const rowsContainer = document.getElementById('scoreboard-rows');
const addRowButton = document.getElementById('scoreboard-add-row');
const outputTextarea = document.getElementById('scoreboard-output');
const copyButton = document.getElementById('scoreboard-copy');
const targetInput = document.getElementById('scoreboard-target');
const displayTypeSelect = document.getElementById('scoreboard-display-type');
const helpButton = document.getElementById('scoreboard-help-button');

const colorGroups = [
  {
    name: 'Neutrals',
    colors: [
      { code: '§f', name: 'White', color: '#FFFFFF' },
      { code: '§7', name: 'Gray', color: '#AAAAAA' },
      { code: '§8', name: 'Dark Gray', color: '#555555' },
      { code: '§0', name: 'Black', color: '#000000' }
    ]
  },
  {
    name: 'Blues',
    colors: [
      { code: '§b', name: 'Aqua', color: '#55FFFF' },
      { code: '§3', name: 'Dark Aqua', color: '#00AAAA' },
      { code: '§9', name: 'Blue', color: '#5555FF' },
      { code: '§1', name: 'Dark Blue', color: '#0000AA' },
      { code: '§t', name: 'Lapis', color: '#21497B' }
    ]
  },
  {
    name: 'Greens',
    colors: [
      { code: '§a', name: 'Green', color: '#55FF55' },
      { code: '§2', name: 'Dark Green', color: '#00AA00' },
      { code: '§q', name: 'Emerald', color: '#47A036' }
    ]
  },
  {
    name: 'Reds & Oranges',
    colors: [
      { code: '§c', name: 'Red', color: '#FF5555' },
      { code: '§4', name: 'Dark Red', color: '#AA0000' },
      { code: '§m', name: 'Redstone', color: '#971607' },
      { code: '§6', name: 'Gold', color: '#FFAA00' },
      { code: '§n', name: 'Copper', color: '#B4684D' },
      { code: '§v', name: 'Resin', color: '#EB7114' }
    ]
  },
  {
    name: 'Yellows',
    colors: [
      { code: '§e', name: 'Yellow', color: '#FFFF55' },
      { code: '§g', name: 'Minecoin Gold', color: '#DDD605' },
      { code: '§p', name: 'Gold Material', color: '#DEB12D' }
    ]
  },
  {
    name: 'Purples & Pinks',
    colors: [
      { code: '§d', name: 'Light Purple', color: '#FF55FF' },
      { code: '§5', name: 'Dark Purple', color: '#AA00AA' },
      { code: '§u', name: 'Amethyst', color: '#9A5CC6' }
    ]
  },
  {
    name: 'Materials',
    colors: [
      { code: '§s', name: 'Diamond', color: '#2CBAA8' },
      { code: '§h', name: 'Quartz', color: '#E3D4D1' },
      { code: '§i', name: 'Iron', color: '#CECACA' },
      { code: '§j', name: 'Netherite', color: '#443A3B' }
    ]
  }
];

const formatCodes = [
  { code: '§k', name: 'Obfuscated', icon: '?' },
  { code: '§l', name: 'Bold', icon: 'B' },
  { code: '§o', name: 'Italic', icon: 'I' },
  { code: '§r', name: 'Reset', icon: 'R' }
];

function insertAtCursor(input, text) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  input.value = value.substring(0, start) + text + value.substring(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
  generateCommand();
}

function createRowElement(id, addNewline = false) {
  const row = document.createElement('div');
  row.className = 'scoreboard-row flex flex-col gap-3 p-4 rounded-lg card';
  row.dataset.rowId = id;

  row.innerHTML = `
    <div class="flex gap-3 items-start">
      <div class="flex-1 flex flex-col gap-2">
        <input type="text" class="row-text-input input-field w-full h-10 rounded-lg text-white text-sm px-3" placeholder="Enter text..."/>

        <div class="options-bar flex flex-wrap gap-2 p-2 rounded-lg bg-surface-900/50 border border-slate-700/30">
          <div class="color-picker-container relative">
            <button type="button" class="color-picker-toggle flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50 transition-colors">
              <span class="w-3 h-3 rounded-sm bg-gradient-to-r from-red-500 via-green-500 to-blue-500"></span>
              Colors
              <span class="material-symbols-outlined text-sm">expand_more</span>
            </button>
            <div class="color-dropdown hidden absolute top-full left-0 mt-1 p-1.5 rounded-lg bg-surface-800 border border-slate-700/50 shadow-xl" style="z-index: 9999;">
              <div class="color-groups grid grid-cols-7 gap-0.5">
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-medium">Format:</span>
            <div class="format-buttons flex gap-1">
            </div>
          </div>

          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-medium">Insert:</span>
            <div class="insert-buttons flex gap-1">
              <button type="button" class="insert-score-btn px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary-300 border border-primary/30 hover:bg-primary/30 transition-colors" title="Insert Score">Score</button>
              <button type="button" class="insert-selector-btn px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary-300 border border-primary/30 hover:bg-primary/30 transition-colors" title="Insert Selector">Selector</button>
            </div>
          </div>
        </div>
      </div>
      <button type="button" class="row-delete flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
        <span class="material-symbols-outlined text-xl">delete</span>
      </button>
    </div>
  `;

  const textInput = row.querySelector('.row-text-input');
  const colorPickerToggle = row.querySelector('.color-picker-toggle');
  const colorDropdown = row.querySelector('.color-dropdown');
  const colorGroupsContainer = row.querySelector('.color-groups');
  const formatButtonsContainer = row.querySelector('.format-buttons');
  const insertScoreBtn = row.querySelector('.insert-score-btn');
  const insertSelectorBtn = row.querySelector('.insert-selector-btn');
  const deleteButton = row.querySelector('.row-delete');

  if (addNewline) {
    textInput.value = '\n';
  }

  colorPickerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    colorDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!colorDropdown.contains(e.target) && !colorPickerToggle.contains(e.target)) {
      colorDropdown.classList.add('hidden');
    }
  });

  colorGroups.forEach(group => {
    group.colors.forEach(colorData => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'w-4 h-4 rounded-sm border border-slate-600/30 hover:scale-125 hover:border-white/50 hover:z-10 transition-all';
      btn.style.backgroundColor = colorData.color;
      btn.title = `${colorData.name} (${colorData.code})`;
      btn.addEventListener('click', () => {
        insertAtCursor(textInput, colorData.code);
        colorDropdown.classList.add('hidden');
      });
      colorGroupsContainer.appendChild(btn);
    });
  });

  formatCodes.forEach(formatData => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-6 h-5 rounded text-xs font-bold bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50 transition-colors';
    btn.textContent = formatData.icon;
    btn.title = `${formatData.name} (${formatData.code})`;
    btn.addEventListener('click', () => insertAtCursor(textInput, formatData.code));
    formatButtonsContainer.appendChild(btn);
  });

  insertScoreBtn.addEventListener('click', () => {
    showInsertModal('score', textInput);
  });

  insertSelectorBtn.addEventListener('click', () => {
    showInsertModal('selector', textInput);
  });

  textInput.addEventListener('input', generateCommand);

  deleteButton.addEventListener('click', () => {
    row.remove();
    generateCommand();
  });

  return row;
}

function showInsertModal(type, targetInput) {
  const modal = document.getElementById('help-modal');
  const content = document.getElementById('help-modal-content');
  const title = document.getElementById('help-modal-title');

  if (type === 'score') {
    title.textContent = 'Insert Score';
    content.innerHTML = `
      <div class="space-y-4">
        <p class="text-slate-400 text-sm">Insert a scoreboard score display into your text.</p>
        <label class="flex flex-col">
          <span class="text-sm font-medium text-slate-300 mb-2">Target Selector</span>
          <input id="insert-score-name" type="text" class="input-field h-10 px-4 rounded-lg text-white" placeholder="@s"/>
        </label>
        <label class="flex flex-col">
          <span class="text-sm font-medium text-slate-300 mb-2">Objective Name</span>
          <input id="insert-score-objective" type="text" class="input-field h-10 px-4 rounded-lg text-white" placeholder="money"/>
        </label>
        <button id="insert-score-confirm" type="button" class="w-full btn-primary py-3 px-6 rounded-lg font-semibold text-white">
          Insert Score
        </button>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    document.getElementById('insert-score-confirm').addEventListener('click', () => {
      const name = document.getElementById('insert-score-name').value || '@s';
      const objective = document.getElementById('insert-score-objective').value || 'objective';
      closeInsertModal();

      targetInput.value += `{score:${name}:${objective}}`;
      generateCommand();
    });

  } else if (type === 'selector') {
    title.textContent = 'Insert Selector';
    content.innerHTML = `
      <div class="space-y-4">
        <p class="text-slate-400 text-sm">Insert an entity selector to display entity names.</p>
        <label class="flex flex-col">
          <span class="text-sm font-medium text-slate-300 mb-2">Selector</span>
          <input id="insert-selector-value" type="text" class="input-field h-10 px-4 rounded-lg text-white" placeholder="@s"/>
        </label>
        <button id="insert-selector-confirm" type="button" class="w-full btn-primary py-3 px-6 rounded-lg font-semibold text-white">
          Insert Selector
        </button>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    document.getElementById('insert-selector-confirm').addEventListener('click', () => {
      const selector = document.getElementById('insert-selector-value').value || '@s';
      closeInsertModal();

      targetInput.value += `{selector:${selector}}`;
      generateCommand();
    });
  }
}

function closeInsertModal() {
  const modal = document.getElementById('help-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function parseRowText(text) {
  const rawtext = [];
  const regex = /\{score:([^:}]+):([^}]+)\}|\{selector:([^}]+)\}|([^{]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      rawtext.push({ score: { name: match[1], objective: match[2] } });
    } else if (match[3]) {
      rawtext.push({ selector: match[3] });
    } else if (match[4]) {
      rawtext.push({ text: match[4] });
    }
  }

  return rawtext;
}

function generateCommand() {
  const target = targetInput.value || '@s';
  const displayType = displayTypeSelect.value || 'actionbar';
  const rows = rowsContainer.querySelectorAll('.scoreboard-row');

  const allRawtext = [];

  rows.forEach((row, index) => {
    const textInput = row.querySelector('.row-text-input');
    const text = textInput ? textInput.value : '';

    if (text) {
      const rowRawtext = parseRowText(text);
      allRawtext.push(...rowRawtext);
    }
  });

  if (allRawtext.length === 0) {
    outputTextarea.value = '';
    return;
  }

  const command = `titleraw ${target} ${displayType} ${JSON.stringify({ rawtext: allRawtext })}`;
  outputTextarea.value = command;
}

window.scoreboardTabCleanup = function() {
  rowCounter = 0;
  rowsContainer.innerHTML = '';
  outputTextarea.value = '';
  targetInput.value = '@s';
  displayTypeSelect.value = 'actionbar';
};

function addRow() {
  rowCounter++;
  const isFirstRow = rowsContainer.querySelectorAll('.scoreboard-row').length === 0;
  const row = createRowElement(rowCounter, !isFirstRow);
  rowsContainer.appendChild(row);
  generateCommand();
}

addRowButton.addEventListener('click', addRow);

copyButton.addEventListener('click', async () => {
  const command = outputTextarea.value;
  if (!command) {
    return;
  }

  try {
    await navigator.clipboard.writeText(command);
    const originalText = copyButton.querySelector('span:last-child').textContent;
    copyButton.querySelector('span:last-child').textContent = 'Copied!';
    copyButton.classList.add('bg-green-500/20', 'border-green-500/50');
    setTimeout(() => {
      copyButton.querySelector('span:last-child').textContent = originalText;
      copyButton.classList.remove('bg-green-500/20', 'border-green-500/50');
    }, 2000);
  } catch (err) {
    outputTextarea.select();
    document.execCommand('copy');
  }
});

targetInput.addEventListener('input', generateCommand);
displayTypeSelect.addEventListener('change', generateCommand);

function openScoreboardHelpModal() {
  const modal = document.getElementById('help-modal');
  const content = document.getElementById('help-modal-content');
  const title = document.getElementById('help-modal-title');

  title.textContent = 'Scoreboard Builder Help';
  content.innerHTML = `
    <h3 class="text-xl font-bold text-white mb-2">How to Use</h3>
    <p class="mb-4 leading-snug">Build titleraw commands for Minecraft Bedrock Edition to display custom text, scores, and selectors on the player's screen.</p>

    <h3 class="text-xl font-bold text-white mb-2">Text Rows</h3>
    <p class="mb-4 leading-snug">Each row is a text entry. New rows automatically start with <code class="bg-[#2a2d3a] px-1 rounded">\n</code> for a new line.</p>

    <h3 class="text-xl font-bold text-white mb-2">Options Bar</h3>
    <ul class="list-disc list-inside mb-4 leading-tight">
      <li><strong class="text-white">Colors</strong> — Click the Colors button to open a menu with color codes organized by category</li>
      <li><strong class="text-white">Format</strong> — Bold (§l), Italic (§o), Obfuscated (§k), Reset (§r)</li>
      <li><strong class="text-white">Insert Score</strong> — Opens a dialog to insert a score display</li>
      <li><strong class="text-white">Insert Selector</strong> — Opens a dialog to insert an entity selector</li>
    </ul>

    <h3 class="text-xl font-bold text-white mb-2">Display Types</h3>
    <ul class="list-disc list-inside mb-4 leading-tight">
      <li><strong class="text-white">Actionbar</strong> — Shows above the hotbar (recommended for HUDs)</li>
      <li><strong class="text-white">Title</strong> — Large text in center of screen</li>
      <li><strong class="text-white">Subtitle</strong> — Smaller text below title</li>
    </ul>

    <h3 class="text-xl font-bold text-white mb-2">Color Categories</h3>
    <ul class="list-disc list-inside mb-4 leading-tight">
      <li><strong class="text-white">Neutrals</strong> — White, Gray, Dark Gray, Black</li>
      <li><strong class="text-white">Blues</strong> — Aqua, Dark Aqua, Blue, Dark Blue, Lapis</li>
      <li><strong class="text-white">Greens</strong> — Green, Dark Green, Emerald</li>
      <li><strong class="text-white">Reds & Oranges</strong> — Red, Dark Red, Redstone, Gold, Copper, Resin</li>
      <li><strong class="text-white">Yellows</strong> — Yellow, Minecoin Gold, Gold Material</li>
      <li><strong class="text-white">Purples & Pinks</strong> — Light Purple, Dark Purple, Amethyst</li>
      <li><strong class="text-white">Materials</strong> — Diamond, Quartz, Iron, Netherite</li>
    </ul>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

helpButton.addEventListener('click', openScoreboardHelpModal);

addRow();