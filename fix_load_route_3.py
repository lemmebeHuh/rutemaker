with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

bad_str = 'updateModifiedStats(act.tps);'
good_str = '''const tps = act.tps;
        const stats = calcStats(tps);
        if (stats) {
          const setHtml = (i, h) => { const el = document.getElementById(i); if (el) el.innerHTML = h; };
          const setTxt = (i, t) => { const el = document.getElementById(i); if (el) el.textContent = t; };

          setHtml('mod-distance', ${stats.distanceKm.toFixed(2)}<span class="stat-unit">km</span>);
          setTxt('mod-duration', formatDuration(stats.totalTimeSec));
          setTxt('mod-moving-time', formatDuration(stats.movingTimeSec));
          
          const fAvg = formatSpeedUI(stats.avgSpeedKmh);
          setHtml('mod-avg-speed', ${fAvg.val}<span class="stat-unit"></span>);
          
          if (document.getElementById('mod-max-speed')) {
            const fMax = formatSpeedUI(stats.maxSpeedKmh);
            setHtml('mod-max-speed', ${fMax.val}<span class="stat-unit"></span>);
          }

          let totalHr = 0, countHr = 0;
          tps.forEach(tp => {
            if (tp.heartRateBpm) { totalHr += tp.heartRateBpm; countHr++; }
          });
          const avgHr = countHr > 0 ? Math.round(totalHr / countHr) : '--';
          setHtml('mod-avg-hr', ${avgHr}<span class="stat-unit">bpm</span>);
        }

        MapPreview.displayRoute(act.tps, 'modified');
        const genBtn = document.getElementById('btn-generate');
        if (genBtn) genBtn.disabled = false;'''

content = content.replace(bad_str, good_str)

import re
content = re.sub(r'src="js/app\.js\?v=\d+"', 'src="js/app.js?v=18"', content)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

with open('foisd9.html', 'r', encoding='utf-8') as f:
    html = f.read()
html = re.sub(r'src="js/app\.js\?v=\d+"', 'src="js/app.js?v=18"', html)
with open('foisd9.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Finally actually fixed updateModifiedStats.")
