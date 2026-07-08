/** Portfell + MVO asenduskandidaadid (Yahoo Finance tickerid) */
export const PORTFOLIO = [
  { symbol: 'AAT', label: 'American Assets Trust', group: 'portfell' },
  { symbol: 'ACCO', label: 'ACCO Brands', group: 'portfell' },
  { symbol: 'SIRI', label: 'Sirius XM', group: 'portfell' },
  { symbol: 'MDV', label: 'Modiv', group: 'portfell' },
  { symbol: 'PUM.DE', label: 'Puma', group: 'portfell' },
  { symbol: 'IDVY.DE', label: 'iShares Euro Dividend ETF', group: 'portfell' },
  { symbol: 'FOUR.L', label: '4imprint Group', group: 'portfell' },
  { symbol: 'SEDY.L', label: 'iShares EM Dividend ETF', group: 'portfell' },
  { symbol: 'MVO', label: 'MV Oil Trust ⚠️', group: 'portfell' },
  { symbol: 'CPA1T.TL', label: 'Coop Pank', group: 'portfell' },
  { symbol: 'VOW3.DE', label: 'Volkswagen', group: 'portfell' },
  { symbol: 'NOG', label: 'Northern Oil & Gas', group: 'portfell' },
  { symbol: 'SMSI', label: 'Smith Micro Software', group: 'portfell' },
  { symbol: 'LIGHT.AS', label: 'Signify', group: 'portfell' },
  { symbol: 'ENOG.L', label: 'Energean', group: 'portfell' },
  { symbol: 'WPP.L', label: 'WPP', group: 'portfell' },
  { symbol: 'PTEC.L', label: 'Playtech', group: 'portfell' },
  { symbol: 'VCT.L', label: 'Victrex', group: 'portfell' },
  { symbol: 'TVE1T.TL', label: 'Tallinna Vesi', group: 'portfell' },
  { symbol: 'TKM1T.TL', label: 'TKM Grupp', group: 'portfell' },
  { symbol: 'HBR.L', label: 'Harbour Energy', group: 'portfell' },
  { symbol: 'GPC', label: 'Genuine Parts', group: 'portfell' },
];

export const CANDIDATES = [
  { symbol: 'VZ', label: 'Verizon', group: 'kandidaat', note: 'Ex ~10. juuli' },
  { symbol: 'GIS', label: 'General Mills', group: 'kandidaat', note: 'Ex ~10. juuli' },
  { symbol: 'PFE', label: 'Pfizer', group: 'kandidaat', note: 'Ex ~24. juuli' },
  { symbol: 'BTI', label: 'British American Tobacco', group: 'kandidaat', note: 'Ex ~10. juuli' },
  { symbol: 'T', label: 'AT&T', group: 'kandidaat', note: 'Ex ~10. juuli' },
  { symbol: 'LTC', label: 'LTC Properties', group: 'kandidaat', note: 'Ex ~23. juuli' },
  { symbol: 'O', label: 'Realty Income', group: 'kandidaat', note: 'Ex ~3. august' },
];

export const ROYALTY_TRUSTS = new Set(['MVO', 'VOC', 'NRT', 'CRT', 'PBT', 'SBR', 'BPT', 'MTR']);

export const MIN_YIELD_PCT = 5;

export const WATCHLIST = [...PORTFOLIO, ...CANDIDATES];
