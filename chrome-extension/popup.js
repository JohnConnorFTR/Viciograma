'use strict';

const PREVIEW_LIMIT_MS = 5 * 60 * 1000;
const refs = {
  scanState: document.getElementById('scan-state'),
  pageTitle: document.getElementById('page-title'),
  pageDescription: document.getElementById('page-description'),
  frameNote: document.getElementById('frame-note'),
  mediaCount: document.getElementById('media-count'),
  previewFrame: document.getElementById('preview-frame'),
  previewMessage: document.getElementById('preview-message'),
  previewLimit: document.getElementById('preview-limit'),
  openPlayer: document.getElementById('open-viciograma'),
};

const PLAYER_URL = 'https://johnconnorftr.github.io/Viciograma/index.html';
let activeTab;
let activeCandidate = null;
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
    if (label && !/^(index|file|download|video|stream|view|watch)$/i.test(label)) {
      return label.replace(extension, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch {
    return '';
  }
  return '';
}

function setScanState(message, state = '') {
  refs.scanState.textContent = message;
  refs.scanState.dataset.state = state;
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
  refs.mediaCount.textContent = String(foundCandidates.length);
  activeCandidate = foundCandidates[0] || null;

  if (!activeCandidate) {
    refs.previewFrame.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty-preview';
    message.textContent = 'No se encontraron enlaces directos de audio o video en esta página. Esperá a que cargue el archivo y volvé a abrir la extensión.';
    refs.previewFrame.append(message);
    updatePreviewLimit('No hay medios para previsualizar.');
    refs.openPlayer.disabled = true;
    return;
  }

  renderPreview(activeCandidate);
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
      const mediaExtension = /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|webm|mov|ogv|3gp|m3u8)$/i;
      const found = new Map();
      const scannedDocuments = new Set();
      let inaccessibleFrameCount = 0;
      const getExtension = (value, baseUrl) => {
        if (typeof value !== 'string' || !value) return '';
        let decoded = value;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const next = decodeURIComponent(decoded.replace(/\+/g, ' '));
            if (next === decoded) break;
            decoded = next;
          } catch {
            break;
          }
        }
        try {
          const parsed = new URL(decoded, baseUrl);
          const pathExtension = parsed.pathname.split('/').filter(Boolean).pop()
            ?.match(mediaExtension)?.[1]?.toLowerCase();
          if (pathExtension) return pathExtension;
          for (const key of ['filename', 'file', 'name']) {
            const queryExtension = parsed.searchParams.getAll(key)
              .map((part) => part.split('/').pop()?.match(mediaExtension)?.[1]?.toLowerCase())
              .find(Boolean);
            if (queryExtension) return queryExtension;
          }
        } catch {
          return '';
        }
        return '';
      };
      const add = (rawUrl, label = '', baseUrl = document.baseURI) => {
        if (typeof rawUrl !== 'string' || !rawUrl || /^(blob:|data:|javascript:)/i.test(rawUrl)) return;
        let url;
        try {
          url = new URL(rawUrl, baseUrl);
        } catch {
          return;
        }
        if (!['http:', 'https:'].includes(url.protocol)) return;
        const extension = getExtension(url.href, baseUrl);
        if (!extension) return;

        const kind = /^(mp3|m4a|aac|wav|flac|ogg|opus)$/.test(extension)
          ? 'audio'
          : extension === 'm3u8'
            ? 'stream'
            : 'video';
        if (!found.has(url.href)) found.set(url.href, { url: url.href, label, kind, extension });
      };

      const scanFrame = (frameWindow) => {
        let frameDocument;
        try {
          frameDocument = frameWindow.document;
        } catch {
          inaccessibleFrameCount += 1;
          return;
        }
        if (!frameDocument || scannedDocuments.has(frameDocument)) return;
        scannedDocuments.add(frameDocument);
        const baseUrl = frameDocument.baseURI;

        frameDocument.querySelectorAll('video, audio').forEach((media) => {
          const label = media.getAttribute('title') || media.getAttribute('aria-label') || '';
          add(media.currentSrc || media.src, label, baseUrl);
          media.querySelectorAll('source[src]').forEach((source) =>
            add(source.src, source.getAttribute('title') || label, baseUrl)
          );
        });
        frameDocument.querySelectorAll('a[href]').forEach((link) => {
          const label = link.getAttribute('download') || link.textContent.trim();
          add(link.href, label, baseUrl);
        });
        for (const resource of frameWindow.performance.getEntriesByType('resource')) {
          add(resource.name, '', baseUrl);
        }

        for (let index = 0; index < frameWindow.frames.length; index += 1) {
          scanFrame(frameWindow.frames[index]);
        }
      };
      scanFrame(window);

      const description = document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || '';
      return {
        pageTitle: document.title.trim(),
        pageDescription: description.trim(),
        candidates: [...found.values()].slice(0, 30),
        inaccessibleFrameCount,
      };
    },
  });

  if (!result?.result) throw new Error('No se pudo analizar el contenido de la pestaña.');
  refs.pageTitle.textContent = result.result.pageTitle || 'Página actual';
  refs.pageDescription.textContent = result.result.pageDescription || activeTab.url;
  refs.frameNote.hidden = result.result.inaccessibleFrameCount === 0;
  refs.frameNote.textContent = result.result.inaccessibleFrameCount > 0
    ? `${result.result.inaccessibleFrameCount} iframe(s) de otro origen no se inspeccionaron.`
    : '';
  renderCandidates(result.result.candidates);
  setScanState('Listo', 'done');
}

refs.openPlayer.addEventListener('click', async () => {
  if (!activeCandidate) return;

  const playerUrl = new URL(PLAYER_URL);
  playerUrl.searchParams.set('v', activeCandidate.url);
  const title = getCandidateTitle(activeCandidate);
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
