(() => {
  'use strict';

  let currentXmlDoc = null;
  let originalFilename = 'edited.gpx';
  let isRte = false;

  const fileInput = document.getElementById('gpx-file-input');
  const uploadStep = document.getElementById('step1-upload');
  const editorStep = document.getElementById('step2-editor');
  const uploadStatus = document.getElementById('upload-status');
  const btnExport = document.getElementById('btn-export-gpx');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    originalFilename = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        currentXmlDoc = parser.parseFromString(e.target.result, 'text/xml');
        
        const parseError = currentXmlDoc.querySelector('parsererror');
        if (parseError) throw new Error('Invalid XML format');

        uploadStatus.textContent = `Berhasil memuat: ${file.name}`;
        uploadStatus.classList.remove('hidden');

        populateForm();

        setTimeout(() => {
          uploadStep.classList.add('hidden');
          editorStep.classList.remove('hidden');
        }, 800);

      } catch (err) {
        alert('Gagal memuat GPX: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function getElementContent(parent, tagName) {
    const el = parent.getElementsByTagName(tagName)[0];
    return el ? el.textContent : '';
  }

  function setElementContent(parent, tagName, text) { let el = parent.getElementsByTagName(tagName)[0]; if (!el) { if (parent.namespaceURI) { el = currentXmlDoc.createElementNS(parent.namespaceURI, tagName); } else { el = currentXmlDoc.createElement(tagName); } parent.appendChild(el); } el.textContent = text; }

  function populateForm() {
    const trk = currentXmlDoc.getElementsByTagName('trk')[0];
    let parent = trk;
    isRte = false;

    if (!parent) {
      const rte = currentXmlDoc.getElementsByTagName('rte')[0];
      if (rte) {
        parent = rte;
        isRte = true;
      }
    }

    if (parent) {
      const name = getElementContent(parent, 'name');
      const type = getElementContent(parent, 'type');
      
      document.getElementById('edit-name').value = name;
      
      const typeSelect = document.getElementById('edit-type');
      let typeVal = 'Biking';
      if (type.toLowerCase().includes('run')) typeVal = 'Running';
      if (type.toLowerCase().includes('walk') || type.toLowerCase().includes('hike')) typeVal = 'Walking';
      typeSelect.value = typeVal;
    }

    // Try to find first time tag
    const firstTimeEl = currentXmlDoc.getElementsByTagName('time')[0];
    if (firstTimeEl && firstTimeEl.textContent) {
      const dt = new Date(firstTimeEl.textContent);
      if (!isNaN(dt.getTime())) {
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        document.getElementById('edit-start-time').value = dt.toISOString().slice(0, 16);
      }
    } else {
      // Default to now if no time found
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
      document.getElementById('edit-start-time').value = dt.toISOString().slice(0, 16);
    }
  }

  btnExport.addEventListener('click', () => {
    if (!currentXmlDoc) return;

    const parentTag = isRte ? 'rte' : 'trk';
    let parent = currentXmlDoc.getElementsByTagName(parentTag)[0];
    
    // Fallback if no trk/rte wrapper found
    if (!parent) {
      parent = currentXmlDoc.createElement('trk');
      currentXmlDoc.documentElement.appendChild(parent);
    }

    // Update metadata
    const nameVal = document.getElementById('edit-name').value;
    if (nameVal) setElementContent(parent, 'name', nameVal);
    
    let typeVal = document.getElementById('edit-type').value;
    if (typeVal === 'Biking') typeVal = 'Cycling';
    setElementContent(parent, 'type', typeVal);

    const pointTag = isRte ? 'rtept' : 'trkpt';
    const points = Array.from(currentXmlDoc.getElementsByTagName(pointTag));
    
    const elevOffset = parseFloat(document.getElementById('edit-elev-offset').value) || 0;
    const targetSpeedKmh = parseFloat(document.getElementById('edit-target-speed').value) || 25;
    const targetSpeedMs = targetSpeedKmh / 3.6;

    // Get Base Start Time
    const startTimeStr = document.getElementById('edit-start-time').value;
    let baseTimeMs = Date.now();
    if (startTimeStr) {
      const dt = new Date(startTimeStr);
      if (!isNaN(dt.getTime())) baseTimeMs = dt.getTime();
    }

    let accumulatedTimeMs = 0;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      
      // Elevation Offset
      if (elevOffset !== 0) {
        const eleEl = pt.getElementsByTagName('ele')[0];
        if (eleEl) {
          const currentEle = parseFloat(eleEl.textContent);
          if (!isNaN(currentEle)) {
            eleEl.textContent = (currentEle + elevOffset).toFixed(1);
          }
        }
      }

      // Simulate Timestamps
      if (i > 0) {
        const prevPt = points[i-1];
        const lat1 = parseFloat(prevPt.getAttribute('lat'));
        const lon1 = parseFloat(prevPt.getAttribute('lon'));
        const lat2 = parseFloat(pt.getAttribute('lat'));
        const lon2 = parseFloat(pt.getAttribute('lon'));

        if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
          // Haversine distance (using RouteEngine if available, else inline)
          const R = 6371e3;
          const rLat1 = lat1 * Math.PI/180;
          const rLat2 = lat2 * Math.PI/180;
          const dLat = (lat2-lat1) * Math.PI/180;
          const dLon = (lon2-lon1) * Math.PI/180;

          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(rLat1) * Math.cos(rLat2) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const dist = R * c; // meters

          accumulatedTimeMs += (dist / targetSpeedMs) * 1000;
        }
      }

      const newTime = new Date(baseTimeMs + accumulatedTimeMs);
      setElementContent(pt, 'time', newTime.toISOString().replace('.000Z', 'Z'));
    }

    // Export XML
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(currentXmlDoc);

    const blob = new Blob([xmlString], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFilename.replace('.gpx', '_fixed.gpx');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();

