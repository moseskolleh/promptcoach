// EcoPrompt Coach — options page.
// Reads/writes chrome.storage.sync 'eco_settings'; the popup and content
// script pick changes up live via storage.onChanged.

'use strict';

const DEFAULT_SETTINGS = globalThis.EcoPromptDefaults;

const $ = (id) => document.getElementById(id);

async function fetchJson(path) {
  const res = await fetch(chrome.runtime.getURL(path));
  return res.json();
}

/** The saved settings as stored; EcoPromptSettings.resolve applies them. */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('eco_settings', (data) => {
      resolve((data && data.eco_settings) || {});
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

// Saved settings this page has no control for (paused sites) ride along.
let current = { ...DEFAULT_SETTINGS };

function readForm() {
  return {
    ...current,
    defaultModel: $('default-model').value,
    regionKey: $('region').value,
    reasoningEffort: $('effort').value,
    showPill: $('show-pill').checked,
    includeEmbodied: $('include-embodied').checked,
    recordHistory: $('record-history').checked,
    historyRetentionDays: Number($('retention').value) || 0
  };
}

/** The paused sites, each with a button that resumes it. */
function renderPausedSites() {
  const list = $('paused-list');
  list.textContent = '';
  const sites = Array.isArray(current.pausedSites) ? current.pausedSites : [];
  $('paused-empty').hidden = sites.length > 0;
  for (const site of sites) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = site;
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = 'Resume';
    resume.addEventListener('click', () => {
      current = { ...current, pausedSites: sites.filter((s) => s !== site) };
      save(current);
      renderPausedSites();
    });
    item.append(name, resume);
    list.appendChild(item);
  }
}

async function init() {
  const [models, grids, equivalents, saved] = await Promise.all([
    fetchJson('vendor/data/models.json'),
    fetchJson('vendor/data/grids.json'),
    fetchJson('vendor/data/equivalents.json'),
    loadSettings()
  ]);

  const engine = new EcoPromptCore.ImpactEngine({ models, grids, equivalents });
  const settings = globalThis.EcoPromptSettings.resolve(saved, engine);
  globalThis.EcoPromptSettings.showNotice($('model-notice'));

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
  $('record-history').checked = settings.recordHistory !== false;
  $('retention').value = String(settings.historyRetentionDays || 0);
  if (!$('retention').value) $('retention').value = '0';
  current = settings;
  renderPausedSites();

  for (const id of ['default-model', 'region', 'effort', 'show-pill', 'include-embodied', 'record-history', 'retention']) {
    $(id).addEventListener('change', () => {
      current = readForm();
      save(current);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
