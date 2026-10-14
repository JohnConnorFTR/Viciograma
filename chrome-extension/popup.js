'use strict';

const PREVIEW_LIMIT_MS = 5 * 60 * 1000;
const refs = {
  scanState: document.getElementById('scan-state'),
  pageTitle: document.getElementById('page-title'),
  pageDescription: document.getElementById('page-description'),
  mediaCount: document.getElementById('media-count'),
  previewFrame: document.getElementById('preview-frame'),
  previewMessage: document.getElementById('preview-message'),
  previewLimit: document.getElementById('preview-limit'),
  mediaList: document.getElementById('media-list'),
  openPlayer: document.getElementById('open-viciograma'),
};

const PLAYER_URL = 'https://johnconnorftr.github.io/Viciograma/index.html';
let activeTab;
let candidates = [];
let previewRemainingMs = PREVIEW_LIMIT_MS;
let previewStartedAt = null;
let previewTimerId = null;
let activePreviewUrl = '';
const previewTimeByUrl = new Map();

function getCandidateTitle(candidate) {
  try {
    const url = new URL(candidate.url);
    const decodePart = (value) => {
      let decoded = value.replace(/\+/g, ' ');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const next = decodeURIComponent(decoded);
          if (next === decoded) break;
          decoded = next;
        } catch {
          break;
        }
      }
      return decoded;
    };
    const extension = /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|webm|mov|ogv|3gp|m3u8)$/i;
    const queryValues = [...url.searchParams.entries()]
      .sort(([left], [right]) => /^(filename|file|name|title|download)$/i.test(right)
        - /^(filename|file|name|title|download)$/i.test(left))
      .map(([, value]) => value);
    const candidates = [
      ...url.pathname.split('/').filter(Boolean).reverse(),
      ...queryValues,
      url.href,
    ];

    for (const value of candidates) {
      const filename = decodePart(value).split(/[/?#&=]/).reverse().find((part) => extension.test(part));
      if (filename) {
        const title = filename.replace(extension, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!/^(index|file|download|video|stream|view|watch)$/i.test(title)) return title;
      }
    }
    const label = candidate.label?.trim();
    if (label && !/^(index|file|download|video|stream|view|watch)$/i.test(label)) return label;
  } catch {
    return '';
  }
  return '';
}

function setScanState(message, state = '') {
  refs.scanState.textContent = message;
  refs.scanState.dataset.state = state;
}

function displayCandidateName(candidate) {
  const title = getCandidateTitle(candidate);
  if (title) return title;
  if (candidate.label) return candidate.label;
  try {
    const url = new URL(candidate.url);
    const filename = decodeURIComponent(url.pathname.split('/').pop() || '');
    return filename || url.hostname;
  } catch {
    return candidate.url;
  }
}

function formatPreviewTime(milliseconds) {
  const totalSeconds = Math.ceil(Math.max(milliseconds, 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updatePreviewLimit(message) {
  refs.previewLimit.textContent = message
    || `Vista previa restante: ${formatPreviewTime(previewRemainingMs)}. Se cuenta el tiempo mientras se reproduce.`;
}

function stopPreviewTimer() {
  if (previewStartedAt !== null) {
    previewRemainingMs = Math.max(0, previewRemainingMs - (performance.now() - previewStartedAt));
    previewStartedAt = null;
  }
  if (previewTimerId !== null) {
    window.clearInterval(previewTimerId);
    previewTimerId = null;
  }
  if (activePreviewUrl) previewTimeByUrl.set(activePreviewUrl, previewRemainingMs);
}

function enforcePreviewLimit(media) {
  media.pause();
  media.controls = false;
  stopPreviewTimer();
  previewRemainingMs = 0;
  if (activePreviewUrl) previewTimeByUrl.set(activePreviewUrl, 0);
  updatePreviewLimit('Vista previa finalizada. El límite de 5 minutos por medio se alcanzó.');
}

function startPreviewTimer(media) {
  if (previewRemainingMs <= 0) {
    enforcePreviewLimit(media);
    return;
  }
  if (previewStartedAt !== null) return;

  previewStartedAt = performance.now();
  previewTimerId = window.setInterval(() => {
    const now = performance.now();
    previewRemainingMs = Math.max(0, previewRemainingMs - (now - previewStartedAt));
    previewStartedAt = now;
    if (previewRemainingMs <= 0) {
      enforcePreviewLimit(media);
    } else {
      updatePreviewLimit();
    }
  }, 250);
  updatePreviewLimit();
}

function attachPreviewLimit(media) {
  media.addEventListener('play', () => startPreviewTimer(media));
  media.addEventListener('pause', stopPreviewTimer);
  media.addEventListener('ended', stopPreviewTimer);
  media.addEventListener('emptied', stopPreviewTimer);
}

function renderPreview(candidate) {
  stopPreviewTimer();
  activePreviewUrl = candidate.url;
  previewRemainingMs = previewTimeByUrl.get(activePreviewUrl) ?? PREVIEW_LIMIT_MS;
  refs.previewFrame.replaceChildren();
  updatePreviewLimit();

  if (candidate.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = previewRemainingMs > 0;
    audio.preload = 'none';
    audio.src = candidate.url;
    attachPreviewLimit(audio);
    refs.previewFrame.append(audio);
  } else if (candidate.kind === 'video') {
    const video = document.createElement('video');
    video.controls = previewRemainingMs > 0;
    video.controlsList = 'nofullscreen nodownload noremoteplayback';
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = candidate.url;
    attachPreviewLimit(video);
    refs.previewFrame.append(video);
  } else {
    const message = document.createElement('p');
    message.className = 'empty-preview';
    message.textContent = 'Este enlace se puede abrir en Viciograma, pero el navegador no pudo identificar un formato para la vista previa.';
    refs.previewFrame.append(message);
  }

  if (previewRemainingMs <= 0) {
    updatePreviewLimit('Vista previa finalizada. El límite de 5 minutos por medio se alcanzó.');
  }

  for (const option of refs.mediaList.querySelectorAll('.media-option')) {
    option.setAttribute('aria-pressed', String(option.dataset.url === candidate.url));
  }
  refs.openPlayer.disabled = false;
}

document.addEventListener('fullscreenchange', () => {
  if (refs.previewFrame.contains(document.fullscreenElement)) {
    document.exitFullscreen().catch((error) => {
      console.error('No se pudo cerrar la pantalla completa de la vista previa:', error);
    });
  }
});

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
    updatePreviewLimit('No hay medios para previsualizar.');
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
      const mediaExtension = /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|webm|mov|ogv|3gp|m3u8)$/i;
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

        const extension = `${url.pathname}${url.search}`.replace(/\+/g, ' ').split(/[/?#&=]/).reverse()
          .find((part) => mediaExtension.test(part))
          ?.match(mediaExtension)?.[1]?.toLowerCase() || '';
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
  renderCandidates(result.result.candidates);
  setScanState('Listo', 'done');
}

refs.openPlayer.addEventListener('click', async () => {
  const selectedOption = refs.mediaList.querySelector('.media-option[aria-pressed="true"]');
  const candidate = candidates.find((item) => item.url === selectedOption?.dataset.url);
  if (!candidate) return;

  const playerUrl = new URL(PLAYER_URL);
  playerUrl.searchParams.set('v', candidate.url);
  const title = getCandidateTitle(candidate);
  if (title) playerUrl.searchParams.set('t', title);

  try {
    await chrome.tabs.create({ url: playerUrl.href });
  } catch (error) {
    setScanState('No se pudo abrir Viciograma', 'error');
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
  updatePreviewLimit('No se pudo iniciar la vista previa.');
  refs.openPlayer.disabled = true;
  console.error('Error al analizar la pestaña actual:', error);
});
