import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Location } from '../types';
import LocationCard from '../components/LocationCard';

export default function Dashboard() {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listLocations()
      .then(({ locations }) => setLocations(locations))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Chyba pri nacitani'));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!locations) return <p className="muted">Nacitani...</p>;

  if (locations.length === 0) {
    return (
      <div className="empty-state">
        <p>Zatim nemas ulozene zadne lokality.</p>
        <Link to="/settings">Pridat prvni lokalitu</Link>
      </div>
    );
  }

  return (
    <div className="location-grid">
      {locations.map((loc) => (
        <LocationCard key={loc.id} location={loc} />
      ))}
    </div>
  );
}
