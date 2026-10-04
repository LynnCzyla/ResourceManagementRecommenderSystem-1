// src/config/currency.js
// Keep this list in sync with backend/utils/currency.js
export const CURRENCIES = [
    { code: 'PHP', name: 'Philippine Peso' },
    { code: 'SGD', name: 'Singapore Dollar' },
    { code: 'THB', name: 'Thai Baht' },
    { code: 'IDR', name: 'Indonesian Rupiah' },
    { code: 'MYR', name: 'Malaysian Ringgit' },
    { code: 'VND', name: 'Vietnamese Dong' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'AUD', name: 'Australian Dollar' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'HKD', name: 'Hong Kong Dollar' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'AED', name: 'UAE Dirham' },
  ];
  
  export const DEFAULT_CURRENCY = 'PHP';
  
  // "PHP" -> "₱", "SGD" -> "SGD", "THB" -> "THB" (whatever Intl shows for that currency)
  export const currencySymbol = (code) => {
    const c = code || DEFAULT_CURRENCY;
    try {
      const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).formatToParts(0);
      return parts.find((p) => p.type === 'currency')?.value || c;
    } catch {
      return c;
    }
  };
  
  // formatMoney(50000, 'PHP') -> "₱50,000"
  export const formatMoney = (amount, code) => {
    const c = code || DEFAULT_CURRENCY;
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(safe);
    } catch {
      return `${c} ${safe.toLocaleString()}`;
    }
  };