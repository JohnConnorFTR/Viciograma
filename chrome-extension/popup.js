'use strict';

const PLAYER_URL = 'https://johnconnorftr.github.io/Viciograma/index.html';
const refs = {
  scanState: document.getElementById('scan-state'),
  pageTitle: document.getElementById('page-title'),
  pageDescription: document.getElementById('page-description'),
  mediaCount: document.getElementById('media-count'),
  previewFrame: document.getElementById('preview-frame'),
  previewMessage: document.getElementById('preview-message'),
  mediaList: document.getElementById('media-list'),
  shareDescription: document.getElementById('share-description'),
  openPlayer: document.getElementById('open-viciograma'),
  notice: document.getElementById('notice'),
};

let activeTab;
let candidates = [];
let selectedCandidate = null;

function setScanState(message, state = '') {
  refs.scanState.textContent = message;
  refs.scanState.dataset.state = state;
}

function displayCandidateName(candidate) {
  if (candidate.label) return candidate.label;
  try {
    const url = new URL(candidate.url);
    const filename = decodeURIComponent(url.pathname.split('/').pop() || '');
    return filename || url.hostname;
  } catch {
    return candidate.url;
  }
}

function renderPreview(candidate) {
  selectedCandidate = candidate;
  refs.previewFrame.replaceChildren();

  if (candidate.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = candidate.url;
    refs.previewFrame.append(audio);
  } else if (candidate.kind === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = candidate.url;
    refs.previewFrame.append(video);
  } else {
    const message = document.createElement('p');
    message.className = 'empty-preview';
    message.textContent = 'Este enlace se puede abrir en Viciograma, pero el navegador no pudo identificar un formato para la vista previa.';
    refs.previewFrame.append(message);
  }

  for (const option of refs.mediaList.querySelectorAll('.media-option')) {
    option.setAttribute('aria-pressed', String(option.dataset.url === candidate.url));
  }
  refs.openPlayer.disabled = false;
}

function renderCandidates(foundCandidates) {
  candidates = foundCandidates;
  refs.mediaCount.textContent = String(candidates.length);
  refs.mediaList.replaceChildren();

  if (candidates.length === 0) {
    refs.previewFrame.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty-preview';
    message.textContent = 'No se encontraron enlaces directos de audio o video en esta página. Esperá a que cargue el archivo y volvé a abrir la extensión.';
    refs.previewFrame.append(message);
    refs.openPlayer.disabled = true;
    return;
  }

  candidates.forEach((candidate, index) => {
    const option = document.createElement('button');
    option.className = 'media-option';
    option.type = 'button';
    option.dataset.url = candidate.url;
    option.setAttribute('aria-pressed', 'false');

    const kind = document.createElement('span');
    kind.className = 'media-kind';
    kind.textContent = candidate.kind;

    const name = document.createElement('span');
    name.className = 'media-name';
    name.textContent = displayCandidateName(candidate);

    option.append(kind, name);
    option.addEventListener('click', () => renderPreview(candidate));
    refs.mediaList.append(option);

    if (index === 0) renderPreview(candidate);
  });
}

async function scanActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
    throw new Error('Abrí una página web http o https antes de usar Viciograma.');
  }
  activeTab = tab;

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const mediaPattern = /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|webm|mov|ogv|3gp|m3u8)(?:$|[?#])/i;
      const found = new Map();
      const add = (rawUrl, label = '') => {
        if (typeof rawUrl !== 'string' || !rawUrl || /^(blob:|data:|javascript:)/i.test(rawUrl)) return;
        let url;
        try {
          url = new URL(rawUrl, document.baseURI);
        } catch {
          return;
        }
        if (!['http:', 'https:'].includes(url.protocol) || !mediaPattern.test(`${url.pathname}${url.search}`)) return;

        const extension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || '';
        const kind = /^(mp3|m4a|aac|wav|flac|ogg|opus)$/.test(extension)
          ? 'audio'
          : /^m3u8$/.test(extension)
            ? 'stream'
            : 'video';
        if (!found.has(url.href)) found.set(url.href, { url: url.href, label, kind });
      };

      document.querySelectorAll('video, audio').forEach((media) => {
        add(media.currentSrc || media.src, media.getAttribute('title') || media.getAttribute('aria-label') || '');
        media.querySelectorAll('source[src]').forEach((source) => add(source.src, source.getAttribute('title') || ''));
      });
      document.querySelectorAll('a[href]').forEach((link) => {
        if (mediaPattern.test(link.href) || link.hasAttribute('download')) {
          add(link.href, link.getAttribute('download') || link.textContent.trim());
        }
      });
      for (const resource of performance.getEntriesByType('resource')) {
        add(resource.name);
      }

      const description = document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || '';
      return {
        pageTitle: document.title.trim(),
        pageDescription: description.trim(),
        candidates: [...found.values()].slice(0, 30),
      };
    },
  });

  if (!result?.result) throw new Error('No se pudo analizar el contenido de la pestaña.');
  refs.pageTitle.textContent = result.result.pageTitle || 'Página actual';
  refs.pageDescription.textContent = result.result.pageDescription || activeTab.url;
  refs.shareDescription.value = result.result.pageDescription || '';
  renderCandidates(result.result.candidates);
  setScanState('Listo', 'done');
}

refs.openPlayer.addEventListener('click', async () => {
  if (!selectedCandidate) return;
  const playerUrl = new URL(PLAYER_URL);
  playerUrl.searchParams.set('v', selectedCandidate.url);

  const title = refs.pageTitle.textContent.trim();
  const description = refs.shareDescription.value.trim();
  if (title && title !== 'Página actual') playerUrl.searchParams.set('t', title);
  if (description) playerUrl.searchParams.set('d', description);

  try {
    await chrome.tabs.create({ url: playerUrl.href });
    refs.notice.textContent = 'Viciograma se abrió en una pestaña nueva.';
  } catch (error) {
    refs.notice.textContent = 'No se pudo abrir Viciograma en una pestaña nueva.';
    console.error('No se pudo abrir Viciograma:', error);
  }
});

scanActiveTab().catch((error) => {
  setScanState('No disponible', 'error');
  refs.pageTitle.textContent = 'No se pudo analizar la pestaña';
  refs.pageDescription.textContent = error.message;
  refs.previewFrame.replaceChildren();
  const message = document.createElement('p');
  message.className = 'empty-preview';
  message.textContent = error.message;
  refs.previewFrame.append(message);
  refs.openPlayer.disabled = true;
  console.error('Error al analizar la pestaña actual:', error);
});
