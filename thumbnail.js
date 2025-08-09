
/**
 * Smart thumbnail heuristic.
 * Attempts OG/Twitter, <link rel=image_src>, hero image, YouTube embed, favicon.
 * If a CSS selector is provided it is tested first.
 */
export async function smartThumbnail(pageUrl, faviconUrl = null, selector = null) {
  // Helper to resolve relative URLs
  const toAbs = (src) => new URL(src, pageUrl).href;

  // 0. selector override first
  if (selector) {
    const selMatch = await fetchAndMatchSelector(pageUrl, selector);
    if (selMatch) return selMatch;
  }

  let html;
  try {
    html = await fetch(pageUrl, { mode: 'cors' }).then(r => r.text());
  } catch (e) {
    console.warn('CORS blocked, smartThumbnail falling back to favicon.');
    return faviconUrl || null;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1. OG / Twitter card
  const og = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
  if (og?.content) return toAbs(og.content);

  // 2. <link rel="image_src">
  const ln = doc.querySelector('link[rel~="image_src" i]');
  if (ln?.href) return toAbs(ln.href);

  // 3. Hero image
  const hero = [...doc.images]
      .filter(i => i.naturalWidth * i.naturalHeight > 10000)
      .sort((a,b)=> b.naturalWidth*b.naturalHeight - a.naturalWidth*a.naturalHeight)[0];
  if (hero?.src && /\.(webp|jpe?g|png|gif)$/i.test(hero.src)) return toAbs(hero.src);

  // 4. YouTube embed
  const frame = doc.querySelector('iframe[src*="youtube.com"], iframe[src*="youtu.be"]');
  if (frame) {
     const id = (frame.src.match(/(?:embed\/|v=)([A-Za-z0-9_-]{11})/)||[])[1];
     if (id) return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }

  // 5. Favicon fallback
  return faviconUrl || null;
}

async function fetchAndMatchSelector(pageUrl, selector) {
  try {
    const html = await fetch(pageUrl, { mode: 'cors' }).then(r => r.text());
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const el   = doc.querySelector(selector);
    if (el?.src) {
      const ok = /\.(webp|jpe?g|png|gif)(\?|#|$)/i.test(el.src);
      if (ok) return new URL(el.src, pageUrl).href;
    }
  } catch(e){ console.warn(e);}
  return null;
}


// Exposed helper: tries selector only, otherwise null
export async function selectorThumbnail(pageUrl, selector){
  if (!selector) return null;
  return await fetchAndMatchSelector(pageUrl, selector);
}
