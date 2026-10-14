/**
 * script.js — Viciograma Video Cloud Player
 * Lógica: URL parsing · player switching · HLS · blacklist · Facebook social + comments · AdSense
 */

'use strict';

/* ================================================================
   CONFIGURACIÓN INTERNA
   Los valores de FB y AdSense vienen de window.VG (definido en index.html)
   ================================================================ */
const VG_CONFIG = {
  // Dominios bloqueados (minúsculas, sin protocolo ni barras)
  DOMAIN_BLACKLIST: [
    // 'ejemplo-bloqueado.com',
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
    // Fallback: intenta como MP4
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
   ?v=URL           → URL del video
   ?t=Titulo        → Título (alias: title)
   ?d=Descripcion   → Descripción (alias: desc)
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

    const t       = parsed.searchParams.get('t') || '';
    const tParam  = t ? `&start=${t}` : '';
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${tParam}`;
  } catch {
    return null;
  }
}

/* ================================================================
   DOM REFS
   ================================================================ */
const $  = (id) => document.getElementById(id);

const refs = {
  nativeContainer: $('native-player-container'),
  embedContainer:  $('embed-player-container'),
  placeholder:     $('player-placeholder'),
  nativePlayer:    $('native-player'),
  embedPlayer:     $('embed-player'),
  videoTitle:      $('video-title'),
  videoDesc:       $('video-description'),
  videoMeta:       $('video-meta'),
  // Facebook social
  fbLike:          $('fb-like-btn'),
  fbShare:         $('fb-share-btn'),
  fbSave:          $('fb-save-btn'),
  fbFallback:      $('fb-fallback'),
  // Facebook comments
  fbComments:      $('fb-comments'),
  fbPending:       $('fb-pending'),
  // Misc
  footerYear:      $('footer-year'),
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
}

/* ================================================================
   MOSTRAR ERROR EN EL PLAYER
   ================================================================ */
function showError(message) {
  showPlaceholder();
  refs.placeholder.innerHTML = `
    <div class="vg-error-msg text-center w-100 mx-3">
      <i class="bi bi-exclamation-octagon-fill d-block mb-2 fs-2"></i>
      <strong>No se puede reproducir este video</strong>
      <p class="mt-2 mb-0 small">${message}</p>
    </div>`;
}

/* ================================================================
   INFO BOX
   ================================================================ */
function setInfoBox(title, desc, meta = []) {
  refs.videoTitle.textContent = title || 'Sin título';

  if (desc) {
    refs.videoDesc.innerHTML = `<span>${desc}</span>`;
  } else {
    refs.videoDesc.innerHTML =
      `Reproduciendo contenido remoto. Viciograma actúa como <strong>reproductor neutro</strong>.`;
  }

  refs.videoMeta.innerHTML = meta
    .map(({ icon, text }) =>
      `<span class="vg-meta-badge"><i class="bi ${icon}"></i>${text}</span>`
    ).join('');
}

/* ================================================================
   FACEBOOK — BOTONES SOCIALES (Like, Share, Save)
   Actualiza los data-href con la URL canónica de la página actual
   y re-parsea el XFBML.
   ================================================================ */
function updateFBSocialButtons(pageUrl) {
  if (!refs.fbLike && !refs.fbShare) return;

  // Actualizar atributos href en los tres botones
  if (refs.fbLike)  refs.fbLike.setAttribute('data-href', pageUrl);
  if (refs.fbShare) refs.fbShare.setAttribute('data-href', pageUrl);
  if (refs.fbSave)  refs.fbSave.setAttribute('data-uri', pageUrl);

  if (window.location.protocol !== 'https:') {
    if (refs.fbFallback) {
      refs.fbFallback.textContent = 'Los botones sociales requieren publicar el sitio en una URL HTTPS.';
    }
    return;
  }

  // Ocultar fallback si FB SDK ya está
  if (window.FB) {
    try {
      window.FB.XFBML.parse($('fb-social-bar'));
      if (refs.fbFallback) refs.fbFallback.style.display = 'none';
    } catch (error) {
      if (refs.fbFallback) {
        refs.fbFallback.textContent = 'No se pudieron cargar los botones de Facebook.';
      }
      console.error('Error al procesar los botones sociales de Facebook:', error);
    }
  }
}

function setFBCommentsStatus(message) {
  if (!refs.fbPending) return;
  const status = refs.fbPending.querySelector('#fb-pending-message');
  if (status) status.textContent = message;
  refs.fbPending.style.display = 'flex';
}

/* ================================================================
   FACEBOOK — COMENTARIOS
   ================================================================ */
function updateFBComments(pageUrl) {
  if (!refs.fbComments) return;

  refs.fbComments.setAttribute('data-href', pageUrl);
  refs.fbComments.setAttribute('data-numposts', VG_CONFIG.FB_NUM_POSTS);

  const hasAppId = window.VG && window.VG.FB_APP_ID;

  if (window.location.protocol !== 'https:') {
    refs.fbComments.style.display = 'none';
    setFBCommentsStatus('Para ver los comentarios, publicá el sitio en una dirección HTTPS. No funciona al abrir index.html desde el disco (file://).');
    return;
  }

  if (!hasAppId) {
    refs.fbComments.style.display = 'none';
    setFBCommentsStatus('Falta configurar el App ID de Facebook en index.html.');
    return;
  }

  refs.fbComments.style.display = '';
  if (!window.FB) {
    setFBCommentsStatus('Conectando con Facebook…');
    return;
  }

  try {
    setFBCommentsStatus('Cargando comentarios de Facebook…');
    window.FB.XFBML.parse($('comments-section'), () => {
      const iframe = $('comments-section').querySelector('.vg-fb-wrapper iframe');
      if (iframe) {
        refs.fbPending.style.display = 'none';
      } else {
        setFBCommentsStatus('Facebook no mostró el widget. Verificá el dominio HTTPS en la configuración de la app.');
      }
    });
  } catch (error) {
    setFBCommentsStatus('No se pudieron cargar los comentarios de Facebook.');
    console.error('Error al procesar los comentarios de Facebook:', error);
  }
}

/* ================================================================
   FACEBOOK — ACTUALIZAR TODO (social + comentarios)
   ================================================================ */
function updateAllFB(pageUrl) {
  updateFBSocialButtons(pageUrl);
  updateFBComments(pageUrl);
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
    // Safari nativo
    videoEl.src = url;
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
    updateAllFB(canonicalUrl);
    return;
  }

  // Blacklist check
  if (isBlacklisted(videoUrl)) {
    showError('Este dominio está restringido por política del reproductor.');
    return;
  }

  const source = detectSourceType(videoUrl);

  // Actualizar todos los widgets FB con la URL canónica (incluye ?v=...)
  updateAllFB(canonicalUrl);

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
        showError('No se pudo cargar el video WebM. Verificá la URL y que el servidor permita CORS.');
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

  // Actualizar <title> de la pestaña
  document.title = (title ? `${title} — ` : '') + 'Viciograma';
}

/* ================================================================
   GOOGLE ADSENSE — Activación dinámica
   Si VG.ADS_CLIENT está configurado, inyecta el script y activa los slots.
   (Alternativa a descomentar manualmente el bloque en el HTML)
   ================================================================ */
function initAdsense() {
  const client = window.VG && window.VG.ADS_CLIENT;
  if (!client || client === 'ca-pub-XXXXXXXXXXXXXXXX') return; // no configurado aún

  // Inyectar script de AdSense si no está ya
  if (!document.querySelector('script[src*="adsbygoogle"]')) {
    const s  = document.createElement('script');
    s.async  = true;
    s.src    = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  // Activar cada bloque <ins class="adsbygoogle"> y ocultar su placeholder
  document.querySelectorAll('.vg-ad-banner').forEach((banner) => {
    const placeholder = banner.querySelector('.vg-ad-placeholder');
    const slot        = banner.id === 'ad-top'
      ? (window.VG.ADS_SLOT_TOP    || '')
      : (window.VG.ADS_SLOT_BOTTOM || '');

    if (!slot || slot === '1111111111' || slot === '2222222222') return;

    // Crear <ins> si no existe ya
    if (!banner.querySelector('ins')) {
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient           = client;
      ins.dataset.adSlot             = slot;
      ins.dataset.adFormat           = 'auto';
      ins.dataset.fullWidthResponsive = 'true';
      if (placeholder) placeholder.replaceWith(ins);
      else banner.appendChild(ins);

      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  });
}

/* ================================================================
   INICIALIZACIÓN
   ================================================================ */
function init() {
  // Año en el footer
  if (refs.footerYear) refs.footerYear.textContent = new Date().getFullYear();

  // Registrar primero los eventos para no perder la señal si el SDK cargó rápido.
  document.addEventListener('fb-sdk-ready', () => {
    updateAllFB(window.location.href);
    if (refs.fbFallback) refs.fbFallback.style.display = 'none';
  });

  document.addEventListener('fb-sdk-error', () => {
    if (refs.fbFallback) {
      refs.fbFallback.textContent = 'No se pudo conectar con Facebook. Revisá tu conexión o bloqueadores de contenido.';
    }
    setFBCommentsStatus('No se pudo conectar con Facebook. Revisá tu conexión o bloqueadores de contenido.');
  });

  // Cargar video según params de URL
  const params = getQueryParams();
  loadVideo(params);

  // Intentar activar AdSense si está configurado
  initAdsense();
}

document.addEventListener('DOMContentLoaded', init);
