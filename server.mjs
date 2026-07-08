import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import {
  WATCHLIST,
  ROYALTY_TRUSTS,
  MIN_YIELD_PCT,
  PORTFOLIO,
  CANDIDATES,
} from './data/watchlist.mjs';
import {
  resolveSymbol,
  aliasHint,
  buildAliasMapFromWatchlist,
} from './data/ticker-aliases.mjs';

const ALIAS_MAP = buildAliasMapFromWatchlist(WATCHLIST);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function fmtPct(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return null;
  return +(v * 100).toFixed(digits);
}

function fmtNum(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return null;
  return +Number(v).toFixed(digits);
}

function fmtDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('et-EE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Suur number → lühivorm (nt 1.48 mld, 337 mln). */
function fmtBig(v) {
  if (v == null || Number.isNaN(v)) return null;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} mld`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)} mln`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} tuh`;
  return `${sign}${abs.toFixed(0)}`;
}

function tsYear(row) {
  const d = row?.date instanceof Date ? row.date : new Date(row?.date);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function daysUntil(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dt);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function annualDividends(dividendsMap) {
  const byYear = {};
  for (const entry of Object.values(dividendsMap)) {
    const date = entry?.date instanceof Date ? entry.date : new Date(entry?.date);
    if (Number.isNaN(date.getTime())) continue;
    const year = date.getFullYear();
    byYear[year] = (byYear[year] || 0) + (entry.amount || 0);
  }
  return Object.entries(byYear)
    .map(([year, total]) => ({ year: Number(year), total: +total.toFixed(4) }))
    .sort((a, b) => a.year - b.year);
}

function cagr(start, end, years) {
  if (!start || !end || start <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function check({ id, title, status, message, detail }) {
  return { id, title, status, message, detail: detail || null };
}

function baseSymbol(symbol) {
  return symbol.split('.')[0].toUpperCase();
}

function analyzeStrategyYield(yieldPct) {
  if (yieldPct == null) {
    return check({
      id: 'strategy-yield',
      title: `Sinu strateegia (≥${MIN_YIELD_PCT}%)`,
      status: 'info',
      message: 'Dividenditootlust ei saanud arvutada.',
    });
  }
  if (yieldPct >= MIN_YIELD_PCT) {
    return check({
      id: 'strategy-yield',
      title: `Sinu strateegia (≥${MIN_YIELD_PCT}%)`,
      status: 'pass',
      message: `Tootlus ${yieldPct}% — vastab sinu ≥${MIN_YIELD_PCT}% eesmärgile.`,
    });
  }
  if (yieldPct >= 3) {
    return check({
      id: 'strategy-yield',
      title: `Sinu strateegia (≥${MIN_YIELD_PCT}%)`,
      status: 'warn',
      message: `Tootlus ${yieldPct}% — alla sinu ${MIN_YIELD_PCT}% eesmärgi, aga dividend on olemas.`,
    });
  }
  return check({
    id: 'strategy-yield',
    title: `Sinu strateegia (≥${MIN_YIELD_PCT}%)`,
    status: 'fail',
    message: `Tootlus ${yieldPct}% — ei vasta sinu dividendistrateegiale.`,
  });
}

function analyzeRoyaltyTrust(symbol) {
  const base = baseSymbol(symbol);
  if (!ROYALTY_TRUSTS.has(base)) return null;
  return check({
    id: 'royalty-trust',
    title: 'Royalty trust / lõplik eluiga',
    status: 'fail',
    message: `${base} on royalty trust — dividend on ajutine, väärtus võib nulli minna (nagu MVO).`,
    detail: 'Vältida pikaajalise dividendi strateegias. Müü enne likvideerimist.',
  });
}

function analyzeDividends(annual, summary, calendar, symbol) {
  const checks = [];
  const years = annual.length;
  const latest = annual.at(-1);
  const first = annual[0];

  const royalty = analyzeRoyaltyTrust(symbol);
  if (royalty) checks.push(royalty);

  const yieldRaw = summary?.dividendYield ?? summary?.trailingAnnualDividendYield ?? null;
  const yieldPct = fmtPct(yieldRaw);
  checks.push(analyzeStrategyYield(yieldPct));

  if (years === 0) {
    checks.push(check({
      id: 'no-dividend',
      title: 'Dividendimaksed',
      status: 'fail',
      message: 'Dividendimakseid ei leitud viimase 10 aasta jooksul.',
      detail: 'See ettevõte ei pruugi maksta dividendi või Yahoo Finance’il puuduvad andmed.',
    }));
    return checks;
  }

  checks.push(check({
    id: 'dividend-history',
    title: 'Dividendi ajalugu',
    status: years >= 5 ? 'pass' : years >= 3 ? 'warn' : 'fail',
    message: years >= 5
      ? `Dividend on makstud vähemalt ${years} aastat (${first?.year}–${latest?.year}).`
      : years >= 3
        ? `Lühike ajalugu: ${years} aastat dividendimakseid.`
        : `Väga lühike ajalugu: ainult ${years} aastat.`,
    detail: `Viimane täisaasta: ${latest?.year} — ${latest?.total.toFixed(2)} / aktsia.`,
  }));

  let cuts = 0;
  for (let i = 1; i < annual.length; i++) {
    if (annual[i].total < annual[i - 1].total * 0.95) cuts++;
  }

  checks.push(check({
    id: 'dividend-cuts',
    title: 'Dividendi kärped',
    status: cuts === 0 ? 'pass' : cuts === 1 ? 'warn' : 'fail',
    message: cuts === 0
      ? 'Viimase perioodi jooksul ei ole dividendi olulist langust märgitud.'
      : `${cuts} aastat, mil dividend langes üle 5% võrra eelmise aasta suhtes.`,
    detail: cuts > 0 ? 'Kärbe võib viidata äriraskustele — vaata põhjuseid.' : null,
  }));

  const window5 = annual.slice(-6);
  if (window5.length >= 2) {
    const start = window5[0].total;
    const end = window5.at(-1).total;
    const growth = cagr(start, end, window5.length - 1);
    const gPct = fmtPct(growth);

    checks.push(check({
      id: 'dividend-growth',
      title: 'Dividendi kasv (5 a)',
      status: growth == null ? 'info' : growth >= 0.03 ? 'pass' : growth >= 0 ? 'warn' : 'fail',
      message: growth == null
        ? 'Kasvu arvutamiseks pole piisavalt andmeid.'
        : growth >= 0.03
          ? `Dividend on kasvanud ~${gPct}% aastas (5 a keskmine).`
          : growth >= 0
            ? `Kasv on nõrk: ~${gPct}% aastas.`
            : `Dividend on kahanenud ~${Math.abs(gPct)}% aastas.`,
    }));
  }

  checks.push(check({
    id: 'dividend-yield',
    title: 'Dividenditootlus (üldine)',
    status: yieldPct == null ? 'info' : yieldPct > 10 ? 'fail' : yieldPct > 8 ? 'warn' : yieldPct >= 1.5 ? 'pass' : 'warn',
    message: yieldPct == null
      ? 'Dividenditootlust ei saanud arvutada.'
      : yieldPct > 10
        ? `Väga kõrge tootlus ${yieldPct}% — sageli lõks (royalty trust, BDC, kärbe tulemas).`
        : yieldPct > 8
          ? `Kõrge tootlus ${yieldPct}% — kontrolli jätkusuutlikkust.`
          : yieldPct >= 1.5
            ? `Praegune tootlus ~${yieldPct}%.`
            : `Madal tootlus ${yieldPct}%.`,
    detail: summary?.trailingAnnualDividendRate != null
      ? `Aastane dividend: ${fmtNum(summary.trailingAnnualDividendRate)} ${summary?.currency || ''} / aktsia.`
      : null,
  }));

  const payout = fmtPct(summary?.payoutRatio);
  checks.push(check({
    id: 'payout-ratio',
    title: 'Väljamakse suhe (payout ratio)',
    status: payout == null ? 'info' : payout > 100 ? 'fail' : payout > 85 ? 'warn' : payout >= 30 ? 'pass' : 'info',
    message: payout == null
      ? 'Payout ratio andmed puuduvad.'
      : payout > 100
        ? `Dividend ületab kasumi (${payout}%) — jätkusuutlikkus küsitav.`
        : payout > 85
          ? `Kõrge payout ${payout}% — vähe puhverit halvemateks aastateks.`
          : payout >= 30
            ? `Mõistlik payout ~${payout}%.`
            : `Madal payout ${payout}% — ettevõte reinvesteerib rohkem kasumit.`,
  }));

  const exDiv = calendar?.exDividendDate;
  const payDate = calendar?.dividendDate;
  const exDays = daysUntil(exDiv);
  checks.push(check({
    id: 'dividend-dates',
    title: 'Dividendi kuupäevad',
    status: exDays != null && exDays >= 0 && exDays <= 7 ? 'warn' : 'info',
    message: exDiv || payDate
      ? `Ex-dividendi päev: ${fmtDate(exDiv) || '—'}${exDays != null && exDays >= 0 ? ` (${exDays} p)` : ''} · Makse: ${fmtDate(payDate) || '—'}`
      : 'Järgmise dividendi kuupäevad pole Yahoo andmetel saadaval.',
    detail: exDays != null && exDays >= 0 && exDays <= 2
      ? 'Osta täna või homme, kui soovid järgmist dividendi saada.'
      : 'Ex-kuupäeval ostes järgmist dividendi ei saa.',
  }));

  return checks;
}

function analyzeFundamentals(summary, financial) {
  const checks = [];

  const pe = fmtNum(summary?.trailingPE);
  checks.push(check({
    id: 'pe-ratio',
    title: 'P/E (hind/kasum)',
    status: pe == null ? 'info' : pe > 35 ? 'warn' : pe >= 8 ? 'pass' : 'info',
    message: pe == null ? 'P/E andmed puuduvad.' : pe > 35 ? `Kõrge P/E ${pe}.` : `P/E ~${pe}.`,
  }));

  const debt = fmtNum(financial?.debtToEquity);
  checks.push(check({
    id: 'debt-equity',
    title: 'Võlg / omakapital',
    status: debt == null ? 'info' : debt > 150 ? 'warn' : debt <= 100 ? 'pass' : 'info',
    message: debt == null ? 'Võlaandmed puuduvad.' : debt > 150 ? `Suhteliselt kõrge võlg (${debt}%).` : `Võlg/omakapital ~${debt}%.`,
  }));

  const roe = fmtPct(financial?.returnOnEquity);
  checks.push(check({
    id: 'roe',
    title: 'ROE (omakapitali tootlus)',
    status: roe == null ? 'info' : roe >= 0.12 ? 'pass' : roe >= 0.05 ? 'warn' : 'fail',
    message: roe == null ? 'ROE andmed puuduvad.' : roe >= 0.12 ? `Hea ROE ~${roe}%.` : roe >= 0.05 ? `Keskmine ROE ~${roe}%.` : `Nõrk ROE ~${roe}%.`,
  }));

  const margin = fmtPct(financial?.profitMargins);
  checks.push(check({
    id: 'profit-margin',
    title: 'Kasumimarginaal',
    status: margin == null ? 'info' : margin >= 0.1 ? 'pass' : margin >= 0 ? 'warn' : 'fail',
    message: margin == null ? 'Kasumimarginaali andmed puuduvad.' : margin >= 0.1 ? `Kasumimarginaal ~${margin}%.` : margin >= 0 ? `Madalam marginaal ~${margin}%.` : `Negatiivne kasumimarginaal (${margin}%).`,
  }));

  return checks;
}

function overallVerdict(checks) {
  const score = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) if (score[c.status] != null) score[c.status]++;

  if (checks.some((c) => c.id === 'royalty-trust')) {
    return { level: 'fail', title: 'Vältida', text: 'Royalty trust — ei sobi pikaajalise dividendi strateegiasse.' };
  }
  if (score.fail >= 2) {
    return { level: 'fail', title: 'Ettevaatlik', text: 'Mitu punast lippu — uuri põhjalikumalt enne otsust.' };
  }
  if (score.fail === 1 || score.warn >= 3) {
    return { level: 'warn', title: 'Keskmine sobivus', text: 'Mõned hoiatused — dividend võib sobida, kuid riskid on olemas.' };
  }
  if (score.pass >= 4) {
    return { level: 'pass', title: 'Hea kandidaat', text: 'Põhinäitajad näevad dividendi jaoks üsna terved välja.' };
  }
  return { level: 'info', title: 'Piiratud andmed', text: 'Kontrolli tulemused on osaliselt — vaata ametlikke aruandeid.' };
}

function yieldStatus(yieldPct) {
  if (yieldPct == null) return 'unknown';
  if (yieldPct >= MIN_YIELD_PCT) return 'pass';
  if (yieldPct >= 3) return 'warn';
  return 'fail';
}

async function fetchQuoteLite(symbolInput) {
  const { symbol } = resolveSymbol(symbolInput, ALIAS_MAP);
  const summaryResult = await yahooFinance.quoteSummary(symbol, {
    modules: ['price', 'summaryDetail', 'calendarEvents'],
  });
  const price = summaryResult.price;
  const summary = summaryResult.summaryDetail;
  const calendar = summaryResult.calendarEvents;
  const marketPrice = price?.regularMarketPrice ?? price?.regularMarketPreviousClose;
  let yieldPct = fmtPct(summary?.dividendYield ?? summary?.trailingAnnualDividendYield);
  const annualDiv = summary?.trailingAnnualDividendRate;
  if (yieldPct == null && annualDiv != null && marketPrice > 0) {
    yieldPct = fmtPct(annualDiv / marketPrice);
  }
  const exDate = calendar?.exDividendDate || null;

  return {
    symbol,
    name: price?.longName || price?.shortName || symbol,
    currency: price?.currency,
    price: fmtNum(price?.regularMarketPrice ?? price?.regularMarketPreviousClose),
    dividendYield: yieldPct,
    annualDividend: fmtNum(summary?.trailingAnnualDividendRate),
    exDividendDate: exDate ? exDate.toISOString() : null,
    exDividendDateFmt: fmtDate(exDate),
    daysUntilEx: daysUntil(exDate),
    isRoyaltyTrust: ROYALTY_TRUSTS.has(baseSymbol(symbol)),
    strategyStatus: ROYALTY_TRUSTS.has(baseSymbol(symbol)) ? 'fail' : yieldStatus(yieldPct),
  };
}

async function fetchFundamentals(ticker) {
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 6);
  let rows;
  try {
    rows = await yahooFinance.fundamentalsTimeSeries(ticker, {
      period1,
      type: 'annual',
      module: 'all',
    });
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  return rows
    .map((r) => {
      const year = tsYear(r);
      if (year == null) return null;
      const debt = r.totalDebt ?? null;
      const cash = r.cashAndCashEquivalents ?? null;
      const equity = r.stockholdersEquity ?? null;
      const fcf = r.freeCashFlow ?? null;
      const netIncome = r.netIncome ?? null;
      const netDebt = debt != null && cash != null ? debt - cash : null;
      const roe = netIncome != null && equity ? netIncome / equity : null;
      return { year, debt, cash, netDebt, equity, freeCashFlow: fcf, netIncome, roe };
    })
    .filter((r) => r && (r.debt != null || r.equity != null || r.freeCashFlow != null || r.netIncome != null))
    .sort((a, b) => b.year - a.year)
    .slice(0, 4);
}

async function analyzeStock(symbolInput) {
  const { symbol: ticker, resolvedFrom } = resolveSymbol(symbolInput, ALIAS_MAP);
  if (!ticker) throw new Error('Sisesta aktsia ticker.');

  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  let summaryResult;
  let chartResult;
  let fundamentals = [];
  try {
    [summaryResult, chartResult, fundamentals] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ['price', 'summaryDetail', 'calendarEvents', 'financialData', 'defaultKeyStatistics'],
      }),
      yahooFinance.chart(ticker, {
        period1: tenYearsAgo,
        events: 'div',
      }).catch(() => ({ events: { dividends: {} } })),
      fetchFundamentals(ticker).catch(() => []),
    ]);
  } catch (err) {
    const hint = aliasHint(symbolInput);
    const msg = err.message?.includes('not found') || err.message?.includes('Not Found')
      ? `Aktsiat "${symbolInput.trim().toUpperCase()}" ei leitud.${hint ? ` ${hint}` : ''}`
      : (err.message || 'Analüüs ebaõnnestus.');
    throw new Error(msg);
  }

  const price = summaryResult.price;
  const summary = summaryResult.summaryDetail;
  const calendar = summaryResult.calendarEvents;
  const financial = summaryResult.financialData;

  if (!price?.shortName && !price?.longName) {
    const hint = aliasHint(symbolInput);
    throw new Error(`Aktsiat "${symbolInput.trim().toUpperCase()}" ei leitud.${hint ? ` ${hint}` : ''}`);
  }

  const finCurrency = financial?.financialCurrency || price?.financialCurrency || price?.currency || '';
  const financialYears = fundamentals.map((r) => ({
    year: r.year,
    netDebt: r.netDebt != null ? fmtBig(r.netDebt) : null,
    netDebtRaw: r.netDebt,
    debt: r.debt != null ? fmtBig(r.debt) : null,
    equity: r.equity != null ? fmtBig(r.equity) : null,
    freeCashFlow: r.freeCashFlow != null ? fmtBig(r.freeCashFlow) : null,
    freeCashFlowRaw: r.freeCashFlow,
    netIncome: r.netIncome != null ? fmtBig(r.netIncome) : null,
    netIncomeRaw: r.netIncome,
    roe: r.roe != null ? fmtPct(r.roe) : null,
  }));

  const dividends = chartResult.events?.dividends || {};
  const annual = annualDividends(dividends);
  const marketPrice = price.regularMarketPrice ?? price.regularMarketPreviousClose;
  const annualDiv = summary?.trailingAnnualDividendRate;
  let dividendYieldRaw = summary?.dividendYield ?? summary?.trailingAnnualDividendYield;
  if (dividendYieldRaw == null && annualDiv != null && marketPrice > 0) {
    dividendYieldRaw = annualDiv / marketPrice;
  }
  const divChecks = analyzeDividends(
    annual,
    { ...summary, dividendYield: dividendYieldRaw, currency: price.currency },
    calendar,
    ticker,
  );
  const fundChecks = analyzeFundamentals(summary, financial);
  const checks = [...divChecks, ...fundChecks];
  const verdict = overallVerdict(checks);

  return {
    symbol: ticker,
    resolvedFrom,
    name: price.longName || price.shortName,
    currency: price.currency,
    exchange: price.exchangeName,
    price: fmtNum(marketPrice),
    marketCap: summary?.marketCap ?? null,
    dividendYield: fmtPct(dividendYieldRaw),
    annualDividend: fmtNum(annualDiv),
    exDividendDate: calendar?.exDividendDate ? calendar.exDividendDate.toISOString() : null,
    exDividendDateFmt: fmtDate(calendar?.exDividendDate),
    daysUntilEx: daysUntil(calendar?.exDividendDate),
    checks,
    verdict,
    annualDividends: annual,
    financialCurrency: finCurrency,
    financialYears,
    meta: {
      source: 'Yahoo Finance',
      minYieldPct: MIN_YIELD_PCT,
      disclaimer: 'Tarbijainfo, mitte investeerimisnõuanne. Andmed võivad olla ebatäpsed või puudulikud.',
    },
  };
}

async function mapWithConcurrency(items, fn, limit = 4) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function searchLocal(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const seen = new Set();
  const items = [];

  function add(item) {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }

  for (const [alias, symbol] of Object.entries(ALIAS_MAP)) {
    if (!alias.toLowerCase().includes(q) && !symbol.toLowerCase().includes(q)) continue;
    const watch = WATCHLIST.find((w) => w.symbol === symbol);
    add({
      symbol,
      name: watch?.label || alias,
      exchange: 'Portfell',
      source: 'local',
    });
  }

  for (const item of WATCHLIST) {
    const base = item.symbol.split('.')[0].toLowerCase();
    if (
      item.symbol.toLowerCase().includes(q)
      || item.label.toLowerCase().includes(q)
      || base.includes(q)
    ) {
      add({
        symbol: item.symbol,
        name: item.label,
        exchange: 'Portfell',
        source: 'local',
      });
    }
  }

  return items;
}

async function searchSymbols(query) {
  const q = query.trim();
  if (q.length < 2) return [];

  const local = searchLocal(q);
  let remote = [];

  try {
    const result = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 });
    remote = (result.quotes || [])
      .filter((row) => row.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(row.quoteType))
      .map((row) => ({
        symbol: row.symbol,
        name: row.shortname || row.longname || row.symbol,
        exchange: row.exchDisp || row.exchange || '',
        source: 'yahoo',
      }));
  } catch {
    remote = [];
  }

  const seen = new Set();
  const merged = [];

  for (const item of [...local, ...remote]) {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }

  return merged;
}

app.get('/api/search', async (req, res) => {
  try {
    const items = await searchSymbols(req.query.q || '');
    res.json({ items });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Otsing ebaõnnestus.', items: [] });
  }
});

app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const data = await analyzeStock(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Analüüs ebaõnnestus.' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const data = await analyzeStock(req.body?.symbol || '');
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Analüüs ebaõnnestus.' });
  }
});

app.get('/api/calendar', async (req, res) => {
  try {
    const days = Number(req.query.days) || 45;
    const rows = await mapWithConcurrency(WATCHLIST, async (item) => {
      const data = await fetchQuoteLite(item.symbol);
      return { ...item, ...data };
    });

    const upcoming = rows
      .filter((r) => !r.error && r.exDividendDate && r.daysUntilEx != null && r.daysUntilEx >= 0 && r.daysUntilEx <= days)
      .sort((a, b) => a.daysUntilEx - b.daysUntilEx);

    res.json({
      days,
      minYieldPct: MIN_YIELD_PCT,
      updated: new Date().toISOString(),
      items: upcoming,
      errors: rows.filter((r) => r.error).map((r) => ({ symbol: r.symbol, error: r.error })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Kalender ebaõnnestus.' });
  }
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const groups = [
      { id: 'portfell', title: 'Sinu portfell', items: PORTFOLIO },
      { id: 'kandidaadid', title: 'MVO asenduskandidaadid', items: CANDIDATES },
    ];

    const allItems = [...PORTFOLIO, ...CANDIDATES];
    const rows = await mapWithConcurrency(allItems, async (item) => {
      const data = await fetchQuoteLite(item.symbol);
      return { ...item, ...data };
    });

    const ok = rows.filter((r) => !r.error);
    const meetsStrategy = ok.filter((r) => r.strategyStatus === 'pass').length;
    const belowStrategy = ok.filter((r) => r.strategyStatus === 'warn' || r.strategyStatus === 'fail').length;

    res.json({
      minYieldPct: MIN_YIELD_PCT,
      updated: new Date().toISOString(),
      summary: {
        total: allItems.length,
        scanned: ok.length,
        meetsStrategy,
        belowStrategy,
        errors: rows.filter((r) => r.error).length,
      },
      groups: groups.map((g) => ({
        ...g,
        rows: rows.filter((r) => g.items.some((i) => i.symbol === r.symbol)),
      })),
      errors: rows.filter((r) => r.error).map((r) => ({ symbol: r.symbol, label: r.label, error: r.error })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Portfelli skaneerimine ebaõnnestus.' });
  }
});

app.get('/api/watchlist', (_req, res) => {
  res.json({ portfolio: PORTFOLIO, candidates: CANDIDATES, minYieldPct: MIN_YIELD_PCT });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dividendi-kontroll' });
});

const PORT = process.env.PORT || 3847;
const HOST = process.env.HOST || '0.0.0.0';

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`Dividendi kontroll: http://${HOST}:${PORT}`);
  });
}
