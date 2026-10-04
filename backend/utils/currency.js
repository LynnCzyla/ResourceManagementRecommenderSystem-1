// backend/utils/currency.js
const SUPPORTED_CURRENCIES = [
    'PHP', 'SGD', 'THB', 'IDR', 'MYR', 'VND', 'USD', 'EUR', 'GBP',
    'AUD', 'JPY', 'HKD', 'INR', 'AED',
  ];
  const DEFAULT_CURRENCY = 'PHP';
  
  // Returns a valid uppercase code, or null when the input is not supported.
  function resolveCurrency(input, fallback = null) {
    if (input === undefined || input === null || input === '') return fallback;
    const code = String(input).trim().toUpperCase();
    return SUPPORTED_CURRENCIES.includes(code) ? code : null;
  }
  
  function formatMoney(amount, code = DEFAULT_CURRENCY) {
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: resolveCurrency(code, DEFAULT_CURRENCY) || DEFAULT_CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(safe);
    } catch {
      return `${code} ${safe.toLocaleString()}`;
    }
  }
  
  module.exports = { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, resolveCurrency, formatMoney };