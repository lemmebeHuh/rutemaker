with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add weight input near average speed or somewhere in parameters
search_str = '''        <div class="form-group">
          <label>Max Speed (km/h) <span>Opsional limit maksimal</span></label>
          <input type="number" id="ctrl-max-speed" placeholder="Misal: 35" min="1" max="150" step="0.5">
        </div>'''

replacement = '''        <div class="form-group">
          <label>Max Speed (km/h) <span>Opsional limit maksimal</span></label>
          <input type="number" id="ctrl-max-speed" placeholder="Misal: 35" min="1" max="150" step="0.5">
        </div>
        <div class="form-group">
          <label>Berat Badan (kg) <span>Untuk kalori & power</span></label>
          <input type="number" id="ctrl-weight" value="70" min="30" max="150" step="1">
        </div>'''

if search_str in content:
    content = content.replace(search_str, replacement)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print("index.html updated with weight input.")
else:
    print("Could not find search string in index.html.")
