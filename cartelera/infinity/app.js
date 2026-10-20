const TYPE_LABELS = { movie: 'Película', series: 'Serie', video: 'Video' };
const FILTERS = ['all', 'movie', 'series', 'video'];

const state = {
  user: null,
  posts: [],
  filter: 'all',
  search: '',
  modal: null,
  loading: true,
  error: '',
  notice: '',
  detailViewRegistered: false
};

const elements = {
  postCount: document.getElementById('post-count'),
  postsGrid: document.getElementById('posts-grid'),
  featuredWrap: document.getElementById('featured-wrap'),
  loading: document.getElementById('loading'),
  emptyState: document.getElementById('empty-state'),
  modalRoot: document.getElementById('modal-root'),
  notice: document.getElementById('notice'),
  error: document.getElementById('error'),
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  btnLogin: document.getElementById('btn-login'),
  btnRegister: document.getElementById('btn-register'),
  btnProfile: document.getElementById('btn-profile'),
  btnPublicar: document.getElementById('btn-publicar'),
  heroPublish: document.getElementById('hero-publish'),
  emptyPublish: document.getElementById('empty-publish')
};

async function api(path, options = {}) {
  const normalizedPath = String(path).replace(/^\/+/, '');
  const appDirectory = new URL('./', window.location.href);
  const requestUrl = new URL(`api/${normalizedPath}`, appDirectory);

  let response;
  try {
    response = await fetch(requestUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options
    });
  } catch {
    throw new Error('No se pudo conectar con la API. Este sitio debe servirse con PHP (no con Vite ni archivo estático). Usá PHP local o subilo a InfinityFree.');
  }

  let responseText;
  try {
    responseText = await response.text();
  } catch {
    throw new Error(`No se pudo leer la respuesta de la API (HTTP ${response.status}).`);
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    const isHtml = /<\/?(?:!doctype|html|head|body)\b/i.test(responseText)
      || response.headers.get('content-type')?.includes('text/html');
    if (isHtml) {
      throw new Error('El servidor devolvió una página HTML en lugar de la API. Abrí el sitio desde /cartelera/infinity/ y usá un servidor con PHP habilitado; Vite/Live Server no ejecutan PHP.');
    }
    throw new Error(`La API devolvió contenido no válido (HTTP ${response.status}). Revisá api/health.php y confirmá que PHP esté ejecutando los archivos .php.`);
  }

  if (!response.ok) {
    const detail = response.status === 404
      ? 'No se encontró la API. Este sitio necesita cargar los scripts PHP desde un servidor PHP. No funciona si lo abres como archivo o con Vite puro.'
      : payload?.error || `La API respondió HTTP ${response.status}. Abrí api/health.php para revisar el servidor.`;
    throw new Error(detail);
  }

  return payload;
}

function posterMarkup(post) {
  const palette = ['poster-copper', 'poster-rose', 'poster-blue', 'poster-violet', 'poster-green'];
  const posterClass = palette[(post.id || post.title.length) % palette.length];
  const image = post.poster_url ? `<img src="${escapeHtml(post.poster_url)}" alt="Portada de ${escapeHtml(post.title)}" loading="eager" decoding="async" onerror="this.remove();this.parentElement.classList.add('fallback-poster');" />` : '';
  return `
    <div class="poster ${posterClass}">
      ${image}
      <span class="poster-mark"><i class="bi bi-play-fill"></i></span>
      <span class="poster-word">${escapeHtml(post.title)}</span>
      <span class="poster-type">${TYPE_LABELS[post.type] || 'Publicación'}</span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function seasonCountLabel(count) {
  const seasons = Number(count) || 0;
  return `${seasons} ${seasons === 1 ? 'temporada' : 'temporadas'}`;
}

function renderNotice(message, isError = false) {
  const box = isError ? elements.error : elements.notice;
  const otherBox = isError ? elements.notice : elements.error;
  if (!box) return;
  if (otherBox) otherBox.classList.add('hidden');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

function renderFormError(message) {
  const feedback = elements.modalRoot ? elements.modalRoot.querySelector('#modal-feedback') : null;
  if (!feedback) {
    renderNotice(message, true);
    return;
  }
  feedback.textContent = message;
  feedback.classList.toggle('hidden', !message);
}

function renderPosts() {
  if (!elements.postCount && !elements.postsGrid && !elements.featuredWrap && !elements.emptyState) {
    return;
  }

  const filtered = state.posts.filter((post) => {
    const q = state.search.trim().toLowerCase();
    const matchesType = state.filter === 'all' || post.type === state.filter;
    const matchesSearch = !q || [post.title, post.genre, post.description, post.username].join(' ').toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  if (elements.postCount) elements.postCount.textContent = String(filtered.length);
  if (elements.emptyState) elements.emptyState.classList.toggle('hidden', filtered.length > 0 || state.loading);
  if (elements.featuredWrap) elements.featuredWrap.classList.toggle('hidden', filtered.length === 0 || state.search || state.filter !== 'all');

  if (filtered.length === 0) {
    if (elements.postsGrid) elements.postsGrid.innerHTML = '';
    return;
  }

  const featured = filtered[0];
  if (elements.featuredWrap) elements.featuredWrap.innerHTML = `
    <button class="featured-card post-card" type="button" data-id="${featured.id}">
      ${posterMarkup(featured)}
      <span class="featured-content">
        <span class="eyebrow"><span class="live-dot"></span> RECIÉN AGREGADO</span>
        <strong>${escapeHtml(featured.title)}</strong>
        <span class="featured-description">${escapeHtml(featured.description || 'Una recomendación de la comunidad.')}</span>
        <span class="featured-meta">${TYPE_LABELS[featured.type]}${featured.type === 'series' ? ` · ${seasonCountLabel(featured.season_count)}` : ''}${featured.year ? ` · ${featured.year}` : ''}${featured.genre ? ` · ${featured.genre}` : ''} · ${featured.views_count ?? 0} visitas</span>
        <span class="featured-action">Ver publicación <i class="bi bi-arrow-up-right"></i></span>
      </span>
    </button>
  `;

  const visible = state.search || state.filter !== 'all' ? filtered : filtered.slice(1);
  if (elements.postsGrid) elements.postsGrid.innerHTML = visible.map((post) => `
    <button class="post-card" type="button" data-id="${post.id}">
      ${posterMarkup(post)}
      <span class="post-info">
        <span class="post-type">${TYPE_LABELS[post.type]}${post.type === 'series' ? ` · ${seasonCountLabel(post.season_count)}` : ''}${post.year ? ` · ${post.year}` : ''}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <span class="post-genre">${escapeHtml(post.genre || `Compartido por ${post.username}`)}</span>
        <span class="post-stats"><i class="bi bi-eye-fill"></i> ${post.views_count ?? 0} · <i class="bi bi-heart-fill"></i> ${post.likes_count ?? 0} · <i class="bi bi-star-fill"></i> ${(post.rating_average ?? 0).toFixed(1)}</span>
      </span>
    </button>
  `).join('');

  if (elements.featuredWrap) elements.featuredWrap.querySelector('.featured-card')?.addEventListener('click', () => openDetail(featured));
  if (elements.postsGrid) elements.postsGrid.querySelectorAll('.post-card').forEach((button) => {
    const post = state.posts.find((item) => String(item.id) === button.dataset.id);
    if (post) {
      button.addEventListener('click', () => openDetail(post));
    }
  });
}

async function loadPosts() {
  try {
    state.loading = true;
    const params = new URLSearchParams();
    if (state.filter !== 'all') params.set('type', state.filter);
    if (state.search.trim()) params.set('q', state.search.trim());
    const result = await api('posts.php?' + params.toString());
    state.posts = result.posts || [];
    renderPosts();
  } catch (error) {
    renderNotice(error.message, true);
  } finally {
    state.loading = false;
    if (elements.loading) elements.loading.classList.toggle('hidden', !state.loading);
    if (!state.loading) {
      renderPosts();
    }
  }
}

async function loadSession() {
  try {
    const result = await api('auth.php?action=me');
    state.user = result.user;
  } catch (error) {
    state.user = null;
    if (error && error.message) {
      renderNotice(error.message, true);
    }
  }
  updateAuthButtons();
}

function updateAuthButtons() {
  const isLogged = !!state.user;
  if (elements.btnPublicar) elements.btnPublicar.classList.toggle('hidden', !isLogged);
  if (elements.btnProfile) elements.btnProfile.classList.toggle('hidden', !isLogged);
  if (elements.btnLogin) elements.btnLogin.classList.toggle('hidden', isLogged);
  if (elements.btnRegister) elements.btnRegister.classList.toggle('hidden', isLogged);
}

function openModal(type, payload = null) {
  state.modal = { type, payload };
  renderModal();
}

function closeModal() {
  state.modal = null;
  renderModal();
}

function openDetail(post) {
  if (!post) return;
  const target = new URL('detail.html', window.location.href);
  target.searchParams.set('id', String(post.id));
  window.location.assign(target.toString());
}

function openProfilePage() {
  const target = new URL('profile.html', window.location.href);
  window.location.assign(target.toString());
}

function episodeRowMarkup(episode = {}) {
  return `
    <div class="episode-entry">
      <label>Temporada
        <input data-episode-field="season_number" type="number" min="1" max="100" value="${escapeHtml(episode.season_number || 1)}" required />
      </label>
      <label>Episodio
        <input data-episode-field="episode_number" type="number" min="1" max="1000" value="${escapeHtml(episode.episode_number || 1)}" required />
      </label>
      <label class="episode-title-field">Título (opcional)
        <input data-episode-field="title" maxlength="120" value="${escapeHtml(episode.title || '')}" placeholder="Nombre del episodio" />
      </label>
      <label class="episode-url-field">Enlace del episodio
        <input data-episode-field="link_url" type="url" value="${escapeHtml(episode.link_url || '')}" placeholder="https://…" required />
      </label>
      <button class="episode-remove button button-quiet" type="button" aria-label="Quitar episodio"><i class="bi bi-trash"></i></button>
    </div>
  `;
}

function renderModal() {
  const root = elements.modalRoot;
  if (!state.modal) {
    root.innerHTML = '';
    return;
  }

  const { type, payload } = state.modal;
  let content = '';

  if (type === 'profile') {
    const postsByUser = state.posts.filter((post) => post.user_id === state.user?.id);
    const score = postsByUser.length > 0
      ? (postsByUser.reduce((sum, post) => sum + (Number(post.rating_average) || 0), 0) / postsByUser.length).toFixed(1)
      : '0.0';

    content = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Perfil de ${escapeHtml(state.user?.username || 'usuario')}">
          <div class="modal-heading">
            <div><span class="eyebrow">VICIOGRAMA</span><h2>Perfil público</h2></div>
            <button class="icon-button" type="button" data-close="modal">✕</button>
          </div>
          <div class="profile-layout">
            <div class="profile-card">
              <div class="profile-avatar">${escapeHtml((state.user?.username || 'U').slice(0, 1).toUpperCase())}</div>
              <div>
                <h3>${escapeHtml(state.user?.username || 'Usuario')}</h3>
                <span class="detail-author">${escapeHtml(state.user?.email || '')}</span>
              </div>
            </div>
            <div class="profile-stats">
              <div><strong>${postsByUser.length}</strong><span>publicaciones</span></div>
              <div><strong>${state.posts.filter((post) => (post.likes_count || 0) > 0).length}</strong><span>aprobados</span></div>
              <div><strong>${score}</strong><span>promedio</span></div>
            </div>
            <div class="profile-actions">
              <button class="button button-quiet" type="button" id="logout-btn">Cerrar sesión</button>
            </div>
            <div class="profile-list">
              ${postsByUser.length === 0 ? '<p class="empty-mini">Todavía no publicaste nada. Compartí tu primer enlace.</p>' : postsByUser.map((post) => `
                <button class="profile-post" type="button" data-post-id="${post.id}">
                  <span>${escapeHtml(post.title)}</span>
                  <small>${TYPE_LABELS[post.type]}${post.type === 'series' ? ` · ${seasonCountLabel(post.season_count)}` : ''} · ${post.likes_count ?? 0} likes · ${(post.rating_average ?? 0).toFixed(1)} ★</small>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (type === 'login' || type === 'register') {
    const mode = type === 'register' ? 'Crear cuenta' : 'Ingresar';
    const fields = type === 'register'
      ? `<label>Nombre de usuario<input name="username" required maxlength="24" placeholder="Tu nombre público" /></label>
         <label>Email<input name="email" type="email" required maxlength="254" placeholder="vos@ejemplo.com" /></label>
         <label>Contraseña<input name="password" type="password" required minlength="10" placeholder="Mínimo 10 caracteres" /></label>`
      : `<label>Usuario o email<input name="identity" required placeholder="Tu usuario o email" /></label>
         <label>Contraseña<input name="password" type="password" required placeholder="Tu contraseña" /></label>`;

    content = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${mode}">
          <div class="modal-heading">
            <div><span class="eyebrow">VICIOGRAMA</span><h2>${mode}</h2></div>
            <button class="icon-button" type="button" data-close="modal">✕</button>
          </div>
          <p class="modal-copy">${type === 'register' ? 'Sumate a la cartelera y compartí lo que valga la pena ver.' : 'Ingresá para publicar y guardar tus recomendaciones.'}</p>
          <form id="auth-form" class="form-stack">
            <p id="modal-feedback" class="form-error hidden" role="alert"></p>
            ${fields}
            <button class="button button-primary detail-link" type="submit">${mode}</button>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'publish') {
    const isEditing = !!payload?.editing;
    const values = payload || {};
    const isSeries = values.type === 'series';
    const episodes = Array.isArray(values.episodes) && values.episodes.length
      ? values.episodes
      : [{ season_number: 1, episode_number: 1 }];
    content = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-panel publish-modal" role="dialog" aria-modal="true" aria-label="${isEditing ? 'Editar publicación' : 'Publicar enlace'}">
          <div class="modal-heading publish-modal-header">
            <div><span class="eyebrow">VICIOGRAMA</span><h2>${isEditing ? 'Editá tu publicación' : 'Compartí lo que te gustó'}</h2></div>
            <button class="icon-button" type="button" data-close="modal">✕</button>
          </div>
          <form id="publish-form" class="publish-form">
            <div class="publish-modal-body form-stack">
              <p id="modal-feedback" class="form-error hidden" role="alert"></p>
              <label>Título<input name="title" required maxlength="120" value="${escapeHtml(values.title || '')}" placeholder="¿Qué vamos a ver?" /></label>
              <div class="form-row">
                <label>Tipo<select name="type" id="publish-type">
                <option value="movie" ${values.type === 'movie' ? 'selected' : ''}>Película</option>
                <option value="series" ${values.type === 'series' ? 'selected' : ''}>Serie</option>
                <option value="video" ${values.type === 'video' ? 'selected' : ''}>Video</option>
                </select></label>
                <label>Año<input name="year" type="number" min="1888" max="2100" value="${escapeHtml(values.year || '')}" placeholder="2026" /></label>
              </div>
              <label>Género<input name="genre" maxlength="40" value="${escapeHtml(values.genre || '')}" placeholder="Drama, comedia, ciencia ficción…" /></label>
              <label id="single-link-field" ${isSeries ? 'hidden' : ''}>Enlace externo<input name="link_url" id="single-link-url" type="url" ${isSeries ? '' : 'required'} value="${escapeHtml(values.link_url || '')}" placeholder="https://…" /></label>
              <section id="series-episodes" class="series-episodes" ${isSeries ? '' : 'hidden'}>
                <div class="episodes-heading">
                  <div><strong>Episodios</strong><small>Agregá un enlace por episodio.</small></div>
                  <button class="button button-quiet episode-add" id="add-episode" type="button"><i class="bi bi-plus-lg"></i> Agregar</button>
                </div>
                <div id="episode-list">${isSeries ? episodes.map(episodeRowMarkup).join('') : ''}</div>
              </section>
              <label>Portada (opcional, URL directa de una imagen)<input name="poster_url" type="url" value="${escapeHtml(values.poster_url || '')}" placeholder="https://sitio.com/portada.jpg" /></label>
              <label>Descripción<textarea name="description" maxlength="600" rows="3" placeholder="¿Por qué la recomendás?">${escapeHtml(values.description || '')}</textarea></label>
            </div>
            <div class="publish-modal-footer">
              <button class="button button-quiet" type="button" data-close="modal">Cancelar</button>
              <button class="button button-primary" type="submit">${isEditing ? 'Guardar cambios' : 'Publicar en cartelera'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'detail' && payload) {
    const ratingLabel = payload.rating_average ? `${Number(payload.rating_average).toFixed(1)} ★` : 'Sin puntuación aún';
    const likeLabel = payload.likes_count ?? 0;
    const reviewCount = payload.review_count ?? 0;

    content = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(payload.title)}">
          <div class="modal-heading">
            <div><span class="eyebrow">VICIOGRAMA</span><h2>${escapeHtml(payload.title)}</h2></div>
            <button class="icon-button" type="button" data-close="modal">✕</button>
          </div>
          <div class="detail-layout">
            ${posterMarkup(payload)}
            <div class="detail-copy">
              <span class="post-type">${TYPE_LABELS[payload.type]}${payload.type === 'series' ? ` · ${seasonCountLabel(payload.season_count)}` : ''}${payload.year ? ` · ${payload.year}` : ''}</span>
              <p>${escapeHtml(payload.description || 'Compartido por la comunidad de Viciograma.')}</p>
              <span class="post-genre">${escapeHtml(payload.genre || 'Sin género indicado')}</span>
              <span class="detail-author">Recomendado por <strong>${escapeHtml(payload.username)}</strong></span>
              <div class="social-stats">
                <span><i class="bi bi-heart-fill"></i> ${likeLabel}</span>
                <span><i class="bi bi-star-fill"></i> ${ratingLabel}</span>
                <span><i class="bi bi-chat-left-text"></i> ${reviewCount} reseñas</span>
              </div>
            </div>
          </div>
          <div class="detail-actions">
            <a class="button button-primary detail-link" href="${payload.link_url}" target="_blank" rel="noopener noreferrer">Visitar enlace externo <i class="bi bi-box-arrow-up-right"></i></a>
            <button class="button button-quiet" type="button" id="share-post-btn"><i class="bi bi-share"></i> Compartir</button>
            ${state.user ? `<button class="button button-quiet" type="button" id="toggle-like-btn"><i class="bi bi-heart${payload.liked_by_me ? '-fill' : ''}"></i> ${payload.liked_by_me ? 'Te gusta' : 'Me gusta'}</button>` : ''}
            ${state.user && state.user.id === payload.user_id ? '<button class="button button-quiet" type="button" id="edit-post-btn">Editar publicación</button>' : ''}
          </div>
          <div class="review-box">
            <div class="review-header">
              <span class="eyebrow">PUNTUAR Y OPINAR</span>
            </div>
            <form id="review-form" class="form-stack compact">
              <label>Tu puntuación
                <select name="rating">
                  <option value="5">5 ★★★★★</option>
                  <option value="4">4 ★★★★☆</option>
                  <option value="3">3 ★★★☆☆</option>
                  <option value="2">2 ★★☆☆☆</option>
                  <option value="1">1 ★☆☆☆☆</option>
                </select>
              </label>
              <label>Reseña (opcional)
                <textarea name="review" rows="3" maxlength="600" placeholder="Contale a la comunidad qué te pareció..."></textarea>
              </label>
              <button class="button button-primary" type="submit">Guardar reseña</button>
            </form>
          </div>
          <p class="external-note"><i class="bi bi-box-arrow-up-right"></i> Vas a salir de Viciograma; el sitio externo es responsable del contenido.</p>
          ${state.user && state.user.id === payload.user_id ? '<button class="delete-link" type="button" id="delete-post">Eliminar mi publicación</button>' : ''}
        </div>
      </div>
    `;
  }

  root.innerHTML = content;

  root.querySelectorAll('[data-close="modal"]').forEach((button) => button.addEventListener('click', closeModal));

  if (type === 'login' || type === 'register') {
    root.querySelector('#auth-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      const submitButton = event.currentTarget.querySelector('[type="submit"]');
      submitButton.disabled = true;
      try {
        const action = type === 'register' ? 'register' : 'login';
        const result = await api(`auth.php?action=${action}`, { method: 'POST', body: JSON.stringify(payload) });
        state.user = result.user;
        updateAuthButtons();
        renderNotice(type === 'register' ? '¡Tu cuenta está lista! Ya podés compartir enlaces.' : 'Sesión iniciada.');
        closeModal();
      } catch (error) {
        renderFormError(error.message);
      } finally {
        if (submitButton.isConnected) submitButton.disabled = false;
      }
    });
  }

  if (type === 'publish') {
    const publishForm = root.querySelector('#publish-form');
    const typeSelect = root.querySelector('#publish-type');
    const singleLinkField = root.querySelector('#single-link-field');
    const singleLinkInput = root.querySelector('#single-link-url');
    const episodesSection = root.querySelector('#series-episodes');
    const episodeList = root.querySelector('#episode-list');
    const syncEpisodeFields = () => {
      const showEpisodes = typeSelect.value === 'series';
      singleLinkField.hidden = showEpisodes;
      singleLinkInput.required = !showEpisodes;
      singleLinkInput.disabled = showEpisodes;
      episodesSection.hidden = !showEpisodes;
      episodeList.querySelectorAll('[data-episode-field]').forEach((input) => {
        input.required = showEpisodes && input.dataset.episodeField !== 'title';
        input.disabled = !showEpisodes;
      });
    };
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'series' && episodeList.children.length === 0) {
        episodeList.innerHTML = episodeRowMarkup();
      }
      syncEpisodeFields();
    });
    root.querySelector('#add-episode').addEventListener('click', () => {
      const count = episodeList.querySelectorAll('.episode-entry').length;
      const last = episodeList.querySelector('.episode-entry:last-child');
      const season = last?.querySelector('[data-episode-field="season_number"]')?.value || '1';
      const lastNumber = Number(last?.querySelector('[data-episode-field="episode_number"]')?.value || count);
      episodeList.insertAdjacentHTML('beforeend', episodeRowMarkup({
        season_number: season,
        episode_number: lastNumber + 1
      }));
      syncEpisodeFields();
    });
    episodeList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('.episode-remove');
      if (!removeButton) return;
      const rows = episodeList.querySelectorAll('.episode-entry');
      if (rows.length <= 1) {
        renderFormError('Una serie necesita al menos un episodio.');
        return;
      }
      removeButton.closest('.episode-entry').remove();
    });
    syncEpisodeFields();
    publishForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      if (typeSelect.value === 'series') {
        payload.episodes = [...episodeList.querySelectorAll('.episode-entry')].map((row) => ({
          season_number: Number(row.querySelector('[data-episode-field="season_number"]').value),
          episode_number: Number(row.querySelector('[data-episode-field="episode_number"]').value),
          title: row.querySelector('[data-episode-field="title"]').value.trim(),
          link_url: row.querySelector('[data-episode-field="link_url"]').value.trim()
        }));
        payload.link_url = payload.episodes[0]?.link_url || '';
      } else {
        payload.episodes = [];
      }
      const submitButton = event.currentTarget.querySelector('[type="submit"]');
      submitButton.disabled = true;
      try {
        const isEditing = !!state.modal?.payload?.editing;
        const endpoint = isEditing ? 'posts.php' : 'posts.php';
        const body = isEditing
          ? JSON.stringify({ ...payload, action: 'update_post', post_id: state.modal.payload.id })
          : JSON.stringify(payload);

        await api(endpoint, { method: 'POST', body });
        closeModal();
        if (document.body.dataset.page === 'detail') {
          await initDetailPage();
        } else {
          state.filter = 'all';
          state.search = '';
          if (elements.searchInput) elements.searchInput.value = '';
        }
        renderNotice(isEditing ? '¡Publicación actualizada!' : '¡Publicado! Tu enlace ya está en la cartelera.');
        if (document.body.dataset.page !== 'detail') await loadPosts();
      } catch (error) {
        renderFormError(error.message);
      } finally {
        if (submitButton.isConnected) submitButton.disabled = false;
      }
    });
  }

  if (type === 'profile') {
    root.querySelector('#logout-btn')?.addEventListener('click', async () => {
      try {
        await api('auth.php?action=logout', { method: 'POST' });
        state.user = null;
        updateAuthButtons();
        closeModal();
        renderNotice('Sesión cerrada.');
        await loadPosts();
      } catch (error) {
        renderNotice(error.message, true);
      }
    });

    root.querySelectorAll('.profile-post').forEach((button) => {
      button.addEventListener('click', () => {
        const post = state.posts.find((item) => String(item.id) === button.dataset.postId);
        if (post) openDetail(post);
      });
    });
  }

  if (type === 'detail' && payload) {
    root.querySelector('#share-post-btn')?.addEventListener('click', async () => {
      const shareUrl = payload.link_url;
      const shareText = `${payload.title} — ${payload.username}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: shareText, text: shareText, url: shareUrl });
          renderNotice('Enlace compartido.');
          return;
        } catch {
          // fall through to clipboard fallback
        }
      }
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        renderNotice('Link copiado al portapapeles.');
      } catch {
        window.open(shareUrl, '_blank', 'noopener,noreferrer');
      }
    });

    if (state.user) {
      root.querySelector('#toggle-like-btn')?.addEventListener('click', async () => {
        try {
          const result = await api('posts.php', {
            method: 'POST',
            body: JSON.stringify({ action: 'toggle_like', post_id: payload.id })
          });
          payload.liked_by_me = result.result.liked;
          payload.likes_count = result.result.likes_count;
          openDetail(payload);
          renderNotice(result.result.liked ? 'Guardaste tu me gusta.' : 'Quitaste tu me gusta.');
          await loadPosts();
        } catch (error) {
          renderNotice(error.message, true);
        }
      });

      root.querySelector('#review-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const result = await api('posts.php', {
            method: 'POST',
            body: JSON.stringify({
              action: 'save_review',
              post_id: payload.id,
              rating: Number(form.get('rating')),
              review: String(form.get('review') || '')
            })
          });
          payload.rating_average = result.result.rating_average;
          payload.review_count = result.result.review_count;
          openDetail(payload);
          renderNotice('Tu reseña quedó guardada.');
          await loadPosts();
        } catch (error) {
          renderNotice(error.message, true);
        }
      });
    }

    if (state.user && state.user.id === payload.user_id) {
      root.querySelector('#edit-post-btn')?.addEventListener('click', () => {
        state.modal = { type: 'publish', payload: { ...payload, editing: true } };
        renderModal();
      });

      root.querySelector('#delete-post').addEventListener('click', async () => {
        if (!window.confirm('¿Querés eliminar esta publicación?')) return;
        try {
          await api(`posts.php?id=${payload.id}`, { method: 'DELETE' });
          closeModal();
          renderNotice('Publicación eliminada.');
          await loadPosts();
        } catch (error) {
          renderNotice(error.message, true);
        }
      });
    }
  }
}

document.querySelectorAll('.filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach((item) => item.classList.toggle('active', item === button));
    renderPosts();
  });
});

if (elements.searchInput) {
  elements.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderPosts();
  });
}

if (elements.clearSearch) {
  elements.clearSearch.addEventListener('click', () => {
    state.search = '';
    if (elements.searchInput) elements.searchInput.value = '';
    renderPosts();
  });
}

if (elements.btnLogin) elements.btnLogin.addEventListener('click', () => openModal('login'));
if (elements.btnRegister) elements.btnRegister.addEventListener('click', () => openModal('register'));
if (elements.btnProfile) elements.btnProfile.addEventListener('click', openProfilePage);
if (elements.btnPublicar) elements.btnPublicar.addEventListener('click', () => openModal('publish'));
if (elements.heroPublish) elements.heroPublish.addEventListener('click', () => openModal('publish'));
if (elements.emptyPublish) elements.emptyPublish.addEventListener('click', () => openModal('publish'));

async function initDetailPage() {
  const root = document.getElementById('detail-page-root');
  if (!root) return;

  const id = Number(new URLSearchParams(window.location.search).get('id'));
  if (!id) {
    root.innerHTML = `
      <div class="detail-empty">
        <h1>Publicación no encontrada</h1>
        <p>La referencia que buscas no existe o ya fue eliminada.</p>
        <a class="button button-primary" href="./">Volver a la cartelera</a>
      </div>
    `;
    return;
  }

  try {
    if (!state.detailViewRegistered) {
      await api('posts.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'register_view', post_id: id })
      });
      state.detailViewRegistered = true;
    }
    const result = await api(`posts.php`);
    const post = (result.posts || []).find((item) => Number(item.id) === id);
    if (!post) {
      root.innerHTML = `
        <div class="detail-empty">
          <h1>Publicación no encontrada</h1>
          <p>La referencia que buscas no existe o ya fue eliminada.</p>
          <a class="button button-primary" href="./">Volver a la cartelera</a>
        </div>
      `;
      return;
    }
    const episodesResult = post.type === 'series'
      ? await api(`posts.php?episodes=${encodeURIComponent(String(id))}`)
      : { episodes: [] };
    post.episodes = episodesResult.episodes || [];
    const reviewsResult = await api(`posts.php?reviews=${encodeURIComponent(String(id))}`);
    const reviews = reviewsResult.reviews || [];
    const reviewMarkup = reviews.length
      ? reviews.map((review) => `
          <article class="review-item">
            <div class="review-item-header">
              <strong>${escapeHtml(review.username)}</strong>
              <span class="review-rating">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</span>
            </div>
            ${review.review ? `<p>${escapeHtml(review.review)}</p>` : '<p class="review-no-comment">Dejó una puntuación sin comentario.</p>'}
            <time>${escapeHtml(review.created_at)}</time>
          </article>
        `).join('')
      : '<p class="review-empty">Todavía no hay reseñas. Sé el primero en opinar.</p>';

    const user = state.user || null;
    const ratingLabel = post.rating_average ? `${Number(post.rating_average).toFixed(1)} ★` : 'Sin puntuación aún';
    const episodesBySeason = new Map();
    post.episodes.forEach((episode) => {
      const seasonNumber = Number(episode.season_number);
      if (!episodesBySeason.has(seasonNumber)) episodesBySeason.set(seasonNumber, []);
      episodesBySeason.get(seasonNumber).push(episode);
    });
    const seasonCount = episodesBySeason.size;
    const episodeMarkup = post.episodes.length
      ? `<section class="episode-browser">
          <h2>Temporadas <span>${seasonCountLabel(seasonCount)} · ${post.episodes.length} ${post.episodes.length === 1 ? 'episodio' : 'episodios'}</span></h2>
          <div class="episode-seasons">
            ${[...episodesBySeason.entries()].map(([seasonNumber, episodes]) => `
              <section class="episode-season">
                <h3>Temporada ${seasonNumber} <span>${episodes.length} ${episodes.length === 1 ? 'episodio' : 'episodios'}</span></h3>
                <div class="episode-browser-list">
                  ${episodes.map((episode) => `
                    <a class="episode-link" href="${escapeHtml(episode.link_url)}" target="_blank" rel="noopener noreferrer">
                      <span class="episode-number">E${Number(episode.episode_number)}</span>
                      <span class="episode-name">${escapeHtml(episode.title || `Episodio ${Number(episode.episode_number)}`)}</span>
                      <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                  `).join('')}
                </div>
              </section>
            `).join('')}
          </div>
        </section>`
      : '';
    root.innerHTML = `
      <div class="detail-page-shell">
        <div class="detail-page-header">
          <a class="button button-quiet" href="./"><i class="bi bi-arrow-left"></i> Volver</a>
        </div>
        <article class="detail-page-card">
          <div class="detail-layout">
            ${posterMarkup(post)}
            <div class="detail-copy">
              <span class="post-type">${TYPE_LABELS[post.type]}${post.type === 'series' ? ` · ${seasonCountLabel(seasonCount)}` : ''}${post.year ? ` · ${post.year}` : ''}</span>
              <h1>${escapeHtml(post.title)}</h1>
              <span class="detail-author">Por <strong>${escapeHtml(post.username)}</strong></span>
              <p>${escapeHtml(post.description || 'Compartido por la comunidad de Viciograma.')}</p>
              <span class="post-genre">${escapeHtml(post.genre || 'Sin género indicado')}</span>
              <div class="social-stats">
                <span><i class="bi bi-eye-fill"></i> ${post.views_count ?? 0} visitas</span>
                <span><i class="bi bi-heart-fill"></i> ${post.likes_count ?? 0}</span>
                <span><i class="bi bi-star-fill"></i> ${ratingLabel}</span>
                <span><i class="bi bi-chat-left-text"></i> ${post.review_count ?? 0} reseñas</span>
              </div>
              <div class="detail-actions">
                ${post.type === 'series' ? '' : `<a class="button button-primary detail-link" href="${escapeHtml(post.link_url)}" target="_blank" rel="noopener noreferrer">Visitar enlace externo <i class="bi bi-box-arrow-up-right"></i></a>`}
                <button class="button button-quiet" type="button" id="share-post-btn"><i class="bi bi-share"></i> Compartir</button>
                ${user ? `<button class="button button-quiet" type="button" id="toggle-like-btn"><i class="bi bi-heart${post.liked_by_me ? '-fill' : ''}"></i> ${post.liked_by_me ? 'Te gusta' : 'Me gusta'}</button>` : ''}
                ${user && Number(user.id) === Number(post.user_id) ? '<button class="button button-quiet" type="button" id="edit-post-page-btn"><i class="bi bi-pencil"></i> Editar publicación</button>' : ''}
              </div>
              ${episodeMarkup}
              <div class="review-box">
                <div class="review-header">
                  <span class="eyebrow">PUNTUAR Y OPINAR</span>
                  <span class="review-count">${reviews.length} reseñas</span>
                </div>
                <div class="review-list">${reviewMarkup}</div>
                <form id="review-form" class="form-stack compact">
                  <label>Tu puntuación
                    <select name="rating">
                      <option value="5">5 ★★★★★</option>
                      <option value="4">4 ★★★★☆</option>
                      <option value="3">3 ★★★☆☆</option>
                      <option value="2">2 ★★☆☆☆</option>
                      <option value="1">1 ★☆☆☆☆</option>
                    </select>
                  </label>
                  <label>Reseña (opcional)
                    <textarea name="review" rows="3" maxlength="600" placeholder="Contale a la comunidad qué te pareció..."></textarea>
                  </label>
                  <button class="button button-primary" type="submit">Guardar reseña</button>
                </form>
              </div>
            </div>
          </div>
        </article>
      </div>
    `;

    const shareButton = document.getElementById('share-post-btn');
    shareButton?.addEventListener('click', async () => {
      const shareText = `${post.title} — ${post.username}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: shareText, text: shareText, url: post.link_url });
          renderNotice('Enlace compartido.');
          return;
        } catch {
          // ignore and fallback
        }
      }
      try {
        await navigator.clipboard.writeText(`${shareText} ${post.link_url}`);
        renderNotice('Link copiado al portapapeles.');
      } catch {
        window.open(post.link_url, '_blank', 'noopener,noreferrer');
      }
    });

    document.getElementById('edit-post-page-btn')?.addEventListener('click', () => {
      openModal('publish', { ...post, editing: true });
    });

    const toggleLike = document.getElementById('toggle-like-btn');
    toggleLike?.addEventListener('click', async () => {
      try {
        const result = await api('posts.php', { method: 'POST', body: JSON.stringify({ action: 'toggle_like', post_id: post.id }) });
        post.liked_by_me = result.result.liked;
        post.likes_count = result.result.likes_count;
          await initDetailPage();
        renderNotice(result.result.liked ? 'Guardaste tu me gusta.' : 'Quitaste tu me gusta.');
      } catch (error) {
        renderNotice(error.message, true);
      }
    });

    const reviewForm = document.getElementById('review-form');
    reviewForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const result = await api('posts.php', { method: 'POST', body: JSON.stringify({ action: 'save_review', post_id: post.id, rating: Number(form.get('rating')), review: String(form.get('review') || '') }) });
        post.rating_average = result.result.rating_average;
        post.review_count = result.result.review_count;
        await initDetailPage();
        renderNotice('Tu reseña quedó guardada.');
      } catch (error) {
        renderNotice(error.message, true);
      }
    });
  } catch (error) {
    renderNotice(error.message, true);
  }
}

async function initProfilePage() {
  const root = document.getElementById('profile-page-root');
  if (!root) return;

  if (!state.user) {
    root.innerHTML = `
      <div class="detail-empty">
        <h1>Perfil privado</h1>
        <p>Necesitás iniciar sesión para ver tu perfil.</p>
        <a class="button button-primary" href="./">Volver a la cartelera</a>
      </div>
    `;
    return;
  }

  const postsByUser = state.posts.filter((post) => post.user_id === state.user.id);
  const score = postsByUser.length > 0
    ? (postsByUser.reduce((sum, post) => sum + (Number(post.rating_average) || 0), 0) / postsByUser.length).toFixed(1)
    : '0.0';

  root.innerHTML = `
    <div class="detail-page-shell">
      <div class="detail-page-header">
        <a class="button button-quiet" href="./"><i class="bi bi-arrow-left"></i> Volver</a>
      </div>
      <article class="detail-page-card profile-page-card">
        <div class="profile-layout">
          <div class="profile-card">
            <div class="profile-avatar">${escapeHtml((state.user.username || 'U').slice(0, 1).toUpperCase())}</div>
            <div>
              <h1>${escapeHtml(state.user.username)}</h1>
              <span class="detail-author">${escapeHtml(state.user.email)}</span>
            </div>
          </div>
          <div class="profile-stats">
            <div><strong>${postsByUser.length}</strong><span>publicaciones</span></div>
            <div><strong>${state.posts.filter((post) => (post.likes_count || 0) > 0).length}</strong><span>aprobados</span></div>
            <div><strong>${score}</strong><span>promedio</span></div>
          </div>
          <div class="profile-actions">
            <button class="button button-quiet" type="button" id="logout-btn">Cerrar sesión</button>
          </div>
          <div class="profile-list">
            ${postsByUser.length === 0 ? '<p class="empty-mini">Todavía no publicaste nada. Compartí tu primer enlace.</p>' : postsByUser.map((post) => `
              <button class="profile-post" type="button" data-post-id="${post.id}">
                <span>${escapeHtml(post.title)}</span>
                <small>${TYPE_LABELS[post.type]}${post.type === 'series' ? ` · ${seasonCountLabel(post.season_count)}` : ''} · ${post.views_count ?? 0} visitas · ${post.likes_count ?? 0} likes · ${(post.rating_average ?? 0).toFixed(1)} ★</small>
              </button>
            `).join('')}
          </div>
        </div>
      </article>
    </div>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await api('auth.php?action=logout', { method: 'POST' });
      state.user = null;
      updateAuthButtons();
      initProfilePage();
      renderNotice('Sesión cerrada.');
    } catch (error) {
      renderNotice(error.message, true);
    }
  });

  root.querySelectorAll('.profile-post').forEach((button) => {
    button.addEventListener('click', () => {
      const post = state.posts.find((item) => String(item.id) === button.dataset.postId);
      if (post) openDetail(post);
    });
  });
}

async function init() {
  await loadSession();
  await loadPosts();
  if (document.body.dataset.page === 'detail') {
    await initDetailPage();
  }
  if (document.body.dataset.page === 'profile') {
    await initProfilePage();
  }
  if (elements.loading) elements.loading.classList.add('hidden');
}

init();
