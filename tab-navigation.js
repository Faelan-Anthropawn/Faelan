document.addEventListener('DOMContentLoaded', () => {
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');
  const buildSubtabLinks = document.querySelectorAll('.build-subtab-link');
  const buildSubtabContents = document.querySelectorAll('.build-subtab-content');
  const audioSubtabLinks = document.querySelectorAll('.audio-subtab-link');
  const audioSubtabContents = document.querySelectorAll('.audio-subtab-content');
  const buildLinks = document.querySelectorAll('.build-link');

  function switchTab(tabName) {
    tabLinks.forEach(link => {
      const linkTab = link.getAttribute('data-tab');
      if (linkTab === tabName) {
        link.classList.add('active');
        link.classList.remove('text-slate-400');
        link.classList.add('text-white');
      } else {
        link.classList.remove('active');
        link.classList.add('text-slate-400');
        link.classList.remove('text-white');
      }
    });

    tabContents.forEach(content => {
      if (content.id === `${tabName}-content`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  function switchBuildSubtab(subtabName) {
    buildSubtabLinks.forEach(link => {
      const linkSubtab = link.getAttribute('data-subtab');
      if (linkSubtab === subtabName) {
        link.classList.add('active');
        link.classList.remove('text-slate-400');
      } else {
        link.classList.remove('active');
        link.classList.add('text-slate-400');
      }
    });

    buildSubtabContents.forEach(content => {
      if (content.id === `${subtabName}-content`) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
  }

  function switchAudioSubtab(subtabName) {
    audioSubtabLinks.forEach(link => {
      const linkSubtab = link.getAttribute('data-subtab');
      if (linkSubtab === subtabName) {
        link.classList.add('active');
        link.classList.remove('text-slate-400');
      } else {
        link.classList.remove('active');
        link.classList.add('text-slate-400');
      }
    });

    audioSubtabContents.forEach(content => {
      if (content.id === `${subtabName}-content`) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
  }

  tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = link.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  buildSubtabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const subtabName = link.getAttribute('data-subtab');
      switchBuildSubtab(subtabName);
    });
  });

  audioSubtabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const subtabName = link.getAttribute('data-subtab');
      switchAudioSubtab(subtabName);
    });
  });

  buildLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      switchTab('builds');
      switchBuildSubtab(target);
    });
  });

  switchTab('home');
  switchBuildSubtab('schematic');
  switchAudioSubtab('metadata-editor');
});
