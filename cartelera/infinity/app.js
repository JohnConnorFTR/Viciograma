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
  notice: ''
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
  btnPublicar: document.getElementById('btn-publicar'),
  heroPublish: document.getElementById('hero-publish'),
  emptyPublish: document.getElementById('empty-publish')
};

async function api(path, options = {}) {
  const base = (() => {
    const pathname = window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    return pathname && pathname !== '' ? `${pathname}/` : '/';
  })();

  let response;
  try {
    response = await fetch(`${base}api/${path}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options
    });
  } catch {
    throw new Error('No se pudo conectar con la API. Comprobá que la carpeta api esté dentro de htdocs y que PHP esté habilitado.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`La API devolvió una respuesta no válida (HTTP ${response.status}). Abrí api/health.php para revisar el servidor.`);
  }

  if (!response.ok) {
    throw new Error(payload?.error || `La API respondió HTTP ${response.status}. Abrí api/health.php para revisar el servidor.`);
  }

  return payload;
}

function posterMarkup(post) {
  const palette = ['poster-copper', 'poster-rose', 'poster-blue', 'poster-violet', 'poster-green'];
  const posterClass = palette[(post.id || post.title.length) % palette.length];
  const image = post.poster_url ? `<img src="${post.poster_url}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('fallback-poster');" />` : '';
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

function renderNotice(message, isError = false) {
  const box = isError ? elements.error : elements.notice;
  const otherBox = isError ? elements.notice : elements.error;
  otherBox.classList.add('hidden');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
}

function renderFormError(message) {
  const feedback = elements.modalRoot.querySelector('#modal-feedback');
  if (!feedback) {
    renderNotice(message, true);
    return;
  }
  feedback.textContent = message;
  feedback.classList.toggle('hidden', !message);
}

function renderPosts() {
  const filtered = state.posts.filter((post) => {
    const q = state.search.trim().toLowerCase();
    const matchesType = state.filter === 'all' || post.type === state.filter;
    const matchesSearch = !q || [post.title, post.genre, post.description, post.username].join(' ').toLowerCase().includes(q);
    return matchesType && matchesSearch;
  });

  elements.postCount.textContent = String(filtered.length);
  elements.emptyState.classList.toggle('hidden', filtered.length > 0 || state.loading);
  elements.featuredWrap.classList.toggle('hidden', filtered.length === 0 || state.search || state.filter !== 'all');

  if (filtered.length === 0) {
    elements.postsGrid.innerHTML = '';
    return;
  }

  const featured = filtered[0];
  elements.featuredWrap.innerHTML = `
    <button class="featured-card" type="button" data-id="${featured.id}">
      ${posterMarkup(featured)}
      <span class="featured-content">
        <span class="eyebrow"><span class="live-dot"></span> RECIÉN AGREGADO</span>
        <strong>${escapeHtml(featured.title)}</strong>
        <span class="featured-description">${escapeHtml(featured.description || 'Una recomendación de la comunidad.')}</span>
        <span class="featured-meta">${TYPE_LABELS[featured.type]}${featured.year ? ` · ${featured.year}` : ''}${featured.genre ? ` · ${featured.genre}` : ''}</span>
        <span class="featured-action">Ver publicación <i class="bi bi-arrow-up-right"></i></span>
      </span>
    </button>
  `;

  const visible = state.search || state.filter !== 'all' ? filtered : filtered.slice(1);
  elements.postsGrid.innerHTML = visible.map((post) => `
    <button class="post-card" type="button" data-id="${post.id}">
      ${posterMarkup(post)}
      <span class="post-info">
        <span class="post-type">${TYPE_LABELS[post.type]}${post.year ? ` · ${post.year}` : ''}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <span class="post-genre">${escapeHtml(post.genre || `Compartido por ${post.username}`)}</span>
      </span>
    </button>
  `).join('');

  elements.featuredWrap.querySelector('.featured-card')?.addEventListener('click', () => openDetail(featured));
  elements.postsGrid.querySelectorAll('.post-card').forEach((button) => {
    button.addEventListener('click', () => openDetail(state.posts.find((post) => String(post.id) === button.dataset.id)));
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
    elements.loading.classList.toggle('hidden', !state.loading);
    if (!state.loading) {
      renderPosts();
    }
  }
}

async function loadSession() {
  try {
    const result = await api('auth.php?action=me');
    state.user = result.user;
  } catch {
    state.user = null;
    renderNotice(error.message, true);
  }
  updateAuthButtons();
}

function updateAuthButtons() {
  const isLogged = !!state.user;
  elements.btnPublicar.classList.toggle('hidden', !isLogged);
  elements.btnLogin.classList.toggle('hidden', isLogged);
  elements.btnRegister.classList.toggle('hidden', isLogged);
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
  openModal('detail', post);
}

function renderModal() {
  const root = elements.modalRoot;
  if (!state.modal) {
    root.innerHTML = '';
    return;
  }

  const { type, payload } = state.modal;
  let content = '';

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
    content = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Publicar enlace">
          <div class="modal-heading">
            <div><span class="eyebrow">VICIOGRAMA</span><h2>Compartí lo que te gustó</h2></div>
            <button class="icon-button" type="button" data-close="modal">✕</button>
          </div>
          <form id="publish-form" class="form-stack">
            <p id="modal-feedback" class="form-error hidden" role="alert"></p>
            <label>Título<input name="title" required maxlength="120" placeholder="¿Qué vamos a ver?" /></label>
            <div class="form-row">
              <label>Tipo<select name="type"><option value="movie">Película</option><option value="series">Serie</option><option value="video">Video</option></select></label>
              <label>Año<input name="year" type="number" min="1888" max="2100" placeholder="2026" /></label>
            </div>
            <label>Género<input name="genre" maxlength="40" placeholder="Drama, comedia, ciencia ficción…" /></label>
            <label>Enlace externo<input name="link_url" type="url" required placeholder="https://…" /></label>
            <label>Portada (opcional)<input name="poster_url" type="url" placeholder="https://…" /></label>
            <label>Descripción<textarea name="description" maxlength="600" rows="3" placeholder="¿Por qué la recomendás?"></textarea></label>
            <button class="button button-primary detail-link" type="submit">Publicar en cartelera</button>
          </form>
        </div>
      </div>
    `;
  }

  if (type === 'detail' && payload) {
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
              <span class="post-type">${TYPE_LABELS[payload.type]}${payload.year ? ` · ${payload.year}` : ''}</span>
              <p>${escapeHtml(payload.description || 'Compartido por la comunidad de Viciograma.')}</p>
              <span class="post-genre">${escapeHtml(payload.genre || 'Sin género indicado')}</span>
              <span class="detail-author">Recomendado por <strong>${escapeHtml(payload.username)}</strong></span>
            </div>
          </div>
          <a class="button button-primary detail-link" href="${payload.link_url}" target="_blank" rel="noopener noreferrer">Visitar enlace externo <i class="bi bi-box-arrow-up-right"></i></a>
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
    root.querySelector('#publish-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      const submitButton = event.currentTarget.querySelector('[type="submit"]');
      submitButton.disabled = true;
      try {
        await api('posts.php', { method: 'POST', body: JSON.stringify(payload) });
        closeModal();
        state.filter = 'all';
        state.search = '';
        elements.searchInput.value = '';
        renderNotice('¡Publicado! Tu enlace ya está en la cartelera.');
        await loadPosts();
      } catch (error) {
        renderFormError(error.message);
      } finally {
        if (submitButton.isConnected) submitButton.disabled = false;
      }
    });
  }

  if (type === 'detail' && payload && state.user && state.user.id === payload.user_id) {
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

document.querySelectorAll('.filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach((item) => item.classList.toggle('active', item === button));
    renderPosts();
  });
});

elements.searchInput.addEventListener('input', (event) => {
  state.search = event.target.value;
  renderPosts();
});

elements.clearSearch.addEventListener('click', () => {
  state.search = '';
  elements.searchInput.value = '';
  renderPosts();
});

elements.btnLogin.addEventListener('click', () => openModal('login'));
elements.btnRegister.addEventListener('click', () => openModal('register'));
elements.btnPublicar.addEventListener('click', () => openModal('publish'));
elements.heroPublish.addEventListener('click', () => openModal('publish'));
elements.emptyPublish.addEventListener('click', () => openModal('publish'));

async function init() {
  await loadSession();
  await loadPosts();
  elements.loading.classList.add('hidden');
}

init();
