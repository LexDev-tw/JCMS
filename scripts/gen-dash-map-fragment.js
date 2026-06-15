const fs = require('fs');

const preview = fs.readFileSync('d:/JCMS2/public/previews/dashboard-map-overview-preview.html', 'utf8');
const shellMatch = preview.match(/<div id="map-canvas"[\s\S]*?<p class="map-zoom-hint">[\s\S]*?<\/p>/);
if (!shellMatch) throw new Error('shell not found');

let html = shellMatch[0];
html = html.replace('id="map-canvas"', 'id="dash-map-canvas"');
html = html.replace(/>\s*4\s*</g, '>{{ dashStats.newlyReceived }}<');
// too risky for global replace - do manual vue template instead

const out = `<!-- generated fragment - use JCMS inline template -->
${html}`;
fs.writeFileSync('d:/JCMS2/public/partials/dashboard-map-view.fragment.html', out);
console.log('fragment len', out.length);
