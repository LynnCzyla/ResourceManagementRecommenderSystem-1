// main/src/utils/numberInput.js
// Use on <input type="number" /> so users can't type a minus sign or exponent.
export const blockInvalidNumberKeys = (e) => {
    if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
  };
  