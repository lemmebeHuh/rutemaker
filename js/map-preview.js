/**
 * Map Preview Module
 * Handles Leaflet map integration, route display, interactive waypoint drawing,
 * OSRM road-snapping routing, and Undo/Redo history.
 */

const MapPreview = (() => {
  'use strict';

  let map = null;
  let originalRouteLayer = null;
  let modifiedRouteLayer = null;
  let waypointMarkers = [];
  let routingRouteLayer = null;
  let drawMode = false;
  let freehandMode = false;
  let snapToRoads = true;
  let isDrawingFreehand = false;
  let freehandPoints = [];
  let freehandTempLayer = null;
  
  let waypoints = []; // current waypoints
  
  // History for Undo/Redo
  let history = [[]];
  let historyIndex = 0;

  let onRouteCalculated = null;

  const OSRM_URL = 'https://router.project-osrm.org/route/v1';

  function init(containerId, routeCallback) {
    onRouteCalculated = routeCallback;

    map = L.map(containerId, {
      zoomControl: true,
      attributionControl: true,
    }).setView([-6.9, 107.64], 13);

              const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19
      });
      const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19
      });
      const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM', maxZoom: 19
      });
      const baseMaps = { "Light (Carto)": cartoLight, "Dark (Carto)": cartoDark, "Standard (OSM)": osmStandard };
      cartoLight.addTo(map);
      L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

    // Add Search Geocoder
    if (L.Control.Geocoder) {
      L.Control.geocoder({
        defaultMarkGeocode: false,
        position: 'topleft',
        placeholder: "Search for a place...",
      }).on('markgeocode', function(e) {
        map.fitBounds(e.geocode.bbox);
        
        // Add a temporary marker for the searched place
        const marker = L.marker(e.geocode.center).addTo(map);
        marker.bindPopup(e.geocode.name).openPopup();
        
        // Remove the temporary marker after 5 seconds
        setTimeout(() => {
          map.removeLayer(marker);
        }, 5000);
      }).addTo(map);
    }

    map.on('click', (e) => {
      if (drawMode && !freehandMode) {
        addWaypoint(e.latlng.lat, e.latlng.lng);
        saveHistory();
      }
    });

    // Freehand drawing events
    map.on('mousedown', (e) => {
      if (!freehandMode) return;
      isDrawingFreehand = true;
      freehandPoints = [e.latlng];
      if (freehandTempLayer) map.removeLayer(freehandTempLayer);
      freehandTempLayer = L.polyline(freehandPoints, { color: '#fc4c02', weight: 4, dashArray: '5, 10' }).addTo(map);
    });

    map.on('mousemove', (e) => {
      if (!isDrawingFreehand || !freehandMode) return;
      freehandPoints.push(e.latlng);
      freehandTempLayer.setLatLngs(freehandPoints);
    });

    map.on('mouseup', (e) => {
      if (!isDrawingFreehand || !freehandMode) return;
      isDrawingFreehand = false;
      
      if (freehandPoints.length > 5) {
        // Convert Leaflet LatLng objects to plain {lat, lng} for simplifier
        const rawPoints = freehandPoints.map(p => ({ lat: p.lat, lng: p.lng }));
        
        // Find an epsilon that yields between 20 and 70 points so OSRM maps it closely 
        // without exceeding the max waypoints limit (approx 100).
        let simplified = [];
        let epsilon = 0.0001;
        for (let i = 0; i < 20; i++) {
          simplified = RouteSimplifier.ramerDouglasPeucker(rawPoints, epsilon);
          if (simplified.length <= 70) break;
          epsilon += 0.0001;
        } 
        
        // Ensure closed loop
        if (simplified.length > 2) {
          simplified.push({...simplified[0]});
        }

        waypoints = simplified;
        saveHistory();
        renderWaypoints();
        calculateRoute();
      }
      
      if (freehandTempLayer) map.removeLayer(freehandTempLayer);
      freehandTempLayer = null;
      freehandPoints = [];
      setFreehandMode(false); // auto turn off after one shape
    });
  }
  
  function saveHistory() {
    // Drop future history if we are in middle of undo stack
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    // Deep copy waypoints
    history.push(waypoints.map(wp => ({...wp})));
    historyIndex++;
    updateUndoRedoUI();
  }
  
  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      restoreHistoryState();
    }
  }
  
  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      restoreHistoryState();
    }
  }
  
  function restoreHistoryState() {
    waypoints = history[historyIndex].map(wp => ({...wp}));
    renderWaypoints();
    if (waypoints.length >= 2) {
      calculateRoute();
    } else {
      if (routingRouteLayer) map.removeLayer(routingRouteLayer);
      if (onRouteCalculated) onRouteCalculated(null);
    }
    updateUndoRedoUI();
  }
  
  function updateUndoRedoUI() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if(btnUndo) btnUndo.disabled = (historyIndex <= 0);
    if(btnRedo) btnRedo.disabled = (historyIndex >= history.length - 1);
  }

  function displayRoute(trackpoints, type = 'original') {
    if (!map) return;

    const coords = trackpoints
      .filter(tp => tp.position)
      .map(tp => [tp.position.latitudeDegrees, tp.position.longitudeDegrees]);

    if (coords.length === 0) return;

    const style = type === 'original'
      ? { color: '#111827', weight: 3, opacity: 0.8, dashArray: null }
      : { color: '#10b981', weight: 3, opacity: 0.9, dashArray: '8 4' };

    if (type === 'original') {
      if (originalRouteLayer) map.removeLayer(originalRouteLayer);
      originalRouteLayer = L.polyline(coords, style).addTo(map);
      map.fitBounds(originalRouteLayer.getBounds(), { padding: [30, 30] });
    } else {
      if (modifiedRouteLayer) map.removeLayer(modifiedRouteLayer);
      modifiedRouteLayer = L.polyline(coords, style).addTo(map);
    }
  }

  function setDrawMode(enabled, sport = 'Biking') {
    drawMode = enabled;
    if (!enabled) setFreehandMode(false);
    if (map) map.getContainer().style.cursor = enabled ? 'crosshair' : '';
    if (!enabled && waypoints.length >= 2) calculateRoute(sport);
  }

  function setSnapToRoads(enabled) {
    snapToRoads = enabled;
    // Recalculate route with new setting
    if (waypoints.length >= 2) calculateRoute();
  }

  function isSnapEnabled() {
    return snapToRoads;
  }

  function setFreehandMode(enabled) {
    if (!drawMode) return;
    freehandMode = enabled;
    if (map) {
      if (enabled) {
        map.dragging.disable();
        map.getContainer().classList.add('map-freehand-active');
      } else {
        map.dragging.enable();
        map.getContainer().classList.remove('map-freehand-active');
        isDrawingFreehand = false;
        if (freehandTempLayer) map.removeLayer(freehandTempLayer);
        freehandTempLayer = null;
      }
    }
    
    // Update UI button state if it exists
    const btnFreehand = document.getElementById('btn-freehand');
    if (btnFreehand) {
      if (enabled) btnFreehand.classList.add('active');
      else btnFreehand.classList.remove('active');
    }
  }

  function addWaypoint(lat, lng, doRender = true) {
    waypoints.push({ lat, lng });
    if(doRender) {
      renderWaypoints();
      if (waypoints.length >= 2) calculateRoute();
    }
  }
  
  function loadWaypoints(newWaypoints) {
    waypoints = newWaypoints;
    history = [];
    historyIndex = -1;
    saveHistory();
    renderWaypoints();
    calculateRoute();
  }

  function renderWaypoints() {
    // Clear old markers
    for (const marker of waypointMarkers) map.removeLayer(marker);
    waypointMarkers = [];

    waypoints.forEach((wp, index) => {
      const icon = L.divIcon({
        className: 'waypoint-marker',
        html: `<div class="waypoint-dot">${index + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([wp.lat, wp.lng], {
        icon,
        draggable: true,
      }).addTo(map);

      // Context menu to delete point
      marker.on('contextmenu', () => {
        waypoints.splice(index, 1);
        saveHistory();
        renderWaypoints();
        if(waypoints.length >= 2) calculateRoute();
        else if (routingRouteLayer) {
           map.removeLayer(routingRouteLayer);
           if (onRouteCalculated) onRouteCalculated(null);
        }
      });

      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        waypoints[index] = { lat: pos.lat, lng: pos.lng };
        saveHistory();
        if (waypoints.length >= 2) calculateRoute();
      });

      waypointMarkers.push(marker);
    });
  }

  async function calculateRoute(sport = 'Biking') {
    if (waypoints.length < 2) return;

    // If snap is disabled, use straight lines between waypoints
    if (!snapToRoads) {
      displayStraightRoute();
      return;
    }

    const profile = sport === 'Biking' ? 'bike' : 'foot';
    const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `${OSRM_URL}/${profile}/${coords}?overview=full&geometries=geojson&steps=true`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        displayStraightRoute();
        return;
      }

      const route = data.routes[0];
      const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

      if (routingRouteLayer) map.removeLayer(routingRouteLayer);
      routingRouteLayer = L.polyline(routeCoords, {
        color: '#fc4c02', weight: 4, opacity: 0.9,
      }).addTo(map);

      if (onRouteCalculated) {
        onRouteCalculated({
          coordinates: routeCoords,
          distanceMeters: route.distance,
          durationSeconds: route.duration,
        });
      }
    } catch (error) {
      displayStraightRoute();
    }
  }

  function displayStraightRoute() {
    if (routingRouteLayer) map.removeLayer(routingRouteLayer);
    const coords = waypoints.map(wp => [wp.lat, wp.lng]);
    routingRouteLayer = L.polyline(coords, {
      color: '#fc4c02', weight: 4, opacity: 0.9, dashArray: '5 5',
    }).addTo(map);

    if (onRouteCalculated) {
      let total = 0;
      for (let i = 1; i < coords.length; i++) {
        total += RouteEngine.haversineDistance(
          coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]
        );
      }
      onRouteCalculated({
        coordinates: coords, distanceMeters: total, durationSeconds: 0,
      });
    }
  }

  function clearWaypoints() {
    waypoints = [];
    history = [];
    historyIndex = -1;
    renderWaypoints();
    if (routingRouteLayer) map.removeLayer(routingRouteLayer);
    updateUndoRedoUI();
  }

  function clearRoutes() {
    if (originalRouteLayer) { map.removeLayer(originalRouteLayer); originalRouteLayer = null; }
    if (modifiedRouteLayer) { map.removeLayer(modifiedRouteLayer); modifiedRouteLayer = null; }
  }

  function invalidateSize() {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  }

  return {
    init, displayRoute, setDrawMode, setFreehandMode, setSnapToRoads, isSnapEnabled, addWaypoint, calculateRoute,
    clearWaypoints, clearRoutes, invalidateSize, loadWaypoints,
    undo, redo
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MapPreview;



