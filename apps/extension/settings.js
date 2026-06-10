// EcoPrompt Coach — options page.
// Reads/writes chrome.storage.sync 'eco_settings'; the popup and content
// script pick changes up live via storage.onChanged.

'use strict';

const DEFAULT_SETTINGS = {
  defaultModel: 'gpt-4o',
  regionKey: 'default',
  reasoningEffort: 'standard',
  showPill: true,
  includeEmbodied: true
};

const $ = (id) => document.getElementById(id);

async function fetchJson(path) {
  const res = await fetch(chrome.runtime.getURL(path));
  return res.json();
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('eco_settings', (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data && data.eco_settings) });
    });
  });
}

let statusTimer = null;
function save(settings) {
  chrome.storage.sync.set({ eco_settings: settings }, () => {
    const status = $('status');
    status.textContent = 'Saved ✓';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

function readForm() {
  return {
    defaultModel: $('default-model').value,
    regionKey: $('region').value,
    reasoningEffort: $('effort').value,
    showPill: $('show-pill').checked,
    includeEmbodied: $('include-embodied').checked
  };
}

async function init() {
  const [models, grids, equivalents, settings] = await Promise.all([
    fetchJson('vendor/data/models.json'),
    fetchJson('vendor/data/grids.json'),
    fetchJson('vendor/data/equivalents.json'),
    loadSettings()
  ]);

  const engine = new EcoPromptCore.ImpactEngine({ models, grids, equivalents });

  // Model select, grouped by provider.
  const modelSelect = $('default-model');
  const byProvider = new Map();
  for (const m of engine.listModels()) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider).push(m);
  }
  for (const [provider, list] of byProvider) {
    const group = document.createElement('optgroup');
    group.label = provider;
    for (const m of list) {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.isReasoning ? `${m.name} · reasoning` : m.name;
      group.appendChild(option);
    }
    modelSelect.appendChild(group);
  }

  // Region select.
  const regionSelect = $('region');
  for (const r of engine.listRegions()) {
    const option = document.createElement('option');
    option.value = r.key;
    option.textContent = `${r.name} — ${Math.round(r.cif * 1000)} gCO₂e/kWh`;
    regionSelect.appendChild(option);
  }

  // Apply stored values.
  modelSelect.value = settings.defaultModel;
  if (!modelSelect.value) modelSelect.value = DEFAULT_SETTINGS.defaultModel;
  regionSelect.value = settings.regionKey;
  if (!regionSelect.value) regionSelect.value = 'default';
  $('effort').value = settings.reasoningEffort;
  $('show-pill').checked = !!settings.showPill;
  $('include-embodied').checked = !!settings.includeEmbodied;

  for (const id of ['default-model', 'region', 'effort', 'show-pill', 'include-embodied']) {
    $(id).addEventListener('change', () => save(readForm()));
  }
}

document.addEventListener('DOMContentLoaded', init);
