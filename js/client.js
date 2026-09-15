document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('order-form');
  
  // Set default datetime to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('start-time').value = now.toISOString().slice(0, 16);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const data = {
      name: document.getElementById('client-name').value,
      sport: document.getElementById('sport-type').value,
      time: document.getElementById('start-time').value,
      dist: document.getElementById('target-dist').value,
      pace: document.getElementById('target-pace').value,
      route: document.getElementById('route-desc').value,
      device: document.getElementById('spoof-device').value,
      avgHr: document.getElementById('avg-hr').value,
      maxHr: document.getElementById('max-hr').value,
      stops: document.getElementById('add-stops').checked ? 'Yes' : 'No'
    };

    // Format date nicer
    const dateObj = new Date(data.time);
    const dateStr = dateObj.toLocaleString('en-GB', { 
      weekday: 'short', day: 'numeric', month: 'short', 
      hour: '2-digit', minute:'2-digit' 
    });

    const message = `*New Activity Request* 🏃‍♂️🚴‍♀️
---------------------------
*Name:* ${data.name}
*Sport:* ${data.sport}
*Date/Time:* ${dateStr}

*Target Distance:* ${data.dist} km
*Target Pace/Speed:* ${data.pace}
*Route Details:* ${data.route}

*Device Spoof:* ${data.device}
*Heart Rate:* ${data.avgHr} Avg / ${data.maxHr} Max
*Natural Stops:* ${data.stops}
---------------------------
Mohon diproses ya kak! 🙏`;

    // Replace with the actual WhatsApp number (e.g. 628123456789)
    const waNumber = "6285795603927"; 
    const encodedMessage = encodeURIComponent(message);
    const waUrl = `https://wa.me/${waNumber}?text=${encodedMessage}`;

    window.open(waUrl, '_blank');
  });
});