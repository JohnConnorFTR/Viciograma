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
  FB_NUM_POSTS: 10,
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
    title:       sp.get('t')   || sp.get('title')  || '',
    description: sp.get('d')   || sp.get('desc')   || '',
  };
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
  nativePlayer:     $('native-player'),
  embedPlayer:      $('embed-player'),
  videoTitle:       $('video-title'),
  videoDesc:        $('video-description'),
  videoMeta:        $('video-meta'),
  // Social
  fbSocialBar:      $('fb-social-bar'),
  fbSocialLoading:  $('fb-social-loading'),
  // Comments
  fbCommentsWrapper: $('fb-comments-wrapper'),
  fbPending:         $('fb-pending'),
  // Footer
  footerYear:        $('footer-year'),
};

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
  refs.nativeContainer.classList.add('d-none');
  refs.embedContainer.classList.add('d-none');
  // Limpiar src del embed para no dejar iframes colgados
  if (refs.embedPlayer) refs.embedPlayer.src = 'about:blank';
  if (refs.nativePlayer) refs.nativePlayer.removeAttribute('src');
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
    refs.videoDesc.innerHTML = desc
      ? `<span>${desc}</span>`
      : `Reproduciendo contenido remoto. Viciograma actúa como <strong>reproductor neutro</strong>.`;
  }

  if (refs.videoMeta) {
    refs.videoMeta.innerHTML = meta
      .map(({ icon, text }) =>
        `<span class="vg-meta-badge"><i class="bi ${icon}"></i>${text}</span>`
      ).join('');
  }
}

/* ================================================================
   FACEBOOK — INYECTAR BOTONES SOCIALES
   Se llama solo después de que el SDK está inicializado.
   Esto evita iframes prematuros y errores de X-Frame-Options.
   ================================================================ */
function injectFBSocialButtons(pageUrl) {
  if (!refs.fbSocialBar) return;

  refs.fbSocialBar.innerHTML = `
    <!-- Me gusta -->
    <div class="fb-like"
         data-href="${pageUrl}"
         data-layout="button_count"
         data-action="like"
         data-size="large"
         data-colorscheme="dark"
         data-show-faces="false"
         data-share="false">
    </div>
    <!-- Compartir -->
    <div class="fb-share-button"
         data-href="${pageUrl}"
         data-layout="button_count"
         data-size="large">
    </div>
    <!-- Guardar -->
    <div class="fb-save"
         data-uri="${pageUrl}"
         data-size="large">
    </div>`;

  refs.fbSocialBar.style.display = 'flex';
  if (refs.fbSocialLoading) refs.fbSocialLoading.style.display = 'none';

  // Parsear solo esta sección
  if (window.FB) {
    try { window.FB.XFBML.parse(refs.fbSocialBar); } catch (_) {}
  }
}

/* ================================================================
   FACEBOOK — INYECTAR WIDGET DE COMENTARIOS
   Se llama solo después de que el SDK está inicializado.
   ================================================================ */
function injectFBComments(pageUrl) {
  if (!refs.fbCommentsWrapper) return;

  const hasAppId = window.VG && window.VG.FB_APP_ID;

  if (!hasAppId) {
    // Sin App ID: mostrar aviso permanente
    if (refs.fbPending) {
      refs.fbPending.innerHTML = `
        <i class="bi bi-facebook fs-4"></i>
        <div>
          <strong>Comentarios de Facebook</strong>
          <p class="mb-0 text-muted small">
            Para activar los comentarios, completá el campo
            <code>FB_APP_ID</code> en la configuración de <code>index.html</code>.
          </p>
        </div>`;
    }
    return;
  }

  // Con App ID: inyectar el widget real
  refs.fbCommentsWrapper.innerHTML = `
    <div class="fb-comments"
         data-href="${pageUrl}"
         data-width="100%"
         data-numposts="${VG_CONFIG.FB_NUM_POSTS}"
         data-colorscheme="dark"
         data-lazy="true">
    </div>`;

  if (window.FB) {
    try { window.FB.XFBML.parse(refs.fbCommentsWrapper); } catch (_) {}
  }
}

/* ================================================================
   FACEBOOK — ACTUALIZAR URLS (cuando cambia el video)
   ================================================================ */
function updateFBWidgets(pageUrl) {
  // Solo si el SDK ya cargó
  if (!window.FB) return;
  injectFBSocialButtons(pageUrl);
  injectFBComments(pageUrl);
}

/* ================================================================
   FACEBOOK — ESTADO DE ERROR (SDK no disponible / HTTP)
   ================================================================ */
function handleFBError() {
  if (refs.fbSocialLoading) {
    refs.fbSocialLoading.innerHTML = `
      <span class="text-muted small">
        <i class="bi bi-info-circle me-1"></i>
        Los botones de Facebook requieren HTTPS.
      </span>`;
  }
  if (refs.fbPending) {
    refs.fbPending.innerHTML = `
      <i class="bi bi-facebook fs-4"></i>
      <div>
        <strong>Comentarios de Facebook</strong>
        <p class="mb-0 text-muted small">
          Los comentarios de Facebook requieren que el sitio se sirva por HTTPS.
        </p>
      </div>`;
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

  if (!videoUrl) {
    showPlaceholder();
    setInfoBox(
      'Viciograma – Video Cloud Player',
      'Ingresá un enlace de video mediante el parámetro <code>?v=</code> en la URL para comenzar a reproducir.'
    );
    updateFBWidgets(canonicalUrl);
    return;
  }

  if (isBlacklisted(videoUrl)) {
    showError('Este dominio está restringido por política del reproductor.');
    return;
  }

  const source = detectSourceType(videoUrl);
  updateFBWidgets(canonicalUrl);

  switch (source.type) {

    case SOURCE_TYPE.YOUTUBE: {
      const embedUrl = toYouTubeEmbed(videoUrl);
      if (!embedUrl) { showError('No se pudo extraer el ID del video de YouTube.'); return; }
      refs.embedPlayer.src = embedUrl;
      showEmbedPlayer();
      setInfoBox(title || 'Video de YouTube', description, [
        { icon: 'bi-youtube',   text: 'YouTube' },
        { icon: 'bi-broadcast', text: 'Embed' },
      ]);
      break;
    }

    case SOURCE_TYPE.HLS: {
      showNativePlayer();
      loadHLS(videoUrl, refs.nativePlayer);
      setInfoBox(title || 'Stream HLS', description, [
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
      setInfoBox(title || 'Video', description, [
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
      setInfoBox(title || 'Video', description, [
        { icon: 'bi-file-play-fill',   text: 'MP4' },
        { icon: 'bi-cloud-arrow-down', text: 'Remoto' },
      ]);
      break;
    }
  }

  document.title = (title ? `${title} — ` : '') + 'Viciograma';
}

/* ================================================================
   GOOGLE ADSENSE — Activación dinámica
   ================================================================ */
function initAdsense() {
  const client = window.VG && window.VG.ADS_CLIENT;
  if (!client || client === 'ca-pub-XXXXXXXXXXXXXXXX') return;

  if (!document.querySelector('script[src*="adsbygoogle"]')) {
    const s       = document.createElement('script');
    s.async       = true;
    s.src         = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  document.querySelectorAll('.vg-ad-banner').forEach((banner) => {
    const placeholder = banner.querySelector('.vg-ad-placeholder');
    const slot = banner.id === 'ad-top'
      ? (window.VG.ADS_SLOT_TOP    || '')
      : (window.VG.ADS_SLOT_BOTTOM || '');

    if (!slot || slot === '1111111111' || slot === '2222222222') return;
    if (banner.querySelector('ins')) return; // ya activado

    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient            = client;
    ins.dataset.adSlot              = slot;
    ins.dataset.adFormat            = 'auto';
    ins.dataset.fullWidthResponsive = 'true';

    if (placeholder) placeholder.replaceWith(ins);
    else banner.appendChild(ins);

    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}

/* ================================================================
   INICIALIZACIÓN
   ================================================================ */
function init() {
  if (refs.footerYear) refs.footerYear.textContent = new Date().getFullYear();

  const params = getQueryParams();
  loadVideo(params);
  initAdsense();

  // SDK de Facebook listo → inyectar botones y comentarios
  document.addEventListener('fb-sdk-ready', () => {
    injectFBSocialButtons(window.location.href);
    injectFBComments(window.location.href);
  });

  // Error del SDK (HTTP, bloqueado, etc.)
  document.addEventListener('fb-sdk-error', handleFBError);
}

document.addEventListener('DOMContentLoaded', init);
