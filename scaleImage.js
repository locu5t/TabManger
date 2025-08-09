
/**
 * Down‑scales large images to a maximum pixel dimension (default 480 px) and
 * returns a Base64 data‑URL. If the image is already small it returns the
 * original URL unchanged.
 */
export async function scaleImage(src, maxPx = 480) {
  try {
    const blob  = await fetch(src, { mode: 'cors' }).then(r => r.blob());
    const bmp   = await createImageBitmap(blob);
    const { width, height } = bmp;
    if (Math.max(width, height) <= maxPx) return src;

    const scale  = maxPx / Math.max(width, height);
    const w = Math.round(width  * scale);
    const h = Math.round(height * scale);

    const canvas = new OffscreenCanvas(w, h);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);

    const downBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(downBlob);
    });
  } catch(e){
    console.warn('scaleImage failed', e);
    return src; // fallback: return original
  }
}
