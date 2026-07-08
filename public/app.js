const form = document.getElementById('form');
const symbolInput = document.getElementById('symbol');
const submitBtn = document.getElementById('submit');
const errorEl = document.getElementById('error');
const loadingEl = document.getElementById('loading');
const resultsEl = document.getElementById('results');
const suggestionsEl = document.getElementById('suggestions');

const views = {
  analyze: document.getElementById('view-analyze'),
  calendar: document.getElementById('view-calendar'),
  portfolio: document.getElementById('view-portfolio'),
};

let calendarLoaded = false;
let portfolioLoaded = false;
let searchTimer = null;
let searchItems = [];
let activeIndex = -1;

function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
  symbolInput.setAttribute('aria-expanded', 'false');
  searchItems = [];
  activeIndex = -1;
}

function selectSymbol(symbol) {
  symbolInput.value = symbol;
  hideSuggestions();
  form.requestSubmit();
}

function renderSuggestions(items) {
  searchItems = items;
  activeIndex = -1;

  if (!items.length) {
    hideSuggestions();
    return;
  }

  suggestionsEl.innerHTML = items.map((item, idx) => `
    <li class="suggestion-item" role="option" data-index="${idx}" data-symbol="${item.symbol}">
      <span class="suggestion-symbol">${item.symbol}</span>
      <span class="suggestion-name">${item.name}</span>
      <span class="suggestion-exchange">${item.exchange || ''}${item.source === 'local' ? ' · portfell' : ''}</span>
    </li>
  `).join('');

  suggestionsEl.classList.remove('hidden');
  symbolInput.setAttribute('aria-expanded', 'true');

  suggestionsEl.querySelectorAll('.suggestion-item').forEach((el) => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectSymbol(el.dataset.symbol);
    });
  });
}

function highlightSuggestion(index) {
  const nodes = suggestionsEl.querySelectorAll('.suggestion-item');
  nodes.forEach((node, idx) => node.classList.toggle('active', idx === index));
  activeIndex = index;
  if (index >= 0 && nodes[index]) {
    nodes[index].scrollIntoView({ block: 'nearest' });
  }
}

async function fetchSuggestions(query) {
  if (query.trim().length < 2) {
    hideSuggestions();
    return;
  }

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Otsing ebaõnnestus');
    if (symbolInput.value.trim() !== query.trim()) return;
    renderSuggestions(data.items || []);
  } catch {
    hideSuggestions();
  }
}

symbolInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = symbolInput.value;
  searchTimer = setTimeout(() => fetchSuggestions(query), 280);
});

symbolInput.addEventListener('keydown', (e) => {
  if (!searchItems.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightSuggestion(Math.min(activeIndex + 1, searchItems.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightSuggestion(Math.max(activeIndex - 1, 0));
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    selectSymbol(searchItems[activeIndex].symbol);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

symbolInput.addEventListener('blur', () => {
  setTimeout(hideSuggestions, 120);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) hideSuggestions();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
});

document.querySelectorAll('.chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    symbolInput.value = btn.dataset.sym;
    switchView('analyze');
    form.requestSubmit();
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const symbol = symbolInput.value.trim();
  if (!symbol) return;

  hideSuggestions();
  errorEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  submitBtn.disabled = true;

  try {
    const res = await fetch(`/api/analyze/${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Viga');
    renderAnalysis(data);
    resultsEl.classList.remove('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    loadingEl.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

document.getElementById('refresh-calendar').addEventListener('click', () => loadCalendar(true));
document.getElementById('refresh-portfolio').addEventListener('click', () => loadPortfolio(true));

function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));

  if (name === 'calendar' && !calendarLoaded) loadCalendar();
  if (name === 'portfolio' && !portfolioLoaded) loadPortfolio();

  history.replaceState(null, '', `#${name}`);
}

function statusLabel(status) {
  if (status === 'pass') return '≥5%';
  if (status === 'warn') return '3–5%';
  if (status === 'fail') return 'Alla / risk';
  return '—';
}

function renderAnalysis(data) {
  document.getElementById('stock-name').textContent = `${data.name} (${data.symbol})`;
  document.getElementById('stock-meta').textContent = [
    data.resolvedFrom ? `Otsisid: ${data.resolvedFrom} → ${data.symbol}` : null,
    data.exchange,
    data.price != null ? `Hind: ${data.price} ${data.currency || ''}` : null,
    data.exDividendDateFmt ? `Ex: ${data.exDividendDateFmt}` : null,
  ].filter(Boolean).join(' · ');

  const v = data.verdict;
  const verdictEl = document.getElementById('verdict');
  verdictEl.className = `verdict ${v.level}`;
  verdictEl.innerHTML = `<strong>${v.title}</strong>${v.text}`;

  document.getElementById('kpi-yield').innerHTML = `
    <div class="lbl">Dividenditootlus</div>
    <div class="val">${data.dividendYield != null ? `${data.dividendYield}%` : '—'}</div>
  `;

  document.getElementById('kpi-annual').innerHTML = `
    <div class="lbl">Aastane dividend</div>
    <div class="val">${data.annualDividend != null ? `${data.annualDividend} ${data.currency || ''}` : '—'}</div>
  `;

  document.getElementById('kpi-price').innerHTML = `
    <div class="lbl">Hind</div>
    <div class="val">${data.price != null ? `${data.price} ${data.currency || ''}` : '—'}</div>
  `;

  document.getElementById('kpi-ex').innerHTML = `
    <div class="lbl">Ex-dividend</div>
    <div class="val">${data.exDividendDateFmt || '—'}</div>
  `;

  document.getElementById('checks').innerHTML = data.checks.map((c) => `
    <article class="check ${c.status}">
      <div class="check-title">${c.title}</div>
      <div class="check-msg">${c.message}</div>
      ${c.detail ? `<div class="check-detail">${c.detail}</div>` : ''}
    </article>
  `).join('');

  const histSection = document.getElementById('history-section');
  const histEl = document.getElementById('history');
  if (data.annualDividends?.length) {
    histSection.classList.remove('hidden');
    const sorted = [...data.annualDividends].sort((a, b) => b.year - a.year);
    histEl.innerHTML = sorted.map((y) => `
      <div class="year-pill">
        <strong>${y.year}</strong>
        <div class="year-amount">${y.total.toFixed(2)}<span class="year-unit">/ aktsia</span></div>
      </div>
    `).join('');
  } else {
    histSection.classList.add('hidden');
    histEl.innerHTML = '';
  }

  renderFinancials(data);

  document.getElementById('disclaimer').textContent = `${data.meta.disclaimer} Eesmärk: ≥${data.meta.minYieldPct}% tootlus. Allikas: ${data.meta.source}.`;
}

function finCell(value, tone) {
  if (value == null) return '<td class="fin-na">—</td>';
  return `<td class="${tone || ''}">${value}</td>`;
}

function toneNum(raw) {
  if (raw == null) return '';
  return raw >= 0 ? 'fin-pos' : 'fin-neg';
}

function toneDebt(raw) {
  if (raw == null) return '';
  return raw <= 0 ? 'fin-pos' : '';
}

function renderFinancials(data) {
  const section = document.getElementById('financials-section');
  const years = data.financialYears || [];

  if (!years.length) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  document.getElementById('fin-currency').textContent = data.financialCurrency ? `· ${data.financialCurrency}` : '';

  const head = document.getElementById('fin-head');
  head.innerHTML = '<th>Näitaja</th>' + years.map((y) => `<th>${y.year}</th>`).join('');

  const rows = [
    {
      label: 'Netovõlg',
      hint: 'võlg − raha (miinus = netoraha)',
      cells: years.map((y) => finCell(y.netDebt, toneDebt(y.netDebtRaw))),
    },
    {
      label: 'Vaba raha (FCF)',
      hint: 'vaba rahavoog',
      cells: years.map((y) => finCell(y.freeCashFlow, toneNum(y.freeCashFlowRaw))),
    },
    {
      label: 'Omakapital',
      hint: 'stockholders equity',
      cells: years.map((y) => finCell(y.equity)),
    },
    {
      label: 'ROE',
      hint: 'omakapitali tootlus',
      cells: years.map((y) => finCell(y.roe != null ? `${y.roe}%` : null, toneNum(y.roe))),
    },
    {
      label: 'Kasum (neto)',
      hint: 'net income',
      cells: years.map((y) => finCell(y.netIncome, toneNum(y.netIncomeRaw))),
    },
  ];

  document.getElementById('fin-body').innerHTML = rows.map((r) => `
    <tr>
      <th scope="row"><span class="fin-name">${r.label}</span><span class="fin-hint">${r.hint}</span></th>
      ${r.cells.join('')}
    </tr>
  `).join('');
}

async function loadCalendar(force = false) {
  const loading = document.getElementById('calendar-loading');
  const error = document.getElementById('calendar-error');
  const list = document.getElementById('calendar-list');

  loading.classList.remove('hidden');
  error.classList.add('hidden');

  try {
    const res = await fetch('/api/calendar?days=45');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Viga');

    if (!data.items.length) {
      list.innerHTML = '<p class="empty">Järgmise 45 päeva jooksul ex-kuupäevi ei leitud (või andmed puuduvad).</p>';
    } else {
      list.innerHTML = data.items.map((item) => `
        <article class="cal-card ${item.strategyStatus}">
          <div class="cal-top">
            <div>
              <strong>${item.symbol}</strong>
              <span class="cal-name">${item.label || item.name}</span>
            </div>
            <span class="badge ${item.strategyStatus}">${statusLabel(item.strategyStatus)}</span>
          </div>
          <div class="cal-meta">
            <span>Ex: <strong>${item.exDividendDateFmt}</strong> (${item.daysUntilEx} p)</span>
            <span>Yield: <strong>${item.dividendYield != null ? item.dividendYield + '%' : '—'}</strong></span>
            ${item.note ? `<span class="cal-note">${item.note}</span>` : ''}
          </div>
          <button type="button" class="link-btn" data-analyze="${item.symbol}">Kontrolli →</button>
        </article>
      `).join('');

      list.querySelectorAll('[data-analyze]').forEach((btn) => {
        btn.addEventListener('click', () => {
          symbolInput.value = btn.dataset.analyze;
          switchView('analyze');
          form.requestSubmit();
        });
      });
    }

    calendarLoaded = true;
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
    list.innerHTML = '';
  } finally {
    loading.classList.add('hidden');
  }
}

async function loadPortfolio(force = false) {
  const loading = document.getElementById('portfolio-loading');
  const error = document.getElementById('portfolio-error');
  const summary = document.getElementById('portfolio-summary');
  const wrap = document.getElementById('portfolio-table-wrap');
  const body = document.getElementById('portfolio-body');

  loading.classList.remove('hidden');
  error.classList.add('hidden');

  try {
    const res = await fetch('/api/portfolio');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Viga');

    summary.classList.remove('hidden');
    summary.innerHTML = `
      <div class="stat"><span class="stat-val">${data.summary.meetsStrategy}</span><span class="stat-lbl">≥${data.minYieldPct}% tootlus</span></div>
      <div class="stat"><span class="stat-val">${data.summary.belowStrategy}</span><span class="stat-lbl">Alla eesmärgi</span></div>
      <div class="stat"><span class="stat-val">${data.summary.scanned}</span><span class="stat-lbl">Skaneeritud</span></div>
      ${data.summary.errors ? `<div class="stat warn"><span class="stat-val">${data.summary.errors}</span><span class="stat-lbl">Viga</span></div>` : ''}
    `;

    const rows = data.groups.flatMap((g) => g.rows.map((r) => ({ ...r, groupTitle: g.title })));
    body.innerHTML = rows.map((r) => {
      if (r.error) {
        return `<tr class="row-error"><td>${r.symbol}</td><td>${r.label || '—'}</td><td colspan="4">${r.error}</td></tr>`;
      }
      return `
        <tr class="row-${r.strategyStatus}">
          <td><strong>${r.symbol}</strong></td>
          <td>${r.label || r.name}${r.groupTitle === 'MVO asenduskandidaadid' ? ' <span class="tag">kandidaat</span>' : ''}${r.isRoyaltyTrust ? ' <span class="tag danger">trust</span>' : ''}</td>
          <td>${r.dividendYield != null ? r.dividendYield + '%' : '—'}</td>
          <td>${r.exDividendDateFmt || '—'}${r.daysUntilEx != null && r.daysUntilEx >= 0 ? ` <small>(${r.daysUntilEx}p)</small>` : ''}</td>
          <td><span class="badge ${r.strategyStatus}">${statusLabel(r.strategyStatus)}</span></td>
          <td><button type="button" class="link-btn" data-analyze="${r.symbol}">→</button></td>
        </tr>
      `;
    }).join('');

    wrap.classList.remove('hidden');
    body.querySelectorAll('[data-analyze]').forEach((btn) => {
      btn.addEventListener('click', () => {
        symbolInput.value = btn.dataset.analyze;
        switchView('analyze');
        form.requestSubmit();
      });
    });

    portfolioLoaded = true;
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
    summary.classList.add('hidden');
    wrap.classList.add('hidden');
  } finally {
    loading.classList.add('hidden');
  }
}

const hash = location.hash.replace('#', '');
if (hash && views[hash]) switchView(hash);

const params = new URLSearchParams(location.search);
if (params.get('symbol')) {
  symbolInput.value = params.get('symbol');
  switchView('analyze');
  form.requestSubmit();
}
