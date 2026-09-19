/**
 * Strava API Module for ruteu. Admin
 */

const StravaAPI = (() => {
  const BASE_URL = 'https://www.strava.com/api/v3';

  // Helper to extract ID from full URL or just return the ID
  function extractId(input) {
    if (!input) return null;
    const match = input.match(/\/(\d+)$/);
    if (match) return match[1];
    if (/^\d+$/.test(input.trim())) return input.trim();
    return null;
  }

  async function fetchWithAuth(endpoint, token) {
    if (!token) {
      throw new Error("Access Token Strava tidak ditemukan. Silakan isi di menu Settings (⚙️).");
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Akses ditolak: Token tidak valid atau kedaluwarsa. Perbarui di Settings.");
      } else if (response.status === 403) {
        throw new Error("Akses dilarang: Rute/Aktivitas bersifat privat, atau token kurang scope 'read_all'.");
      } else if (response.status === 404) {
        throw new Error("Tidak ditemukan: Rute atau Aktivitas dengan ID tersebut tidak ada.");
      } else if (response.status === 429) {
        throw new Error("Limit API Strava tercapai. Silakan coba lagi dalam 15 menit.");
      } else {
        throw new Error(`Error API Strava: ${response.status} ${response.statusText}`);
      }
    }

    return response;
  }

  async function getRouteGPX(routeUrlOrId, token) {
    const id = extractId(routeUrlOrId);
    if (!id) throw new Error("Format ID atau URL Rute tidak valid.");

    // Strava API endpoint for route export
    const response = await fetchWithAuth(`/routes/${id}/export_gpx`, token);
    const gpxText = await response.text();
    return gpxText;
  }

  async function getActivityStreams(activityUrlOrId, token) {
    const id = extractId(activityUrlOrId);
    if (!id) throw new Error("Format ID atau URL Aktivitas tidak valid.");

    // Strava API endpoint for activity streams
    // We request time, distance, heartrate, cadence, watts (power)
    const response = await fetchWithAuth(`/activities/${id}/streams?keys=time,distance,heartrate,cadence,watts&key_by_type=true`, token);
    const data = await response.json();
    return data;
  }

  return {
    getRouteGPX,
    getActivityStreams
  };
})();
