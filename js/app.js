/**
 * FakeStrava - Main App Controller v3
 * Integrates: Cadence Engine, Power Engine, Review Modal
 */

const App = (() => {
  'use strict';

  let state = {
    mode: 'upload',
    sport: 'Biking',
    parsedData: null,
    originalTrackpoints: [],
    routeData: null,
    isDrawMode: false,
    clonedStream: null,
    clonedStreamId: null,
    lastGeneratedTps: null,
    lastGeneratedData: null,
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- UI Helpers ---

  function formatPace(speedKmh) {
    if (speedKmh <= 0) return "--:--";
    const minsPerKm = 60 / speedKmh;
    const mins = Math.floor(minsPerKm);
    const secs = Math.floor((minsPerKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatSpeedUI(speedKmh) {
    if (!speedKmh && speedKmh !== 0) return { val: '--', unit: 'km/h' };
    if (state.sport === 'Running' || state.sport === 'Walking') {
      return { val: formatPace(speedKmh), unit: '/km' };
    }
    return { val: speedKmh.toFixed(1), unit: 'km/h' };
  }

  function init() {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeToggle) {
      themeToggle.textContent = currentTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
      themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        themeToggle.textContent = newTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
      });
    }

    MapPreview.init('map-container', onRouteCalculated);
    bindModeTabEvents();
    bindSportSelectorEvents();
    bindUploadEvents();
    bindControlEvents();
    bindGenerateEvent();
    bindDrawModeEvents();
    bindAccordion();
    bindReviewModal();
    bindCadencePowerToggles();

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('ctrl-start-time').value = now.toISOString().slice(0, 16);

    $('btn-snap-roads').addEventListener('click', () => {
      const btn = $('btn-snap-roads');
      const isSnap = MapPreview.isSnapEnabled();
      MapPreview.setSnapToRoads(!isSnap);
      btn.textContent = !isSnap ? 'Snap: ON' : 'Snap: OFF';
      if (!isSnap) btn.classList.remove('active'); else btn.classList.add('active');
    });
    $('btn-freehand').addEventListener('click', () => {
      const btn = $('btn-freehand');
      const isActive = btn.classList.contains('active');
      MapPreview.setFreehandMode(!isActive);
    });
    $('btn-undo').addEventListener('click', () => MapPreview.undo());
    $('btn-redo').addEventListener('click', () => MapPreview.redo());

    updateStatus('Ready - Upload a TCX file or draw a route');

    // Strava API Bindings
    const btnSettings = $('btn-settings');
    const settingsModal = $('settings-modal');
    if (btnSettings && settingsModal) {
      btnSettings.addEventListener('click', () => settingsModal.style.display = 'flex');
      $('btn-settings-cancel').addEventListener('click', () => settingsModal.style.display = 'none');
      $('btn-settings-save').addEventListener('click', () => {
        const token = $('strava-access-token').value.trim();
        if (token) localStorage.setItem('strava_token', token);
        settingsModal.style.display = 'none';
        showToast('Settings saved', 'success');
      });
      const savedToken = localStorage.getItem('strava_token');
      if (savedToken) $('strava-access-token').value = savedToken;
    }

    const btnImport = $('btn-import-route');
    if (btnImport) {
      btnImport.addEventListener('click', async () => {
        const urlOrId = $('strava-route-url').value.trim();
        const token = localStorage.getItem('strava_token');
        if (!urlOrId) return showToast('Please enter Route ID or URL', 'error');
        if (!token) return showToast('Please set Strava Access Token in Settings', 'error');
        
        const origText = btnImport.textContent;
        btnImport.textContent = 'Importing...';
        btnImport.disabled = true;
        try {
          const gpxText = await StravaAPI.getRouteGPX(urlOrId, token);
          const blob = new Blob([gpxText], { type: 'text/xml' });
          const file = new File([blob], `route_${urlOrId}.gpx`, { type: 'text/xml' });
          handleFile(file);
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          btnImport.textContent = origText;
          btnImport.disabled = false;
        }
      });
    }

    const btnClone = $('btn-clone-biometrics');
    if (btnClone) {
      btnClone.addEventListener('click', async () => {
        const urlOrId = $('strava-activity-url').value.trim();
        const token = localStorage.getItem('strava_token');
        if (!urlOrId) return showToast('Please enter Activity ID or URL', 'error');
        if (!token) return showToast('Please set Strava Access Token in Settings', 'error');
        
        const origText = btnClone.textContent;
        btnClone.textContent = 'Cloning...';
        btnClone.disabled = true;
        $('clone-status').textContent = 'Fetching streams...';
        $('clone-status').style.color = 'var(--text-tertiary)';
        try {
          const streamData = await StravaAPI.getActivityStreams(urlOrId, token);
          state.clonedStream = streamData;
          state.clonedStreamId = urlOrId;
          $('clone-status').textContent = `Success! Cloned from Activity ${urlOrId}. Will be applied on Generation.`;
          $('clone-status').style.color = '#4ade80';
          showToast('Biometrics cloned!', 'success');
        } catch (err) {
          $('clone-status').textContent = err.message;
          $('clone-status').style.color = '#ef4444';
          showToast(err.message, 'error');
          state.clonedStream = null;
        } finally {
          btnClone.textContent = origText;
          btnClone.disabled = false;
        }
      });
    }

  }

  function bindCadencePowerToggles() {
    const powerToggle = $('ctrl-power-enabled');
    const powerControls = $('power-controls');
    if (powerToggle && powerControls) {
      powerToggle.addEventListener('change', () => {
        powerControls.style.display = powerToggle.checked ? 'block' : 'none';
      });
    }
  }

  function bindAccordion() {
    $$('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.parentElement;
        item.classList.toggle('active');
      });
    });
  }

  function bindModeTabEvents() {
    $$('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });
  }

  function setMode(mode) {
    state.mode = mode;
    $$('.mode-tab').forEach(t => t.classList.remove('active'));
    $(`tab-${mode}`).classList.add('active');

    if (mode === 'upload') {
      $('upload-zone').style.display = '';
      $('draw-mode-banner').classList.remove('visible');
      $('draw-controls').style.display = 'none';
      $('btn-edit-uploaded').style.display = state.originalTrackpoints.length > 0 ? 'inline-flex' : 'none';
        if($('btn-freehand')) $('btn-freehand').style.display = 'none';
        if($('btn-snap-roads')) $('btn-snap-roads').style.display = 'none';
        MapPreview.setDrawMode(false);
      state.isDrawMode = false;
    } else {
      $('upload-zone').style.display = 'none';
      $('draw-mode-banner').classList.add('visible');
      $('draw-controls').style.display = 'block';
      $('btn-edit-uploaded').style.display = 'none';
        if($('btn-freehand')) $('btn-freehand').style.display = 'inline-block';
        if($('btn-snap-roads')) $('btn-snap-roads').style.display = 'inline-block';
        MapPreview.setDrawMode(true, state.sport);
      state.isDrawMode = true;
      MapPreview.clearRoutes();
      clearStats();
      updateStatus('Draw mode - Click map to add waypoints');
    }
    MapPreview.invalidateSize();
  }

  function bindSportSelectorEvents() {
    $$('.sport-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.sport-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.sport = btn.dataset.sport;

        const pacingGroup = $('pacing-group');
        if (pacingGroup) { pacingGroup.style.display = "block"; }

        const defaults = { Biking: 25.0, Running: 10.0, Walking: 5.0 };
        $('ctrl-target-speed').value = defaults[state.sport];
        
        const f = formatSpeedUI(defaults[state.sport]);
        updateControlValue('target-speed-value', `${f.val} ${f.unit}`);
        
        ['lbl-orig-avg-spd', 'lbl-mod-avg-spd'].forEach(id => {
          const el = $(id); if (el) el.textContent = (state.sport === 'Running' || state.sport === 'Walking') ? 'Avg Pace' : 'Avg Spd';
        });
        ['lbl-orig-max-spd', 'lbl-mod-max-spd'].forEach(id => {
          const el = $(id); if (el) el.textContent = (state.sport === 'Running' || state.sport === 'Walking') ? 'Max Pace' : 'Max Spd';
        });

        if(state.isDrawMode) MapPreview.calculateRoute(state.sport);
        else displayModifiedPreview();
      });
    });
  }

  function bindUploadEvents() {
    const uploadZone = $('upload-zone');
    const fileInput = $('file-input');
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault(); uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
  }

  function handleFile(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'tcx' && ext !== 'gpx') { showToast('Please upload a .tcx or .gpx file', 'error'); return; }
    const isGpx = ext === 'gpx';
    updateStatus(isGpx ? 'Parsing GPX file...' : 'Parsing TCX file...');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        state.parsedData = isGpx ? GPXParser.parse(e.target.result) : TCXParser.parse(e.target.result);
        state.originalTrackpoints = isGpx ? GPXParser.getAllTrackpoints(state.parsedData) : TCXParser.getAllTrackpoints(state.parsedData);
        if (state.originalTrackpoints.length === 0) { showToast('No trackpoints found', 'error'); return; }

        if (state.parsedData.activities.length > 0) {
          const fileSport = state.parsedData.activities[0].sport;
          if (['Biking', 'Running', 'Walking'].includes(fileSport)) {
            state.sport = fileSport;
            $$('.sport-btn').forEach(b => b.classList.toggle('active', b.dataset.sport === fileSport));
          }
        }

        displayOriginalStats();
        
        const summary = state.parsedData.activities[0].summary;
        let calculatedSpeed = summary.avgSpeed * 3.6;
        if (calculatedSpeed <= 0) {
            const fileSport = state.parsedData.activities[0].sport;
            if (fileSport === 'Running') calculatedSpeed = 10;
            else if (fileSport === 'Walking') calculatedSpeed = 5;
            else calculatedSpeed = 25;
        }
        
        const avgSpd = calculatedSpeed.toFixed(1);
        $('ctrl-target-speed').value = avgSpd;
        
        const f = formatSpeedUI(parseFloat(avgSpd));
        updateControlValue('target-speed-value', `${f.val} ${f.unit}`);

        displayModifiedPreview();
        MapPreview.displayRoute(state.originalTrackpoints, 'original');

        if (state.originalTrackpoints && state.originalTrackpoints.length > 0) {
          const rawWps = state.originalTrackpoints
            .filter(tp => tp.position && !isNaN(tp.position.latitudeDegrees) && !isNaN(tp.position.longitudeDegrees))
            .map(tp => ({ lat: tp.position.latitudeDegrees, lng: tp.position.longitudeDegrees }));

          if (rawWps.length > 0) {
            let simplified = rawWps;
            if (rawWps.length > 30 && typeof RouteSimplifier !== 'undefined') {
              let epsilon = 0.0001;
              for (let i = 0; i < 20; i++) {
                simplified = RouteSimplifier.ramerDouglasPeucker(rawWps, epsilon);
                if (simplified.length <= 40) break;
                epsilon += 0.0002;
              }
            }
            MapPreview.loadWaypoints(simplified);
          }
        }

        const uploadZone = $('upload-zone');
        uploadZone.classList.add('has-file');
        uploadZone.querySelector('.upload-icon').textContent = 'Success';
        uploadZone.querySelector('.upload-text').textContent = file.name;
        uploadZone.querySelector('.upload-hint').textContent = `${state.originalTrackpoints.length} trackpoints`;

        if (state.originalTrackpoints[0].time) {
          try {
            const dt = new Date(state.originalTrackpoints[0].time);
            if (!isNaN(dt.getTime())) {
              dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
              $('ctrl-start-time').value = dt.toISOString().slice(0, 16);
            }
          } catch(e) { /* no valid time in file, use default */ }
        }

        $('btn-generate').disabled = false;
        $('btn-edit-uploaded').style.display = 'inline-flex';
        showToast('Loaded successfully', 'success');
        updateStatus(`File loaded - ${file.name}`);
      } catch (err) {
        showToast('Parse failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function bindDrawModeEvents() {
    $('btn-edit-uploaded').addEventListener('click', () => {
      if (!state.originalTrackpoints || state.originalTrackpoints.length === 0) return;
      const waypoints = RouteSimplifier.simplifyToWaypoints(state.originalTrackpoints, 40);
      MapPreview.clearRoutes();
      waypoints.forEach(wp => MapPreview.addWaypoint(wp));
      setMode('draw');
    });
    
    $('btn-clear-waypoints').addEventListener('click', () => {
      MapPreview.clearWaypoints();
      MapPreview.clearRoutes();
      state.originalTrackpoints = [];
      clearStats();
      $('btn-generate').disabled = true;
    });
  }

  // --- Generate: now opens review modal instead of downloading ---
  function bindGenerateEvent() {
    $('btn-generate').addEventListener('click', () => {
      if (state.originalTrackpoints.length === 0) return;
      updateStatus('Generating...');
      try {
        const tps = getModifiedTrackpoints();
        state.lastGeneratedTps = tps;
        openReviewModal(tps);
        updateStatus('Review your activity data');
      } catch (err) {
        console.error(err);
        showToast('Generation failed', 'error');
        updateStatus('Error generating');
      }
    });
  }

  // --- Review Modal ---
  function bindReviewModal() {
    $('btn-review-close').addEventListener('click', closeReviewModal);
    $('btn-review-back').addEventListener('click', closeReviewModal);
    $('btn-review-download').addEventListener('click', () => {
      closeReviewModal();
      downloadFile();
    });

    // Close on backdrop click
    const backdrop = document.querySelector('.review-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeReviewModal);
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('review-modal').style.display !== 'none') {
        closeReviewModal();
      }
    });
  }

  function openReviewModal(tps) {
    const modal = $('review-modal');
    modal.style.display = 'flex';
    populateReviewData(tps);
  }

  function closeReviewModal() {
    $('review-modal').style.display = 'none';
  }

  function downloadFile() {
    const tps = state.lastGeneratedTps;
    if (!tps || tps.length === 0) return;

    let sourceData = state.parsedData;
    if (state.mode === 'draw' || !sourceData) {
      const startTime = tps.length > 0 ? tps[0].time : new Date().toISOString();
      sourceData = TCXGenerator.createEmptyActivity(state.sport, startTime);
    } else {
      sourceData.activities[0].sport = state.sport;
    }

    sourceData.activities[0].laps[0].tracks[0].trackpoints = tps;

    // Calculate calories to inject into the sourceData before generating TCX/FIT
    const stats = calcStats(tps);
    if (stats) {
      sourceData.activities[0].laps[0].calories = estimateCalories(tps, stats);
    }

    const deviceEl = document.getElementById('ctrl-device');
    const formatEl = document.getElementById('ctrl-format');
    const selectedDevice = deviceEl ? deviceEl.value : 'Garmin Forerunner 945';
    const format = formatEl ? formatEl.value : 'tcx';

    let finalData;
    if (format === 'fit') {
      finalData = FITGenerator.generate(sourceData, { sport: state.sport, creator: selectedDevice });
    } else {
      finalData = TCXGenerator.generate(sourceData, { sport: state.sport, creator: selectedDevice });
    }

    const blob = new Blob([finalData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Forged_${state.sport}_Activity.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('File Downloaded', 'success');
    updateStatus('Download complete');
  }

  function populateReviewData(tps) {
    const stats = calcStats(tps);
    if (!stats) return;

    const isPace = state.sport === 'Running' || state.sport === 'Walking';

    // Summary grid
    $('rv-distance').textContent = stats.distanceKm.toFixed(2).replace('.', ',');
    $('rv-moving-time').textContent = formatDuration(stats.movingTimeSec);
    $('rv-elevation').textContent = Math.round(stats.elevGain);

    if (isPace) {
      $('rv-pace-label').textContent = 'Pace Rata2';
      $('rv-pace').textContent = formatPace(stats.avgSpeedKmh);
      $('rv-pace-unit').textContent = '/km';
    } else {
      $('rv-pace-label').textContent = 'Kecepatan Rata2';
      $('rv-pace').textContent = stats.avgSpeedKmh.toFixed(1).replace('.', ',');
      $('rv-pace-unit').textContent = 'km/h';
    }

    // Calories (estimated: HR-based or MET-based)
    const calories = estimateCalories(tps, stats);
    $('rv-calories').textContent = calories;

    // HR data
    const hrData = extractHRData(tps);
    if (hrData.count > 0) {
      $('rv-avg-hr').textContent = hrData.avg;
      $('rv-hr-avg-val').textContent = `${hrData.avg} bpm`;
      $('rv-hr-max-val').textContent = `${hrData.max} bpm`;
      $('rv-hr-section').style.display = '';
      $('rv-zones-section').style.display = '';
      renderHRZones(hrData, tps);
      renderHRChart(tps, stats);
    } else {
      $('rv-avg-hr').textContent = '--';
      $('rv-hr-section').style.display = 'none';
      $('rv-zones-section').style.display = 'none';
    }

    // Pace chart + splits
    renderPaceChart(tps, stats, isPace);
    renderPaceSplits(tps, isPace);

    // Cadence
    const cadenceData = extractCadenceData(tps);
    const cadenceSection = $('rv-cadence-section');
    if (cadenceData.count > 0) {
      cadenceSection.style.display = '';
      const unit = state.sport === 'Biking' ? ' rpm' : ' spm';
      $('rv-cadence-avg').textContent = cadenceData.avg + unit;
      $('rv-cadence-max').textContent = cadenceData.max + unit;
    } else {
      cadenceSection.style.display = 'none';
    }

    // Power
    const powerData = extractPowerData(tps);
    const powerSection = $('rv-power-section');
    if (powerData.count > 0) {
      powerSection.style.display = '';
      $('rv-power-avg').textContent = powerData.avg + ' W';
      $('rv-power-max').textContent = powerData.max + ' W';
      renderPowerChart(tps, stats);
    } else {
      powerSection.style.display = 'none';
    }

    // Warnings
    const warnings = checkRealism(tps, stats, hrData, cadenceData);
    const warningsSection = $('rv-warnings-section');
    const warningsList = $('rv-warnings-list');
    warningsList.innerHTML = '';
    if (warnings.length > 0) {
      warningsSection.style.display = '';
      warnings.forEach(w => {
        const item = document.createElement('div');
        item.className = 'review-warning-item';
        item.textContent = w;
        warningsList.appendChild(item);
      });
    } else {
      warningsSection.style.display = 'none';
    }
  }

  // --- Data extraction helpers ---

  function extractHRData(tps) {
    let sum = 0, count = 0, max = 0, min = 999;
    for (const tp of tps) {
      if (tp.heartRateBpm && tp.heartRateBpm > 0) {
        sum += tp.heartRateBpm;
        count++;
        if (tp.heartRateBpm > max) max = tp.heartRateBpm;
        if (tp.heartRateBpm < min) min = tp.heartRateBpm;
      }
    }
    return { avg: count > 0 ? Math.round(sum / count) : 0, max, min, count };
  }

  function extractCadenceData(tps) {
    let sum = 0, count = 0, max = 0;
    for (const tp of tps) {
      const c = tp.cadence || tp.runCadence || 0;
      if (c > 0) {
        sum += c;
        count++;
        if (c > max) max = c;
      }
    }
    return { avg: count > 0 ? Math.round(sum / count) : 0, max, count };
  }

  function extractPowerData(tps) {
    let sum = 0, count = 0, max = 0;
    for (const tp of tps) {
      if (tp.power && tp.power > 0) {
        sum += tp.power;
        count++;
        if (tp.power > max) max = tp.power;
      }
    }
    return { avg: count > 0 ? Math.round(sum / count) : 0, max, count };
  }

  function estimateCalories(tps, stats) {
    const hrData = extractHRData(tps);
    const durationMin = stats.movingTimeSec / 60;
    if (hrData.count > 0 && hrData.avg > 0) {
      // Keytel formula (simplified)
      const hr = hrData.avg;
      const weight = 72;
      const cal = durationMin * (0.6309 * hr + 0.1988 * weight + 0.2017 * 30 - 55.0969) / 4.184;
      return Math.round(Math.max(cal, durationMin * 4));
    }
    // MET-based fallback
    const met = state.sport === 'Running' ? 9.8 : state.sport === 'Biking' ? 7.5 : 3.5;
    return Math.round(met * 72 * (durationMin / 60));
  }

  // --- Chart rendering (Canvas-based, Strava-style) ---

  function renderPaceChart(tps, stats, isPace) {
    const canvas = $('rv-pace-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 24;
    const h = 120;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    // Sample speed at regular distance intervals
    const sampleCount = Math.min(200, tps.length);
    const step = Math.max(1, Math.floor(tps.length / sampleCount));
    const speeds = [];
    for (let i = 0; i < tps.length; i += step) {
      speeds.push(tps[i].speed || 0);
    }

    if (speeds.length < 2) return;

    const speedsKmh = speeds.map(s => s * 3.6);
    const maxS = Math.max(...speedsKmh);
    const minS = Math.min(...speedsKmh.filter(s => s > 0.5));

    const margin = { top: 8, bottom: 8, left: 0, right: 0 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;

    // Filled area chart (Strava style)
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartH);
    for (let i = 0; i < speeds.length; i++) {
      const x = margin.left + (i / (speeds.length - 1)) * chartW;
      const val = speedsKmh[i];
      const norm = maxS > minS ? (val - minS) / (maxS - minS) : 0.5;
      const y = margin.top + chartH - norm * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(margin.left + chartW, margin.top + chartH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartH);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line on top
    ctx.beginPath();
    for (let i = 0; i < speeds.length; i++) {
      const x = margin.left + (i / (speeds.length - 1)) * chartW;
      const val = speedsKmh[i];
      const norm = maxS > minS ? (val - minS) / (maxS - minS) : 0.5;
      const y = margin.top + chartH - norm * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Average dashed line
    const avgNorm = maxS > minS ? (stats.avgSpeedKmh - minS) / (maxS - minS) : 0.5;
    const avgY = margin.top + chartH - avgNorm * chartH;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(margin.left, avgY);
    ctx.lineTo(margin.left + chartW, avgY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function renderHRChart(tps, stats) {
    const canvas = $('rv-hr-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 24;
    const h = 120;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    const sampleCount = Math.min(200, tps.length);
    const step = Math.max(1, Math.floor(tps.length / sampleCount));
    const hrs = [];
    for (let i = 0; i < tps.length; i += step) {
      hrs.push(tps[i].heartRateBpm || 0);
    }

    const validHRs = hrs.filter(h => h > 0);
    if (validHRs.length < 2) return;

    const maxHR = Math.max(...validHRs);
    const minHR = Math.min(...validHRs);

    const margin = { top: 8, bottom: 8, left: 0, right: 0 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;

    // Dark area fill (mimicking Strava's HR graph)
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartH);
    for (let i = 0; i < hrs.length; i++) {
      const x = margin.left + (i / (hrs.length - 1)) * chartW;
      const val = hrs[i] || minHR;
      const norm = maxHR > minHR ? (val - minHR) / (maxHR - minHR) : 0.5;
      const y = margin.top + chartH - norm * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(margin.left + chartW, margin.top + chartH);
    ctx.closePath();

    // Dark overlay
    const gradDark = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartH);
    gradDark.addColorStop(0, 'rgba(40, 40, 50, 0.7)');
    gradDark.addColorStop(1, 'rgba(40, 40, 50, 0.1)');
    ctx.fillStyle = gradDark;
    ctx.fill();

    // Pink/red fill
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartH);
    for (let i = 0; i < hrs.length; i++) {
      const x = margin.left + (i / (hrs.length - 1)) * chartW;
      const val = hrs[i] || minHR;
      const norm = maxHR > minHR ? (val - minHR) / (maxHR - minHR) : 0.5;
      const y = margin.top + chartH - norm * chartH * 0.8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(margin.left + chartW, margin.top + chartH);
    ctx.closePath();
    const gradPink = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartH);
    gradPink.addColorStop(0, 'rgba(252, 82, 0, 0.5)');
    gradPink.addColorStop(1, 'rgba(252, 82, 0, 0.1)');
    ctx.fillStyle = gradPink;
    ctx.fill();

    // Average dashed line
    const hrData = extractHRData(tps);
    const avgNorm = maxHR > minHR ? (hrData.avg - minHR) / (maxHR - minHR) : 0.5;
    const avgY = margin.top + chartH - avgNorm * chartH;
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(margin.left, avgY);
    ctx.lineTo(margin.left + chartW, avgY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function renderPowerChart(tps, stats) {
    const canvas = $('rv-power-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 24;
    const h = 100;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    const sampleCount = Math.min(200, tps.length);
    const step = Math.max(1, Math.floor(tps.length / sampleCount));
    const powers = [];
    for (let i = 0; i < tps.length; i += step) {
      powers.push(tps[i].power || 0);
    }

    const validPowers = powers.filter(p => p > 0);
    if (validPowers.length < 2) return;

    const maxP = Math.max(...validPowers);
    const minP = Math.min(...validPowers);

    const margin = { top: 8, bottom: 8, left: 0, right: 0 };
    const chartW = w;
    const chartH = h - margin.top - margin.bottom;

    ctx.beginPath();
    ctx.moveTo(0, margin.top + chartH);
    for (let i = 0; i < powers.length; i++) {
      const x = (i / (powers.length - 1)) * chartW;
      const val = powers[i];
      const norm = maxP > minP ? (val - minP) / (maxP - minP) : 0.5;
      const y = margin.top + chartH - norm * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(chartW, margin.top + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartH);
    grad.addColorStop(0, 'rgba(192, 160, 255, 0.4)');
    grad.addColorStop(1, 'rgba(192, 160, 255, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < powers.length; i++) {
      const x = (i / (powers.length - 1)) * chartW;
      const val = powers[i];
      const norm = maxP > minP ? (val - minP) / (maxP - minP) : 0.5;
      const y = margin.top + chartH - norm * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#c0a0ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function renderHRZones(hrData, tps) {
    const container = $('rv-hr-zones');
    if (!container) return;
    container.innerHTML = '';

    const maxHR = parseInt($('ctrl-max-hr').value) || 190;

    // Strava zones based on max HR
    const zones = [
      { label: 'Z5', min: Math.round(maxHR * 0.90), max: maxHR, color: '#dc2626' },
      { label: 'Z4', min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90) - 1, color: '#f97316' },
      { label: 'Z3', min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80) - 1, color: '#facc15' },
      { label: 'Z2', min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70) - 1, color: '#f87171' },
      { label: 'Z1', min: 0, max: Math.round(maxHR * 0.60) - 1, color: '#fca5a5' },
    ];

    // Count time in each zone
    const zoneCounts = zones.map(() => 0);
    let totalHR = 0;
    for (const tp of tps) {
      if (!tp.heartRateBpm || tp.heartRateBpm <= 0) continue;
      totalHR++;
      for (let z = 0; z < zones.length; z++) {
        if (tp.heartRateBpm >= zones[z].min) {
          zoneCounts[z]++;
          break;
        }
      }
    }

    const maxPct = Math.max(...zoneCounts.map(c => totalHR > 0 ? c / totalHR : 0));

    zones.forEach((zone, i) => {
      const pct = totalHR > 0 ? Math.round((zoneCounts[i] / totalHR) * 100) : 0;
      const barWidth = maxPct > 0 ? (zoneCounts[i] / totalHR) / maxPct * 100 : 0;

      const row = document.createElement('div');
      row.className = `review-zone-row zone-${5 - i}`;
      row.innerHTML = `
        <span class="review-zone-label">${zone.label}</span>
        <div class="review-zone-bar-track">
          <div class="review-zone-bar-fill" style="width:${barWidth}%"></div>
        </div>
        <span class="review-zone-pct">${pct}%</span>
        <span class="review-zone-range">${zone.min === 0 ? '0' : zone.min}-${zone.max} bpm</span>
      `;
      container.appendChild(row);
    });
  }

  function renderPaceSplits(tps, isPace) {
    const container = $('rv-pace-splits');
    if (!container) return;
    container.innerHTML = '';

    // Calculate pace per km
    let cumDist = 0;
    let kmStart = 0;
    const splits = [];

    for (let i = 1; i < tps.length; i++) {
      if (tps[i].position && tps[i - 1].position) {
        cumDist += RouteEngine.haversineDistance(
          tps[i-1].position.latitudeDegrees, tps[i-1].position.longitudeDegrees,
          tps[i].position.latitudeDegrees, tps[i].position.longitudeDegrees
        );
      }

      if (cumDist >= (splits.length + 1) * 1000) {
        const dt = (new Date(tps[i].time).getTime() - new Date(tps[kmStart].time).getTime()) / 1000;
        const distKm = (cumDist - splits.length * 1000) / 1000;
        const speedKmh = distKm > 0 ? (distKm / (dt / 3600)) : 0;
        splits.push({ km: splits.length + 1, speedKmh, timeSec: dt });
        kmStart = i;
      }
    }

    if (splits.length === 0) return;

    const maxSpeed = Math.max(...splits.map(s => s.speedKmh));
    const minSpeed = Math.min(...splits.filter(s => s.speedKmh > 0).map(s => s.speedKmh));

    splits.forEach(split => {
      const barWidth = maxSpeed > 0 ? (split.speedKmh / maxSpeed) * 100 : 0;
      const label = isPace ? formatPace(split.speedKmh) : split.speedKmh.toFixed(1);

      const row = document.createElement('div');
      row.className = 'review-pace-split';
      row.innerHTML = `
        <span class="review-pace-split-km">${split.km}</span>
        <div class="review-pace-split-bar-track">
          <div class="review-pace-split-bar-fill" style="width:${barWidth}%"></div>
        </div>
        <span class="review-pace-split-value">${label}</span>
      `;
      container.appendChild(row);
    });
  }

  // --- Realism checks ---
  function checkRealism(tps, stats, hrData, cadenceData) {
    const warnings = [];

    // 1. Pace too constant (low coefficient of variation)
    if (tps.length > 100) {
      const speeds = tps.filter(tp => tp.speed > 0.5).map(tp => tp.speed);
      if (speeds.length > 50) {
        const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        const variance = speeds.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / speeds.length;
        const cv = Math.sqrt(variance) / mean;
        if (cv < 0.03) {
          warnings.push('Pace terlalu konstan. Manusia normal punya variasi pace ±5-10% per km.');
        }
      }
    }

    // 2. HR too flat
    if (hrData.count > 50) {
      const range = hrData.max - hrData.min;
      if (range < 10) {
        warnings.push('Heart rate terlalu flat (range < 10 bpm). Data HR asli biasanya punya range 15-40+ bpm.');
      }
    }

    // 3. HR not matching pace
    if (hrData.count > 0 && stats.avgSpeedKmh > 0) {
      if (state.sport === 'Running') {
        if (stats.avgSpeedKmh > 12 && hrData.avg < 120) {
          warnings.push('Pace cepat (< 5:00/km) tapi HR rata-rata rendah (< 120 bpm). Tidak realistis untuk kebanyakan orang.');
        }
        if (stats.avgSpeedKmh < 8 && hrData.avg > 170) {
          warnings.push('Pace santai (> 7:30/km) tapi HR rata-rata tinggi (> 170 bpm). Tidak umum untuk pelari biasa.');
        }
      }
    }

    // 4. Cadence out of range
    if (cadenceData.count > 0) {
      if (state.sport === 'Running' && (cadenceData.avg < 140 || cadenceData.avg > 210)) {
        warnings.push(`Cadence running ${cadenceData.avg} spm di luar range normal (150-200 spm).`);
      }
    }

    return warnings;
  }

  function bindControlEvents() {
    bindSlider('ctrl-target-speed', 'target-speed-value', v => { const f = formatSpeedUI(parseFloat(v)); return `${f.val} ${f.unit}`; });
    bindSlider('ctrl-trim-start', 'trim-start-value', v => `${v}%`);
    bindSlider('ctrl-trim-end', 'trim-end-value', v => `${v}%`);
    bindSlider('ctrl-loop-count', 'loop-count-value', v => `${v}×`);
    bindSlider('ctrl-elev-offset', 'elev-offset-value', v => `${v>0?'+':''}${v}m`);
    bindSlider('ctrl-sidewalk-offset', 'sidewalk-offset-value', v => `${v>0?'+':''}${v}m`);
    bindSlider('ctrl-gps-jitter', 'gps-jitter-value', v => `${v}%`);
    bindSlider('ctrl-speed-noise', 'speed-noise-value', v => `${v}%`);
    bindSlider('ctrl-target-hr', 'target-hr-value', v => `${v} bpm`);
    bindSlider('ctrl-max-hr', 'max-hr-value', v => `${v} bpm`);
    bindSlider('ctrl-resting-hr', 'resting-hr-value', v => `${v} bpm`);

    let timer;
    ['ctrl-target-speed','ctrl-trim-start','ctrl-trim-end','ctrl-loop-count','ctrl-elev-offset','ctrl-reverse',
     'ctrl-start-time','ctrl-sidewalk-offset','ctrl-gps-jitter','ctrl-speed-noise','ctrl-add-stops','ctrl-warmup','ctrl-target-hr', 'ctrl-pacing-strategy'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => displayModifiedPreview(), 200); });
        el.addEventListener('change', () => { clearTimeout(timer); timer = setTimeout(() => displayModifiedPreview(), 100); });
      }
    });
  }

  function bindSlider(id, valId, formatter) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      updateControlValue(valId, formatter(e.target.value));
    });
  }

  function onRouteCalculated(routeData) {
    if (!routeData) return;
    state.routeData = routeData;
    
    const trackpoints = RouteEngine.generateTrackpointsFromRoute(
      routeData.coordinates,
      state.sport,
      18
    );
    
    state.originalTrackpoints = trackpoints;
    displayModifiedPreview();
  }

  function getModifiedTrackpoints() {
    if (!state.originalTrackpoints || state.originalTrackpoints.length === 0) return [];
    let tps = [...state.originalTrackpoints.map(tp => ({ ...tp, position: tp.position ? { ...tp.position } : null }))];

    const trimStart = parseFloat($('ctrl-trim-start').value), trimEnd = parseFloat($('ctrl-trim-end').value);
    if (trimStart > 0 || trimEnd < 100) tps = RouteEngine.trimRoute(tps, trimStart, trimEnd);
    if ($('ctrl-reverse').checked) tps = RouteEngine.reverseRoute(tps);
    const loopCount = parseInt($('ctrl-loop-count').value);
    if (loopCount > 1) tps = RouteEngine.loopRoute(tps, loopCount);

    const newStart = $('ctrl-start-time').value;
    if (newStart) {
      try {
        const d = new Date(newStart);
        if (!isNaN(d.getTime())) tps = RouteEngine.timeShift(tps, d.toISOString());
      } catch(e) {}
    }

    const elev = parseFloat($('ctrl-elev-offset').value);
    if (elev !== 0) tps = RouteEngine.elevationOffset(tps, elev);

    
    const laneOffset = parseFloat($('ctrl-sidewalk-offset') ? $('ctrl-sidewalk-offset').value : 0);
    if (laneOffset !== 0) tps = RouteEngine.applyLaneOffset(tps, laneOffset);

    const pacingEl = $('ctrl-pacing-strategy');
    const pacingVal = pacingEl ? pacingEl.value : 'even';
    const targetSpeedKmh = parseFloat($('ctrl-target-speed').value);

    tps = RealismEngine.applyAll(tps, {
      gpsJitter: parseFloat($('ctrl-gps-jitter').value) / 100,
      speedVariance: parseFloat($('ctrl-speed-noise').value) / 100,
      addStops: $('ctrl-add-stops').checked,
      warmupCooldown: $('ctrl-warmup').checked,
      sport: state.sport,
      pacingStrategy: pacingVal,
      targetSpeedKmh: targetSpeedKmh,
    });

    tps = RouteEngine.scaleToTargetSpeed(tps, targetSpeedKmh);

    // Heart Rate
    if ($('ctrl-hr-enabled').checked) {
      tps = HeartRateEngine.generateHeartRate(tps, {
        sport: state.sport,
        maxHR: parseInt($('ctrl-max-hr').value),
        restingHR: parseInt($('ctrl-resting-hr').value),
      });
      const targetHR = parseFloat($('ctrl-target-hr').value);
      const targetMaxHR = parseFloat($('ctrl-max-hr').value);
      tps = HeartRateEngine.scaleToTargetHR(tps, targetHR, targetMaxHR);
    }

    // Cadence
    const cadenceEnabled = $('ctrl-cadence-enabled');
    if (cadenceEnabled && cadenceEnabled.checked) {
      tps = CadenceEngine.generateCadence(tps, { sport: state.sport });
      // For running/walking, move cadence to runCadence (TCX spec)
      if (state.sport === 'Running' || state.sport === 'Walking') {
        tps = tps.map(tp => {
          const c = tp.cadence;
          return { ...tp, position: tp.position ? { ...tp.position } : null, runCadence: c, cadence: null };
        });
      }
    }

    // Power
    const powerEnabled = $('ctrl-power-enabled');
    if (powerEnabled && powerEnabled.checked) {
      const riderWeight = parseFloat($('ctrl-rider-weight') ? $('ctrl-rider-weight').value : 72);
      tps = PowerEngine.generatePower(tps, {
        sport: state.sport,
        riderMassKg: riderWeight,
      });
    }

    return tps;
  }

  function calcStats(tps) {
    if (tps.length < 2) return null;
    let dist = 0;
    let movingTimeMs = 0;
    let maxSpeedKmh = 0;
    let startTimeMs = 0, endTimeMs = 0, totalTimeSec = 0;
    try {
      startTimeMs = new Date(tps[0].time).getTime();
      endTimeMs = new Date(tps[tps.length-1].time).getTime();
      if (isNaN(startTimeMs) || isNaN(endTimeMs)) throw new Error('no time');
      totalTimeSec = (endTimeMs - startTimeMs) / 1000;
    } catch(e) {
      let totalDist = 0;
      for (let i = 1; i < tps.length; i++) {
        if (tps[i].position && tps[i-1].position) {
          totalDist += RouteEngine.haversineDistance(
            tps[i-1].position.latitudeDegrees, tps[i-1].position.longitudeDegrees,
            tps[i].position.latitudeDegrees, tps[i].position.longitudeDegrees
          );
        }
      }
      const targetSpeedMs = parseFloat($('ctrl-target-speed').value) / 3.6;
      totalTimeSec = targetSpeedMs > 0 ? totalDist / targetSpeedMs : 0;
    }
    
    let elevGain = 0;
    let prevAlt = tps[0].altitudeMeters;

    for (let i = 1; i < tps.length; i++) {
      if (tps[i].position && tps[i-1].position) {
        const d = RouteEngine.haversineDistance(
          tps[i-1].position.latitudeDegrees, tps[i-1].position.longitudeDegrees,
          tps[i].position.latitudeDegrees, tps[i].position.longitudeDegrees
        );
        dist += d;
        
        let dt = 0;
        try { dt = new Date(tps[i].time).getTime() - new Date(tps[i-1].time).getTime(); if (isNaN(dt)) dt = 0; } catch(e) { dt = 0; }
        const speedKmh = tps[i].speed ? tps[i].speed * 3.6 : (dt > 0 ? (d / (dt/1000)) * 3.6 : 0);
        
        if (speedKmh > 1.8) {
          movingTimeMs += dt;
        }
        if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
      }
      
      if (tps[i].altitudeMeters != null) {
        if (prevAlt != null && tps[i].altitudeMeters > prevAlt) {
          elevGain += (tps[i].altitudeMeters - prevAlt);
        }
        prevAlt = tps[i].altitudeMeters;
      }
    }

    const avgSpeedKmh = totalTimeSec > 0 ? (dist / totalTimeSec) * 3.6 : 0;
    
    return {
      distanceKm: dist / 1000,
      totalTimeSec: totalTimeSec,
      movingTimeSec: movingTimeMs / 1000,
      avgSpeedKmh: avgSpeedKmh,
      maxSpeedKmh: maxSpeedKmh,
      elevGain: elevGain
    };
  }

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function displayOriginalStats() {
    if (!state.parsedData) return;
    const stats = calcStats(state.originalTrackpoints);
    
    if (stats) {
      $('stat-distance').innerHTML = `${stats.distanceKm.toFixed(2)}<span class="stat-unit">km</span>`;
      $('stat-duration').textContent = formatDuration(stats.totalTimeSec);
      if ($('stat-moving-time')) $('stat-moving-time').textContent = formatDuration(stats.movingTimeSec);
      
      const fAvg = formatSpeedUI(stats.avgSpeedKmh);
      $('stat-avg-speed').innerHTML = `${fAvg.val}<span class="stat-unit">${fAvg.unit}</span>`;
      
      if ($('stat-max-speed')) {
        const fMax = formatSpeedUI(stats.maxSpeedKmh);
        $('stat-max-speed').innerHTML = `${fMax.val}<span class="stat-unit">${fMax.unit}</span>`;
      }
      
      $('stat-elev-gain').innerHTML = `${Math.round(stats.elevGain)}<span class="stat-unit">m</span>`;
    }
  }

  function displayModifiedPreview() {
    const tps = getModifiedTrackpoints();
        
    if (tps.length === 0) return;

    const stats = calcStats(tps);
    if (stats) {
      $('mod-distance').innerHTML = `${stats.distanceKm.toFixed(2)}<span class="stat-unit">km</span>`;
      $('mod-duration').textContent = formatDuration(stats.totalTimeSec);
      if ($('mod-moving-time')) $('mod-moving-time').textContent = formatDuration(stats.movingTimeSec);
      
      const fAvg = formatSpeedUI(stats.avgSpeedKmh);
      $('mod-avg-speed').innerHTML = `${fAvg.val}<span class="stat-unit">${fAvg.unit}</span>`;
      
      if ($('mod-max-speed')) {
        const fMax = formatSpeedUI(stats.maxSpeedKmh);
        $('mod-max-speed').innerHTML = `${fMax.val}<span class="stat-unit">${fMax.unit}</span>`;
      }

      let totalHr = 0, countHr = 0;
      tps.forEach(tp => {
        if (tp.heartRateBpm) { totalHr += tp.heartRateBpm; countHr++; }
      });
      const avgHr = countHr > 0 ? Math.round(totalHr / countHr) : '--';
      $('mod-avg-hr').innerHTML = `${avgHr}<span class="stat-unit">bpm</span>`;
    }

    MapPreview.displayRoute(tps, 'modified');
    $('btn-generate').disabled = false;
  }

  function clearStats() {
    ['stat-distance','stat-duration','stat-moving-time','stat-avg-speed','stat-max-speed','stat-elev-gain',
     'mod-distance','mod-duration','mod-moving-time','mod-avg-speed','mod-max-speed','mod-avg-hr'].forEach(id => {
      const el = $(id);
      if(el) el.innerHTML = '--';
    });
    $('btn-generate').disabled = true;
  }

  function updateControlValue(id, text) { const el = $(id); if (el) el.textContent = text; }
  function updateStatus(text) { const el = $('status-text'); if (el) el.textContent = text; }
  function showToast(msg, type='success') {
    const t = $('toast'), i = $('toast-icon'), m = $('toast-message');
    if (!t) return;
    t.className = `toast ${type}`; i.textContent = type === 'success' ? '✓' : '✕'; m.textContent = msg;
    t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { init };
})();
