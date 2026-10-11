// Shrinks an uploaded photo before it is stored (images live in the
// database as data URLs): scaled to fit maxSize px on the long side and
// re-encoded as WebP, or JPEG where the browser can't encode WebP.
// A 6 MB phone photo typically ends up around 200–400 KB.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    img.src = url;
  });
}

export async function compressImage(file, { maxSize = 1920, quality = 0.82 } = {}) {
  if (!file?.type?.startsWith("image/")) throw new Error("Please choose an image file");
  // Animated or vector images are kept as they are.
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  const img = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const webp = canvas.toDataURL("image/webp", quality);
  // Browsers without a WebP encoder silently return PNG instead.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

// Approximate stored size, for the admin hint.
export function dataUrlKb(dataUrl) {
  if (!dataUrl?.startsWith("data:")) return null;
  return Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4 / 1024);
}
