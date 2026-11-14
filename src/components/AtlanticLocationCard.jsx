import React from 'react';
import { MapPin, Navigation, Radio, Square } from 'lucide-react';

function mapsUrl(latitude, longitude) {
  return `https://www.google.com/maps?q=${encodeURIComponent(latitude + ',' + longitude)}`;
}

export default function AtlanticLocationCard({ location, live = false, mine = false, onStop }) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    return <div className="atl-location-card"><MapPin size={18}/><span>Lokasi tidak tersedia</span></div>;
  }
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const updatedAt = location.updated_at ? new Date(location.updated_at) : null;
  return (
    <div className={`atl-location-card ${live ? 'is-live' : ''}`}>
      <div className="atl-location-map-preview">
        <MapPin size={28}/>
        <span>{live ? 'LIVE LOCATION' : 'LOCATION'}</span>
      </div>
      <div className="atl-location-details">
        <b>{live ? 'Lokasi real-time' : 'Lokasi dibagikan'}</b>
        <span>{latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
        {live && <small><i/> {location.stopped_at ? 'Berbagi dihentikan' : new Date(location.expires_at).getTime() <= Date.now() ? 'Waktu berbagi habis' : 'Memperbarui otomatis'}{updatedAt && !location.stopped_at ? ` · ${updatedAt.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}` : ''}</small>}
      </div>
      <a href={mapsUrl(latitude, longitude)} target="_blank" rel="noreferrer" className="atl-location-open"><Navigation size={15}/> Buka peta</a>
      {live && mine && !location.stopped_at && new Date(location.expires_at).getTime() > Date.now() && <button type="button" className="atl-location-stop" onClick={onStop}><Square size={14}/> Hentikan</button>}
    </div>
  );
}
