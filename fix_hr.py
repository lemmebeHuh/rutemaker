with open('js/heart-rate-engine.js', 'r', encoding='utf-8') as f:
    content = f.read()

search_str = 'const efforts = trackpoints.map(tp => speedToEffort(tp.speed || 0, effortProfile));'
replacement = '''const efforts = trackpoints.map((tp, i) => {
      let speed = tp.speed || 0;
      let slope = 0;
      if (i > 0 && tp.altitudeMeters != null && trackpoints[i - 1].altitudeMeters != null) {
        const altDiff = tp.altitudeMeters - trackpoints[i - 1].altitudeMeters;
        const timeDiff = (new Date(tp.time).getTime() - new Date(trackpoints[i - 1].time).getTime()) / 1000;
        if (timeDiff > 0) {
          const dist = speed * timeDiff;
          if (dist > 0.5) slope = altDiff / dist;
        }
      }
      slope = Math.max(-0.15, Math.min(0.15, slope));
      
      let equivalentSpeed = speed;
      if (sport === 'Biking') {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 15);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 8);
      } else if (sport === 'Running') {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 8);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 4);
      } else {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 5);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 3);
      }
      return speedToEffort(equivalentSpeed, effortProfile);
    });'''

if search_str in content:
    content = content.replace(search_str, replacement)
    with open('js/heart-rate-engine.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Heart Rate Engine updated.")
else:
    print("Search string not found.")
