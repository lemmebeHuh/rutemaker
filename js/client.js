document.addEventListener('DOMContentLoaded', () => {
  const steps = document.querySelectorAll('.step-card');
  const btnNext = document.getElementById('btn-next');
  const btnBack = document.getElementById('btn-back');
  const progressBar = document.getElementById('progress-bar');
  const stepIndicator = document.getElementById('step-indicator');
  
  let currentStep = 1;
  const totalSteps = steps.length;

  // Set default datetime
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('start-time').value = now.toISOString().slice(0, 16);

  // Toggle HR inputs
  document.getElementById('add-hr').addEventListener('change', (e) => {
    document.getElementById('hr-inputs').style.display = e.target.checked ? 'block' : 'none';
  });

  // Toggle Pace hint
  document.getElementById('sport-type').addEventListener('change', (e) => {
    const label = document.getElementById('pace-label');
    if (e.target.value === 'Running' || e.target.value === 'Walking') {
      label.innerText = 'Target Pace (e.g., 5:30)';
    } else {
      label.innerText = 'Target Speed (e.g., 25 km/h)';
    }
    updateLivePrice();
  });

  // Attach live update listeners for Step 3
  const distInput = document.getElementById('target-dist');
  const paceInput = document.getElementById('target-pace');
  const sportType = document.getElementById('sport-type');

  distInput.addEventListener('input', updateLivePrice);

  paceInput.addEventListener('input', function(e) {
    if (sportType.value === 'Running' || sportType.value === 'Walking') {
      let val = this.value.replace(/[^0-9]/g, '');
      if (val.length >= 3) {
        val = val.substring(0, val.length - 2) + ':' + val.substring(val.length - 2);
      }
      this.value = val;
    }
    updateLivePrice();
  });

  function updateUI() {
    steps.forEach(step => {
      const stepNum = parseInt(step.getAttribute('data-step'));
      if (stepNum === currentStep) {
        step.className = 'step-card active';
      } else if (stepNum < currentStep) {
        step.className = 'step-card past';
      } else {
        step.className = 'step-card';
      }
    });

    const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;
    progressBar.style.setProperty('--progress', progress + '%');
    stepIndicator.innerText = `Step ${currentStep} of ${totalSteps}`;

    btnBack.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    
    if (currentStep === totalSteps) {
      btnNext.innerText = 'Order via WhatsApp';
      btnNext.className = 'nav-btn btn-success';
      calculatePrice();
    } else {
      btnNext.innerText = 'Next';
      btnNext.className = 'nav-btn btn-primary';
    }

    if (currentStep === 3) {
      updateLivePrice();
      document.getElementById('live-cost-container').style.opacity = '1';
    }
  }

  function parsePace(paceStr) {
    if (!paceStr || !paceStr.includes(':')) return 99; // Default safe value
    const parts = paceStr.split(':');
    const mins = parseInt(parts[0]) || 0;
    const secs = parseInt(parts[1]) || 0;
    return mins + (secs / 60);
  }

  function computeCosts() {
    const sport = document.getElementById('sport-type').value;
    const dist = parseFloat(document.getElementById('target-dist').value) || 0;
    const paceStr = document.getElementById('target-pace').value;
    const device = document.getElementById('spoof-device').value;
    const addHr = document.getElementById('add-hr').checked;

    let base = 25000;
    let distSurcharge = 0;
    let paceSurcharge = 0;
    let deviceSurcharge = 0;
    let hrSurcharge = 0;

    // Distance surcharge: +10k per 5km over 15km
    if (dist > 15) {
      const extraDist = dist - 15;
      distSurcharge = Math.ceil(extraDist / 5) * 10000;
    }

    // Pace surcharge (Running only)
    if (sport === 'Running') {
      const paceDecimal = parsePace(paceStr);
      if (paceDecimal < 4.5) {
        paceSurcharge = 20000;
      } else if (paceDecimal < 5.5) {
        paceSurcharge = 10000;
      }
    }

    // Device Surcharge
    if (device && device.includes('Garmin')) {
      deviceSurcharge = 4000;
    }

    // HR Surcharge
    if (addHr) {
      hrSurcharge = 5000;
    }

    const total = base + distSurcharge + paceSurcharge + deviceSurcharge + hrSurcharge;
    return { base, distSurcharge, paceSurcharge, deviceSurcharge, hrSurcharge, total };
  }

  function formatRp(num) {
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function updateLivePrice() {
    const costs = computeCosts();
    
    // Live update for step 3
    const liveDistEl = document.getElementById('live-dist');
    const livePaceEl = document.getElementById('live-pace');
    const liveSubtotalEl = document.getElementById('live-subtotal');
    
    if (liveDistEl) {
      liveDistEl.innerText = '+' + formatRp(costs.distSurcharge);
      livePaceEl.innerText = '+' + formatRp(costs.paceSurcharge);
      
      const subtotal = costs.base + costs.distSurcharge + costs.paceSurcharge;
      liveSubtotalEl.innerText = formatRp(subtotal);
    }
  }

  function calculatePrice() {
    const costs = computeCosts();

    document.getElementById('sum-base').innerText = formatRp(costs.base);
    document.getElementById('sum-dist').innerText = '+' + formatRp(costs.distSurcharge);
    document.getElementById('sum-pace').innerText = '+' + formatRp(costs.paceSurcharge);
    document.getElementById('sum-device').innerText = '+' + formatRp(costs.deviceSurcharge);
    document.getElementById('sum-hr').innerText = '+' + formatRp(costs.hrSurcharge);
    document.getElementById('sum-total').innerText = formatRp(costs.total);

    window.currentInvoiceTotal = formatRp(costs.total);
  }

  function validateStep() {
    const currentCard = document.querySelector(`.step-card[data-step="${currentStep}"]`);
    const inputs = currentCard.querySelectorAll('input[required], textarea[required], select[required]');
    
    for (let input of inputs) {
      if (!input.value.trim()) {
        input.focus();
        // Visual shake effect
        input.style.transform = 'translateX(5px)';
        setTimeout(() => input.style.transform = 'translateX(-5px)', 100);
        setTimeout(() => input.style.transform = 'translateX(5px)', 200);
        setTimeout(() => input.style.transform = 'translateX(0)', 300);
        return false;
      }
    }
    return true;
  }

  btnNext.addEventListener('click', () => {
    if (currentStep < totalSteps) {
      if (validateStep()) {
        currentStep++;
        updateUI();
      }
    } else {
      // Send WhatsApp
      sendWhatsApp();
    }
  });

  btnBack.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      updateUI();
    }
  });

  function sendWhatsApp() {
    const name = document.getElementById('client-name').value;
    const sport = document.getElementById('sport-type').value;
    const time = document.getElementById('start-time').value;
    const dist = document.getElementById('target-dist').value;
    const pace = document.getElementById('target-pace').value;
    const route = document.getElementById('route-desc').value;
    const device = document.getElementById('spoof-device').value;
    const addHr = document.getElementById('add-hr').checked;
    const avgHr = document.getElementById('avg-hr').value;
    const maxHr = document.getElementById('max-hr').value;

    const dateObj = new Date(time);
    const dateStr = dateObj.toLocaleString('en-GB', { 
      weekday: 'short', day: 'numeric', month: 'short', 
      hour: '2-digit', minute:'2-digit' 
    });

    let message = `*New Activity Request* 🏃‍♂️🚴‍♀️
---------------------------
*Name:* ${name}
*Sport:* ${sport}
*Date:* ${dateStr}

*Distance:* ${dist} km
*Pace/Speed:* ${pace}
*Route:* ${route}

*Device:* ${device}`;

    if (addHr) {
      message += `\n*Heart Rate:* ${avgHr} Avg / ${maxHr} Max`;
    }

    message += `\n---------------------------
*TOTAL BIAYA:* ${window.currentInvoiceTotal}
---------------------------
Mohon diproses ya kak! 🙏`;

    const waNumber = "6285795603927"; 
    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${waNumber}?text=${encodedMessage}`;
    window.open(waUrl, '_blank');
  }

  // Init
  updateUI();
});
