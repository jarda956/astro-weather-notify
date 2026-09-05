import { useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// react-leaflet's default marker icon paths break under Vite's bundling; point them
// at the bundled asset URLs instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({
  initialLat,
  initialLon,
  onSelect,
  onClose,
}: {
  initialLat?: number;
  initialLon?: number;
  onSelect: (lat: number, lon: number) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<[number, number] | null>(
    initialLat !== undefined && initialLon !== undefined ? [initialLat, initialLon] : null
  );
  const center: [number, number] = picked ?? [49.8, 15.5];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Vyber lokalitu na mape</h3>
        <p className="muted small">Kliknutim na mapu umistis znacku.</p>
        <div className="map-container">
          <MapContainer center={center} zoom={picked ? 10 : 7} style={{ height: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <ClickHandler onPick={(lat, lon) => setPicked([lat, lon])} />
            {picked && <Marker position={picked} />}
          </MapContainer>
        </div>
        <div className="modal-actions">
          {picked && (
            <span className="small muted">
              {picked[0].toFixed(5)}, {picked[1].toFixed(5)}
            </span>
          )}
          <button type="button" onClick={onClose}>
            Zrusit
          </button>
          <button
            type="button"
            disabled={!picked}
            onClick={() => picked && onSelect(picked[0], picked[1])}
          >
            Pouzit tuto lokalitu
          </button>
        </div>
      </div>
    </div>
  );
}
