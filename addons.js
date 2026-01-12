import { addons } from './addons-data.js';

let currentAddon = null;

function renderAddons() {
  const container = document.getElementById('addons-container');
  if (!container) return;

  container.innerHTML = addons.map(addon => `
    <button 
      class="addon-card flex flex-col items-start justify-start gap-3 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-900/80 p-6 min-h-28 text-left transition-all duration-300 hover:from-slate-700/80 hover:to-slate-800/90 border-2 border-slate-700/80 hover:border-primary/70 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1"
      data-addon-id="${addon.id}"
      aria-label="View ${addon.title}"
    >
      <span class="text-base font-bold text-white leading-tight">${addon.title}</span>
      <span class="text-sm text-slate-300 leading-snug flex-grow">${addon.shortDescription}</span>
    </button>
  `).join('');

  container.querySelectorAll('.addon-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const addonId = e.currentTarget.getAttribute('data-addon-id');
      const addon = addons.find(a => a.id === addonId);
      if (addon) {
        openAddonModal(addon);
      }
    });
  });
}

function openAddonModal(addon) {
  currentAddon = addon;
  const modal = document.getElementById('addon-modal');
  const title = document.getElementById('modal-title');
  const description = document.getElementById('modal-description');
  const downloadBtn = document.getElementById('modal-download-btn');

  title.textContent = addon.title;
  description.innerHTML = addon.fullDescription;
  
  downloadBtn.onclick = () => {
    if (addon.downloadUrl && addon.downloadUrl !== '#') {
      window.open(addon.downloadUrl, '_blank');
    } else {
      alert('Download link coming soon!');
    }
  };

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeAddonModal() {
  const modal = document.getElementById('addon-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
  currentAddon = null;
}

function initAddons() {
  renderAddons();

  const closeBtn = document.getElementById('modal-close-btn');
  const modal = document.getElementById('addon-modal');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAddonModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAddonModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentAddon) {
      closeAddonModal();
    }
  });
}

window.addonsTabCleanup = function() {
  currentAddon = null;
  const modal = document.getElementById('addon-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  document.body.style.overflow = '';
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAddons);
} else {
  initAddons();
}
