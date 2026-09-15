const TCXParser = require('./js/tcx-parser.js');
const TCXGenerator = require('./js/tcx-generator.js');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
const xmlString = fs.readFileSync('C:/Users/ridwa/.gemini/antigravity-ide/brain/cdccf415-4f82-4e70-9408-c0e14fa350e3/scratch/Bersepeda_Pagi.tcx', 'utf8');
TCXParser.parse(xmlString).then(data => {
  const generated = TCXGenerator.generate(data, { creator: 'Garmin Forerunner 945' });
  console.log(generated.substring(generated.length - 800));
});
