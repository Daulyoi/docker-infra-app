// Empty = same-origin /api/... (nginx proxies to the backend in Docker/EC2).
// For local static serving without the proxy, use: 'http://localhost:3000'
const API_URL = '';

const healthEl = document.getElementById('health');
const listEl = document.getElementById('list');
const listViewEl = document.getElementById('list-view');
const sourceEl = document.getElementById('source');
const errorEl = document.getElementById('error');
const form = document.getElementById('add-form');
const detailEl = document.getElementById('detail');
const detailTitleEl = document.getElementById('detail-title');
const detailBodyEl = document.getElementById('detail-body');
const detailMetaEl = document.getElementById('detail-meta');
const detailBackBtn = document.getElementById('detail-back');

function showError(message) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function showListView() {
  detailEl.hidden = true;
  listViewEl.hidden = false;
  form.hidden = false;
}

function showDetailView(item) {
  detailTitleEl.textContent = item.title;
  detailBodyEl.textContent = item.body || '';
  const created = item.created_at
    ? new Date(item.created_at).toLocaleString()
    : '';
  detailMetaEl.textContent = created ? `Created ${created}` : '';
  listViewEl.hidden = true;
  form.hidden = true;
  detailEl.hidden = false;
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    const data = await res.json();
    const label = `health: ${data.status} (db ${data.db}, redis ${data.redis})`;
    healthEl.textContent = label;
    healthEl.className = data.status === 'ok' ? 'ok' : 'bad';
  } catch {
    healthEl.textContent = 'health: unreachable';
    healthEl.className = 'bad';
  }
}

function renderItems(items) {
  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = '<li><p>No notes yet.</p></li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="row">
        <h2></h2>
        <div class="actions">
          <button type="button" class="secondary view-btn">View</button>
          <button type="button" class="secondary delete-btn">Delete</button>
        </div>
      </div>
      <p class="body"></p>
    `;
    li.querySelector('h2').textContent = item.title;
    li.querySelector('.body').textContent = item.body || '';
    li.querySelector('.view-btn').addEventListener('click', () => openItem(item.id));
    li.querySelector('.delete-btn').addEventListener('click', () => deleteItem(item.id));
    listEl.appendChild(li);
  }
}

async function openItem(id) {
  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items/${id}`);
    if (res.status === 404) throw new Error('Note not found');
    if (!res.ok) throw new Error(`Failed to load note (${res.status})`);
    const item = await res.json();
    showDetailView(item);
  } catch (err) {
    showError(err.message || 'Failed to load note');
  }
}

async function loadItems() {
  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items`);
    if (!res.ok) throw new Error(`List failed (${res.status})`);
    const data = await res.json();
    sourceEl.textContent =
      data.source === 'cache'
        ? 'List served from Redis cache'
        : 'List served from Postgres';
    renderItems(data.items || []);
  } catch (err) {
    showError(err.message || 'Failed to load items');
  }
}

async function deleteItem(id) {
  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete failed (${res.status})`);
    }
    await loadItems();
  } catch (err) {
    showError(err.message || 'Failed to delete');
  }
}

detailBackBtn.addEventListener('click', () => {
  showError('');
  showListView();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const body = document.getElementById('body').value;
  if (!title) return;

  showError('');
  try {
    const res = await fetch(`${API_URL}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Create failed (${res.status})`);
    }
    form.reset();
    await loadItems();
  } catch (err) {
    showError(err.message || 'Failed to create');
  }
});

checkHealth();
loadItems();
setInterval(checkHealth, 10000);
