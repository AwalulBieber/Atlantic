import React, { useEffect, useState } from 'react';

export default function AtlanticImageCropper({ file, onCancel, onApply, busy = false, title = 'Sesuaikan foto' }) {
  const [source, setSource] = useState('');
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) { setSource(''); return undefined; }
    const url = URL.createObjectURL(file);
    setSource(url);
    setZoom(1);
    setX(50);
    setY(50);
    setError('');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function applyCrop() {
    if (!source || busy) return;
    setError('');
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const size = 640;
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const left = (size - width) * (x / 100);
      const top = (size - height) * (y / 100);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Browser tidak mendukung pemotongan foto.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, left, top, width, height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Gagal memproses foto.')), 'image/jpeg', 0.92));
      const cropped = new File([blob], 'atlantic-avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      await onApply?.(cropped);
    } catch (err) {
      setError(err?.message || 'Foto gagal diproses.');
    }
  }

  if (!file) return null;
  return <div className="atl-image-cropper-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onCancel?.()}>
    <section className="atl-image-cropper" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><small>ATLANTIC PHOTO TOOLS</small><h2>{title}</h2></div><button type="button" onClick={onCancel} disabled={busy} aria-label="Tutup">×</button></header>
      <p className="atl-image-cropper-hint">Geser posisi dan atur zoom sampai foto pas di dalam lingkaran.</p>
      <div className="atl-image-cropper-stage">
        {source && <img src={source} alt="Pratinjau pemotongan" style={{ objectPosition: x + '% ' + y + '%', transform: 'scale(' + zoom + ')' }} />}
        <span className="atl-image-cropper-circle" />
      </div>
      <div className="atl-image-cropper-controls">
        <label>Zoom <b>{zoom.toFixed(1)}×</b><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
        <label>Geser horizontal <b>{x}%</b><input type="range" min="0" max="100" value={x} onChange={event => setX(Number(event.target.value))} /></label>
        <label>Geser vertikal <b>{y}%</b><input type="range" min="0" max="100" value={y} onChange={event => setY(Number(event.target.value))} /></label>
      </div>
      {error && <p className="atl-image-cropper-error">{error}</p>}
      <footer><button type="button" className="atl-image-cropper-cancel" onClick={onCancel} disabled={busy}>Batal</button><button type="button" className="atl-image-cropper-apply" onClick={applyCrop} disabled={busy}>{busy ? 'Memproses…' : 'Gunakan foto'}</button></footer>
    </section>
  </div>;
}
