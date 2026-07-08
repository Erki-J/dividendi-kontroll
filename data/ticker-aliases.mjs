/**
 * Lightyear / kohalik ticker → Yahoo Finance symbol.
 * Yahoo nõuab börsi sufiksit (.AS, .L, .TL, .DE jne).
 */
export const TICKER_ALIASES = {
  LIGHT: 'LIGHT.AS',
  SIGNIFY: 'LIGHT.AS',
  CPA1T: 'CPA1T.TL',
  COOP: 'CPA1T.TL',
  TVE1T: 'TVE1T.TL',
  TKM1T: 'TKM1T.TL',
  VOW: 'VOW3.DE',
  VW: 'VOW3.DE',
  VOLKSWAGEN: 'VOW3.DE',
  PUM: 'PUM.DE',
  PUMA: 'PUM.DE',
  IDVY: 'IDVY.DE',
  SEDY: 'SEDY.L',
  FOUR: 'FOUR.L',
  ENOG: 'ENOG.L',
  WPP: 'WPP.L',
  PTEC: 'PTEC.L',
  PLAYTECH: 'PTEC.L',
  VCT: 'VCT.L',
  VICTREX: 'VCT.L',
  HBR: 'HBR.L',
  SAMPO: 'SAMPO.HE',
};

/** Lühike → Yahoo map portfelli positsioonide jaoks */
export function buildAliasMapFromWatchlist(watchlist) {
  const map = { ...TICKER_ALIASES };
  for (const item of watchlist) {
    const base = item.symbol.split('.')[0].toUpperCase();
    if (base !== item.symbol) map[base] = item.symbol;
  }
  return map;
}

export function resolveSymbol(input, aliasMap = TICKER_ALIASES) {
  const raw = input.trim().toUpperCase();
  if (!raw) return { symbol: '', resolvedFrom: null };

  if (aliasMap[raw]) {
    return { symbol: aliasMap[raw], resolvedFrom: raw };
  }

  return { symbol: raw, resolvedFrom: null };
}

export function aliasHint(input) {
  const raw = input.trim().toUpperCase();
  const resolved = TICKER_ALIASES[raw];
  if (resolved) return `Kasuta Yahoo tickeri koodi: ${resolved}`;
  if (!raw.includes('.')) {
    return 'Euroopa/Eesti aktsiate puhul lisa börsi sufiks (nt LIGHT.AS, CPA1T.TL, SEDY.L).';
  }
  return null;
}
