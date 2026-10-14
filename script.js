/**
 * script.js — Viciograma Video Cloud Player
 * Lógica: URL parsing · player switching · HLS · blacklist · Facebook social + comments · AdSense
 */

'use strict';

/* ================================================================
   CONFIGURACIÓN INTERNA
   ================================================================ */
const VG_CONFIG = {
  DOMAIN_BLACKLIST: [
    // Agregá dominios bloqueados aquí (minúsculas, sin protocolo)
    // Ejemplo: 'sitio-restringido.com',
  ],
  IMA_TEST_AD_TAG: 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=',
};

/* ================================================================
   TIPOS DE FUENTE
   ================================================================ */
const SOURCE_TYPE = Object.freeze({
  NATIVE_MP4:  'native_mp4',
  NATIVE_WEBM: 'native_webm',
  HLS:         'hls',
  YOUTUBE:     'youtube',
  UNKNOWN:     'unknown',
});

/* ================================================================
   DETECCIÓN DE TIPO DE FUENTE
   ================================================================ */
function detectSourceType(url) {
  try {
    const parsed   = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path     = parsed.pathname.toLowerCase();

    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return { type: SOURCE_TYPE.YOUTUBE, url };
    }
    if (path.endsWith('.m3u8')) {
      return { type: SOURCE_TYPE.HLS, url };
    }
    if (path.endsWith('.webm')) {
      return { type: SOURCE_TYPE.NATIVE_WEBM, url };
    }
    if (/\.(mp4|mov|ogg|ogv|3gp)(\?.*)?$/.test(path)) {
      return { type: SOURCE_TYPE.NATIVE_MP4, url };
    }
    return { type: SOURCE_TYPE.NATIVE_MP4, url };
  } catch {
    return { type: SOURCE_TYPE.UNKNOWN, url };
  }
}

/* ================================================================
   BLACKLIST
   ================================================================ */
function isBlacklisted(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return VG_CONFIG.DOMAIN_BLACKLIST.some(
      (blocked) => hostname.toLowerCase().includes(blocked)
    );
  } catch {
    return false;
  }
}

/* ================================================================
   PARSEO DE PARÁMETROS URL
   ?v=URL         → URL del video
   ?t=Titulo      → Título
   ?d=Descripcion → Descripción
   ================================================================ */
function getQueryParams() {
  const sp = new URLSearchParams(window.location.search);
  return {
    videoUrl:    sp.get('v')   || sp.get('video') || '',
    title:       (sp.get('t') || sp.get('title') || '').trim(),
    description: (sp.get('d') || sp.get('desc') || sp.get('description') || '').trim(),
  };
}

function inferVideoMetadata(videoUrl, sourceType) {
  try {
    const video = new URL(videoUrl);
    const hostname = video.hostname.replace(/^www\./i, '');
    const filename = decodeURIComponent(video.pathname.split('/').pop() || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const title = filename && !/^(index|video|stream)$/i.test(filename)
      ? filename
      : sourceType === SOURCE_TYPE.YOUTUBE
        ? 'Video de YouTube'
        : `Video de ${hostname}`;

    return {
      title,
      description: `Video remoto alojado en ${hostname}.`,
    };
  } catch {
    return {
      title: 'Video',
      description: 'Reproduciendo contenido remoto.',
    };
  }
}

async function readExternalPageTitle(pageUrl) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    });
    if (!response.ok || !response.body) {
      throw new Error(`El sitio externo respondió con estado ${response.status}.`);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let bytesRead = 0;
    try {
      while (bytesRead < 128 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = 128 * 1024 - bytesRead;
        const chunk = value.subarray(0, remaining);
        chunks.push(chunk);
        bytesRead += chunk.byteLength;
        if (chunk.byteLength < value.byteLength) break;
      }
    } finally {
      await reader.cancel();
    }

    const htmlBytes = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      htmlBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder().decode(htmlBytes);
    const remoteDocument = new DOMParser().parseFromString(html, 'text/html');
    return remoteDocument.querySelector('title')?.textContent?.trim() || '';
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readEmbeddedVideoTitle(videoUrl) {
  const mediaInfoModule = await import(
    'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.8/dist/esm/index.js'
  );
  const mediaInfo = await mediaInfoModule.default({ chunkSize: 256 * 1024 });

  try {
    const headResponse = await fetch(videoUrl, { method: 'HEAD' });
    const fileSize = Number(headResponse.headers.get('content-length'));
    if (!headResponse.ok || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
      throw new Error('El servidor no informó el tamaño del archivo.');
    }

    let bytesRead = 0;
    const result = await mediaInfo.analyzeData(fileSize, async (size, offset) => {
      const response = await fetch(videoUrl, {
        headers: { Range: `bytes=${offset}-${offset + size - 1}` },
      });
      if (response.status !== 206) {
        throw new Error('El servidor no admite la lectura parcial del archivo.');
      }

      const chunk = new Uint8Array(await response.arrayBuffer());
      bytesRead += chunk.byteLength;
      if (bytesRead > 8 * 1024 * 1024) {
        throw new Error('Se superó el límite de lectura de metadatos.');
      }
      return chunk;
    });

    const generalTrack = result.media.track.find((track) => track['@type'] === 'General');
    return generalTrack?.Title?.trim() || '';
  } finally {
    mediaInfo.close();
  }
}

async function applyEmbeddedVideoTitle(videoUrl, fallbackTitle) {
  try {
    const embeddedTitle = await readEmbeddedVideoTitle(videoUrl);
    if (!embeddedTitle || getQueryParams().videoUrl !== videoUrl) return fallbackTitle;
    if (refs.videoTitle?.textContent !== fallbackTitle) return refs.videoTitle.textContent;

    refs.videoTitle.textContent = embeddedTitle;
    document.title = `${embeddedTitle} — Viciograma`;
    return embeddedTitle;
  } catch (error) {
    console.info('No se pudo leer el título integrado del video; se conserva el título inferido.', error);
    return fallbackTitle;
  }
}

/* ================================================================
   YOUTUBE: URL → Embed URL
   ================================================================ */
function toYouTubeEmbed(url) {
  try {
    const parsed  = new URL(url);
    let   videoId = '';
    if (parsed.hostname.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1);
    } else {
      videoId = parsed.searchParams.get('v') || '';
    }
    if (!videoId) return null;
    const t      = parsed.searchParams.get('t') || '';
    const tParam = t ? `&start=${t}` : '';
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${tParam}`;
  } catch {
    return null;
  }
}

/* ================================================================
   DOM REFS
   ================================================================ */
const $ = (id) => document.getElementById(id);

const refs = {
  nativeContainer:  $('native-player-container'),
  embedContainer:   $('embed-player-container'),
  placeholder:      $('player-placeholder'),
  placeholderDefault: $('placeholder-default'),
  quickPlayForm: $('quick-play-form'),
  quickPlayUrl: $('quick-play-url'),
  quickPlayStatus: $('quick-play-status'),
  originLanding:    $('origin-landing'),
  originLandingDescription: $('origin-landing-description'),
  originTitleStatus: $('origin-title-status'),
  originOpenLink:   $('origin-open-link'),
  nativePlayer:     $('native-player'),
  imaAdContainer:   $('ima-ad-container'),
  embedPlayer:      $('embed-player'),
  videoTitle:       $('video-title'),
  videoDesc:        $('video-description'),
  videoMeta:        $('video-meta'),
  // Social
  shareWhatsApp:    $('share-whatsapp'),
  shareFacebook:    $('share-facebook'),
  shareX:            $('share-x'),
  shareInstagram:    $('share-instagram'),
  shareCopy:         $('share-copy'),
  shareStatus:       $('share-status'),
  neutralNotice:     $('neutral-notice'),
  neutralNoticeClose: $('neutral-notice-close'),
  commentsWrapper:   document.querySelector('.vg-comments-wrapper'),
  giscusStatus:      $('giscus-status'),
  urlGeneratorDialog: $('url-generator-dialog'),
  urlGeneratorForm: $('url-generator-form'),
  generatorSourceUrl: $('generator-source-url'),
  generatorDescription: $('generator-description'),
  generatedPlayerUrl: $('generated-player-url'),
  generatorStatus: $('generator-status'),
  copyGeneratedUrl: $('copy-generated-url'),
  openGeneratedUrl: $('open-generated-url'),
  // Footer
  footerYear:        $('footer-year'),
};

function buildPlayerUrl(sourceUrl, description) {
  const playerUrl = new URL(window.location.pathname, window.location.origin);
  playerUrl.searchParams.set('v', sourceUrl);
  if (description) playerUrl.searchParams.set('d', description);
  return playerUrl.href;
}

function isDirectMediaUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return /\.(mp4|m4v|webm|mov|ogg|ogv|3gp|m3u8)$/i.test(parsed.pathname)
      || parsed.hostname === 'youtu.be'
      || parsed.hostname === 'youtube.com'
      || parsed.hostname.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function setGeneratorStatus(message, status = '') {
  if (!refs.generatorStatus) return;
  refs.generatorStatus.textContent = message;
  refs.generatorStatus.dataset.status = status;
}

async function copyGeneratedPlayerUrl() {
  const generatedUrl = refs.generatedPlayerUrl?.value;
  if (!generatedUrl) return;

  try {
    await navigator.clipboard.writeText(generatedUrl);
    setGeneratorStatus('Enlace copiado al portapapeles.', 'success');
  } catch (error) {
    refs.generatedPlayerUrl.select();
    const copied = document.execCommand('copy');
    if (copied) {
      setGeneratorStatus('Enlace copiado al portapapeles.', 'success');
    } else {
      setGeneratorStatus('No se pudo copiar automáticamente. Seleccioná y copiá el enlace.', 'error');
      console.error('No se pudo copiar la URL generada:', error);
    }
  }
}

function initUrlGenerator() {
  const openButton = $('open-url-generator');
  const closeButton = $('close-url-generator');
  if (!refs.urlGeneratorDialog || !refs.urlGeneratorForm) return;

  openButton?.addEventListener('click', () => {
    refs.urlGeneratorDialog.showModal();
    refs.generatorSourceUrl.focus();
  });
  closeButton?.addEventListener('click', () => refs.urlGeneratorDialog.close());
  refs.copyGeneratedUrl?.addEventListener('click', copyGeneratedPlayerUrl);

  refs.urlGeneratorForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const sourceUrl = refs.generatorSourceUrl.value.trim();
    let parsedSourceUrl;
    try {
      parsedSourceUrl = new URL(sourceUrl);
    } catch {
      refs.generatorSourceUrl.setCustomValidity('Ingresá una URL válida que comience con https:// o http://.');
      refs.generatorSourceUrl.reportValidity();
      return;
    }
    refs.generatorSourceUrl.setCustomValidity('');

    if (!['http:', 'https:'].includes(parsedSourceUrl.protocol)) {
      refs.generatorSourceUrl.setCustomValidity('Solo se admiten enlaces HTTP o HTTPS.');
      refs.generatorSourceUrl.reportValidity();
      return;
    }

    const playerUrl = buildPlayerUrl(
      parsedSourceUrl.href,
      refs.generatorDescription.value.trim()
    );
    refs.generatedPlayerUrl.value = playerUrl;
    refs.copyGeneratedUrl.disabled = false;
    refs.openGeneratedUrl.href = playerUrl;
    refs.openGeneratedUrl.hidden = false;

    if (isDirectMediaUrl(parsedSourceUrl.href)) {
      setGeneratorStatus('Enlace generado. Si el servidor permite reproducir este formato, el video abrirá en Viciograma.', 'success');
    } else {
      setGeneratorStatus('Enlace generado. Viciograma mostrará un botón para abrir la página original en otra pestaña; la extensión podrá analizarla cuando esté instalada.', 'warning');
    }
  });
}

function initQuickPlay() {
  if (!refs.quickPlayForm || !refs.quickPlayUrl) return;

  refs.quickPlayForm.addEventListener('submit', (event) => {
    event.preventDefault();
    refs.quickPlayUrl.setCustomValidity('');

    let sourceUrl;
    try {
      sourceUrl = new URL(refs.quickPlayUrl.value.trim());
    } catch {
      refs.quickPlayUrl.setCustomValidity('Ingresá una URL válida que comience con https:// o http://.');
      refs.quickPlayUrl.reportValidity();
      return;
    }

    if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
      refs.quickPlayUrl.setCustomValidity('Solo se admiten enlaces HTTP o HTTPS.');
      refs.quickPlayUrl.reportValidity();
      return;
    }

    if (refs.quickPlayStatus) refs.quickPlayStatus.textContent = 'Abriendo el reproductor…';
    window.location.assign(buildPlayerUrl(sourceUrl.href, ''));
  });
}

function getShareText() {
  const title = refs.videoTitle ? refs.videoTitle.textContent.trim() : '';
  return title && title !== 'Viciograma'
    ? `${title} — Viciograma`
    : 'Mirá este video en Viciograma';
}

function updateShareButtons(pageUrl) {
  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedText = encodeURIComponent(getShareText());

  refs.shareWhatsApp.href = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
  refs.shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  refs.shareX.href = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`;
}

function setShareStatus(message) {
  if (refs.shareStatus) refs.shareStatus.textContent = message;
}

async function createGiscusComments(videoTitle) {
  if (!refs.commentsWrapper || document.querySelector('script[data-giscus-client]')) return;

  try {
    const term = videoTitle.trim().normalize('NFC');
    if (!term) throw new Error('El video no tiene un título para asociar los comentarios.');

    const giscusScript = document.createElement('script');
    giscusScript.src = 'https://giscus.app/client.js';
    giscusScript.async = true;
    giscusScript.crossOrigin = 'anonymous';
    giscusScript.dataset.giscusClient = 'true';
    giscusScript.dataset.repo = 'JohnConnorFTR/Viciograma';
    giscusScript.dataset.repoId = 'R_kgDOVIrUlw';
    giscusScript.dataset.category = 'General';
    giscusScript.dataset.categoryId = 'DIC_kwDOVIrUl84DIY94';
    giscusScript.dataset.mapping = 'specific';
    giscusScript.dataset.term = term;
    giscusScript.dataset.strict = '0';
    giscusScript.dataset.reactionsEnabled = '1';
    giscusScript.dataset.emitMetadata = '0';
    giscusScript.dataset.inputPosition = 'bottom';
    giscusScript.dataset.theme = 'https://johnconnorftr.github.io/Viciograma/giscus-theme.css';
    giscusScript.dataset.lang = 'es';
    giscusScript.addEventListener('load', () => {
      if (refs.giscusStatus) refs.giscusStatus.remove();
    });
    giscusScript.addEventListener('error', () => {
      if (refs.giscusStatus) {
        refs.giscusStatus.textContent = 'No se pudieron cargar los comentarios. Revisá la conexión e intentá de nuevo.';
      }
    });

    refs.commentsWrapper.appendChild(giscusScript);
  } catch (error) {
    if (refs.giscusStatus) {
      refs.giscusStatus.textContent = 'No se pudo preparar la clave de comentarios para este video.';
    }
    console.error('No se pudo generar la clave de comentarios de Giscus:', error);
  }
}

async function copyPageLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setShareStatus('Enlace copiado.');
  } catch (error) {
    const input = document.createElement('textarea');
    input.value = window.location.href;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();

    if (copied) {
      setShareStatus('Enlace copiado.');
    } else {
      setShareStatus('No se pudo copiar automáticamente. Copiá la dirección desde la barra del navegador.');
      console.error('No se pudo copiar el enlace:', error);
    }
  }
}

async function shareToInstagramStory() {
  const instagramWindow = window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
  try {
    await navigator.clipboard.writeText(window.location.href);
    setShareStatus('Enlace copiado. En Instagram, creá una historia y agregá el enlace con el sticker correspondiente.');
  } catch (error) {
    setShareStatus('Instagram no admite publicar directamente una historia desde esta página. Copiá el enlace y agregalo con el sticker de enlace en Instagram.');
    if (!instagramWindow) {
      console.error('No se pudo abrir Instagram en una pestaña nueva.');
    }
    console.error('No se pudo copiar el enlace para Instagram:', error);
  }
}

let imaAdDisplayContainer = null;
let imaAdsLoader = null;
let imaAdsManager = null;
let imaAdsRequested = false;
let imaAdErrorHandled = false;

function resumeContentAfterAd() {
  if (refs.imaAdContainer) refs.imaAdContainer.style.display = 'none';
  if (refs.nativePlayer.paused && refs.nativePlayer.currentSrc) {
    const playPromise = refs.nativePlayer.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error) => {
        console.error('No se pudo reanudar el video después del anuncio:', error);
      });
    }
  }
}

function handleIMAAdError(error) {
  if (imaAdErrorHandled) return;
  imaAdErrorHandled = true;
  console.error('Error del anuncio de prueba Google IMA:', error);
  if (imaAdsManager) {
    imaAdsManager.destroy();
    imaAdsManager = null;
  }
  resumeContentAfterAd();
}

function onIMAAdsManagerLoaded(event) {
  try {
    imaAdsManager = event.getAdsManager(refs.nativePlayer);
    imaAdsManager.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      handleIMAAdError
    );
    imaAdsManager.addEventListener(
      google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      () => {
        refs.nativePlayer.pause();
        refs.imaAdContainer.style.display = 'block';
      }
    );
    imaAdsManager.addEventListener(
      google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      resumeContentAfterAd
    );
    imaAdsManager.addEventListener(
      google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
      resumeContentAfterAd
    );

    const width = refs.nativePlayer.clientWidth || 640;
    const height = refs.nativePlayer.clientHeight || 360;
    imaAdsManager.init(width, height, google.ima.ViewMode.NORMAL);
    imaAdsManager.start();
  } catch (error) {
    handleIMAAdError(error);
  }
}

function requestIMAAd() {
  if (imaAdsRequested) return;
  imaAdsRequested = true;
  refs.nativePlayer.pause();

  if (!window.google || !window.google.ima) {
    handleIMAAdError(new Error('El SDK de Google IMA no está disponible.'));
    return;
  }

  try {
    imaAdDisplayContainer = new google.ima.AdDisplayContainer(
      refs.imaAdContainer,
      refs.nativePlayer
    );
    imaAdDisplayContainer.initialize();

    imaAdsLoader = new google.ima.AdsLoader(imaAdDisplayContainer);
    imaAdsLoader.addEventListener(
      google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onIMAAdsManagerLoaded,
      false
    );
    imaAdsLoader.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      handleIMAAdError,
      false
    );

    const request = new google.ima.AdsRequest();
    request.adTagUrl = VG_CONFIG.IMA_TEST_AD_TAG;
    request.linearAdSlotWidth = refs.nativePlayer.clientWidth || 640;
    request.linearAdSlotHeight = refs.nativePlayer.clientHeight || 360;
    request.nonLinearAdSlotWidth = refs.nativePlayer.clientWidth || 640;
    request.nonLinearAdSlotHeight = Math.max(
      90,
      Math.floor((refs.nativePlayer.clientHeight || 360) / 3)
    );
    imaAdsLoader.requestAds(request);
  } catch (error) {
    handleIMAAdError(error);
  }
}

function initIMA() {
  refs.nativePlayer.addEventListener('play', requestIMAAd);
  refs.nativePlayer.addEventListener('ended', () => {
    if (imaAdsLoader) imaAdsLoader.contentComplete();
  });
  window.addEventListener('resize', () => {
    if (imaAdsManager && refs.nativePlayer.clientWidth) {
      imaAdsManager.resize(
        refs.nativePlayer.clientWidth,
        refs.nativePlayer.clientHeight,
        google.ima.ViewMode.NORMAL
      );
    }
  });
}

/* ================================================================
   MOSTRAR / OCULTAR CONTENEDORES DEL PLAYER
   ================================================================ */
function showNativePlayer() {
  refs.nativeContainer.classList.remove('d-none');
  refs.embedContainer.classList.add('d-none');
  refs.placeholder.classList.add('d-none');
  refs.placeholder.classList.remove('d-flex');
}

function showEmbedPlayer() {
  refs.embedContainer.classList.remove('d-none');
  refs.nativeContainer.classList.add('d-none');
  refs.placeholder.classList.add('d-none');
  refs.placeholder.classList.remove('d-flex');
}

function showPlaceholder() {
  refs.placeholder.classList.remove('d-none');
  refs.placeholder.classList.add('d-flex');
  if (refs.placeholderDefault) refs.placeholderDefault.hidden = false;
  if (refs.originLanding) refs.originLanding.hidden = true;
  refs.nativeContainer.classList.add('d-none');
  refs.embedContainer.classList.add('d-none');
  // Limpiar src del embed para no dejar iframes colgados
  if (refs.embedPlayer) refs.embedPlayer.src = 'about:blank';
  if (refs.nativePlayer) refs.nativePlayer.removeAttribute('src');
}

async function showOriginLanding(rawUrl, title, description) {
  let sourceUrl;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    showError('El enlace de origen no es válido.');
    return title || '';
  }

  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    showError('Solo se pueden abrir enlaces HTTP o HTTPS.');
    return title || '';
  }

  showPlaceholder();
  refs.placeholderDefault.hidden = true;
  refs.originLanding.hidden = false;
  refs.originOpenLink.href = sourceUrl.href;
  refs.originTitleStatus.textContent = title
    ? ''
    : 'Intentando leer el título de la página de origen…';
  refs.originLandingDescription.textContent = description
    || `Abrí ${sourceUrl.hostname} en una pestaña nueva para ver el contenido en su sitio de origen.`;

  let landingTitle = title || `Abrir contenido en ${sourceUrl.hostname}`;
  setInfoBox(landingTitle, description || `Enlace externo alojado en ${sourceUrl.hostname}.`, [
    { icon: 'bi-box-arrow-up-right', text: 'Enlace externo' },
    { icon: 'bi-globe2', text: sourceUrl.hostname },
  ]);

  if (!title) {
    try {
      const externalTitle = await readExternalPageTitle(sourceUrl.href);
      if (getQueryParams().videoUrl !== rawUrl) return landingTitle;
      if (externalTitle) {
        landingTitle = externalTitle;
        refs.originTitleStatus.textContent = '';
        setInfoBox(landingTitle, description || `Enlace externo alojado en ${sourceUrl.hostname}.`, [
          { icon: 'bi-box-arrow-up-right', text: 'Enlace externo' },
          { icon: 'bi-globe2', text: sourceUrl.hostname },
        ]);
      } else {
        refs.originTitleStatus.textContent = 'La página no incluye un título; se muestra el nombre del sitio.';
      }
    } catch (error) {
      refs.originTitleStatus.textContent = 'El sitio no permitió leer su título desde Viciograma. La extensión podrá obtenerlo al analizar la página.';
      console.info('No se pudo leer el título de la página externa; se usa el título alternativo.', error);
    }
  }

  document.title = `${landingTitle} — Viciograma`;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) {
    descriptionMeta.content = description || `Abrí el enlace externo de ${sourceUrl.hostname} en una pestaña nueva.`;
  }
  updateShareButtons(window.location.href);
  return landingTitle;
}

function showError(message) {
  showPlaceholder();
  if (refs.placeholder) {
    refs.placeholder.innerHTML = `
      <div class="vg-error-msg text-center w-100 mx-3">
        <i class="bi bi-exclamation-octagon-fill d-block mb-2 fs-2 text-danger"></i>
        <strong>No se puede reproducir este video</strong>
        <p class="mt-2 mb-0 small text-muted">${message}</p>
      </div>`;
  }
}

/* ================================================================
   INFO BOX
   ================================================================ */
function setInfoBox(title, desc, meta = []) {
  if (refs.videoTitle) refs.videoTitle.textContent = title || 'Sin título';

  if (refs.videoDesc) {
    refs.videoDesc.textContent = desc
      || 'Reproduciendo contenido remoto. Viciograma actúa como reproductor neutro.';
  }

  if (refs.videoMeta) {
    refs.videoMeta.innerHTML = meta
      .map(({ icon, text }) =>
        `<span class="vg-meta-badge"><i class="bi ${icon}"></i>${text}</span>`
      ).join('');
  }
}

/* ================================================================
   HLS
   ================================================================ */
function loadHLS(url, videoEl) {
  if (typeof Hls === 'undefined') {
    showError('HLS.js no está disponible. Intentá recargar la página.');
    return;
  }
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(videoEl);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) showError('Error al cargar el stream HLS. Verificá que la URL sea válida y accesible.');
    });
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = url; // Safari nativo
  } else {
    showError('Tu navegador no soporta streams HLS (m3u8).');
  }
}

/* ================================================================
   FUNCIÓN PRINCIPAL: CARGAR VIDEO
   ================================================================ */
function loadVideo({ videoUrl, title, description }) {
  const canonicalUrl = window.location.href;
  videoTitleReady = Promise.resolve(title || 'Viciograma – Video Cloud Player');

  if (!videoUrl) {
    showPlaceholder();
    const pageTitle = title || 'Viciograma – Video Cloud Player';
    const pageDescription = description
      || 'Ingresá un enlace de video mediante el parámetro ?v= en la URL para comenzar a reproducir.';
    setInfoBox(
      pageTitle,
      pageDescription
    );
    document.title = `${pageTitle} — Viciograma`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = pageDescription;
    updateShareButtons(canonicalUrl);
    updateShareButtons(canonicalUrl);
    videoTitleReady = Promise.resolve(pageTitle);
    return;
  }

  if (isBlacklisted(videoUrl)) {
    showError('Este dominio está restringido por política del reproductor.');
    return;
  }

  const source = detectSourceType(videoUrl);
  const inferred = inferVideoMetadata(videoUrl, source.type);
  const pageTitle = title || inferred.title;
  videoTitleReady = Promise.resolve(pageTitle);
  const pageDescription = description || inferred.description;
  updateShareButtons(canonicalUrl);

  if (!isDirectMediaUrl(videoUrl)) {
    videoTitleReady = showOriginLanding(videoUrl, title, description);
    return;
  }

  switch (source.type) {

    case SOURCE_TYPE.YOUTUBE: {
      const embedUrl = toYouTubeEmbed(videoUrl);
      if (!embedUrl) { showError('No se pudo extraer el ID del video de YouTube.'); return; }
      refs.embedPlayer.src = embedUrl;
      showEmbedPlayer();
      setInfoBox(pageTitle, pageDescription, [
        { icon: 'bi-youtube',   text: 'YouTube' },
        { icon: 'bi-broadcast', text: 'Embed' },
      ]);
      break;
    }

    case SOURCE_TYPE.HLS: {
      showNativePlayer();
      loadHLS(videoUrl, refs.nativePlayer);
      setInfoBox(pageTitle, pageDescription, [
        { icon: 'bi-broadcast',      text: 'HLS / m3u8' },
        { icon: 'bi-lightning-fill', text: 'Stream' },
      ]);
      break;
    }

    case SOURCE_TYPE.NATIVE_WEBM: {
      refs.nativePlayer.src = videoUrl;
      refs.nativePlayer.load();
      showNativePlayer();
      refs.nativePlayer.onerror = () =>
        showError('No se pudo cargar el video WebM. Verificá que la URL sea válida y que el servidor permita CORS.');
      setInfoBox(pageTitle, pageDescription, [
        { icon: 'bi-file-play-fill',   text: 'WebM' },
        { icon: 'bi-cloud-arrow-down', text: 'Remoto' },
      ]);
      break;
    }

    default: { // MP4 y otros nativos
      refs.nativePlayer.src = videoUrl;
      refs.nativePlayer.load();
      showNativePlayer();
      refs.nativePlayer.onerror = () =>
        showError('No se pudo cargar el video. Verificá que la URL sea directa, accesible y que el servidor permita CORS.');
      setInfoBox(pageTitle, pageDescription, [
        { icon: 'bi-file-play-fill',   text: 'MP4' },
        { icon: 'bi-cloud-arrow-down', text: 'Remoto' },
      ]);
      break;
    }
  }

  document.title = `${pageTitle} — Viciograma`;
  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.content = pageDescription;
  updateShareButtons(canonicalUrl);

  if (!title && [SOURCE_TYPE.NATIVE_MP4, SOURCE_TYPE.NATIVE_WEBM].includes(source.type)) {
    videoTitleReady = applyEmbeddedVideoTitle(videoUrl, pageTitle);
  }
}

/* ================================================================
   INICIALIZACIÓN
   ================================================================ */
let videoTitleReady = Promise.resolve('Viciograma – Video Cloud Player');

async function init() {
  if (refs.footerYear) refs.footerYear.textContent = new Date().getFullYear();
  initIMA();
  initUrlGenerator();
  initQuickPlay();

  refs.shareCopy.addEventListener('click', copyPageLink);
  refs.shareInstagram.addEventListener('click', shareToInstagramStory);
  refs.neutralNoticeClose.addEventListener('click', () => {
    refs.neutralNotice.hidden = true;
  });

  const params = getQueryParams();
  loadVideo(params);
  const commentTitle = await videoTitleReady;
  await createGiscusComments(commentTitle);
}

document.addEventListener('DOMContentLoaded', init);
