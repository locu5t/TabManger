// --- icons.js ---

const SvgIcons = {
  /**
   * Generates an SVG placeholder icon (e.g., a simple globe or generic document).
   * @param {object} [attrs={}] Optional attributes (width, height, class, etc.)
   * @returns {string} SVG markup string
   */
  placeholder: (attrs = {}) => {
    const { width = 16, height = 16, fill = '#888', className = '' } = attrs;
    // Simple document icon SVG
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}" fill="${fill}" class="${className}" aria-hidden="true">
        <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>
    `;
  },

  /**
   * Generates an SVG star icon (filled or empty).
   * @param {boolean} isFavorite True for filled star, false for outline.
   * @param {object} [attrs={}] Optional attributes (width, height, class, etc.)
   * @returns {string} SVG markup string
   */
  star: (isFavorite, attrs = {}) => {
     const { width = 18, height = 18, className = '', strokeWidth = 1.5 } = attrs;
     const fill = isFavorite ? '#ffc107' : 'none';
     const stroke = isFavorite ? '#ffc107' : '#aaa';
     // Star SVG Path
     return `
       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">
         <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
       </svg>
     `;
  },

 /**
   * Generates an SVG 'X' (close/delete) icon.
   * @param {object} [attrs={}] Optional attributes (width, height, class, etc.)
   * @returns {string} SVG markup string
   */
  close: (attrs = {}) => {
    const { width = 16, height = 16, stroke = 'currentColor', strokeWidth = 2, className = '' } = attrs;
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  }
};

// Make it globally accessible
window.SvgIcons = SvgIcons;
