// Theme — auto-detect system preference, allow manual override
const root = document.documentElement;
const btn  = document.getElementById('theme-toggle');

function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  btn.textContent = dark ? '☀︎' : '☾';
}

const saved = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(saved ? saved === 'dark' : prefersDark);

btn.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  applyTheme(!isDark);
});

// Projects
fetch('https://api.github.com/users/myowinthein/repos?per_page=100&sort=updated')
  .then(res => res.json())
  .then(repos => {
    const grid = document.getElementById('grid');
    const paged = repos.filter(r => r.has_pages && !r.fork && r.name !== 'myowinthein.github.io');

    if (paged.length === 0) {
      grid.innerHTML = '<p class="loading">No projects found.</p>';
      return;
    }

    grid.innerHTML = paged.map(r => {
      const url = r.homepage || `https://myowinthein.github.io/${r.name}`;
      const desc = r.description || '';
      return `
        <a class="card" href="${url}" target="_blank">
          <div class="card-name">${r.name}</div>
          <div class="card-desc">${desc}</div>
          <div class="card-link">View site →</div>
        </a>`;
    }).join('');
  })
  .catch(() => {
    document.getElementById('grid').innerHTML = '<p class="loading">Could not load projects.</p>';
  });
