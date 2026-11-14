import { readFile, writeFile, mkdir } from 'node:fs/promises';
const out = 'docs/images';
await mkdir(out, { recursive: true });
const css = await readFile('public/css/style.css', 'utf8');
const logo = (await readFile('public/assets/images/team-logo.png')).toString('base64');
let html = await readFile('public/index.html', 'utf8');
html = html
  .replace(
    '<link rel="stylesheet" href="/css/style.css" />',
    `<style>${css}\n*{animation:none!important;transition:none!important}header:after{content:'ILLUSTRATIVE DEMO — SAMPLE DATA';font-size:11px;color:#087d72;font-weight:700}main{padding-bottom:16px}</style>`,
  )
  .replace('src="/assets/images/team-logo.png"', `src="data:image/png;base64,${logo}"`)
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
const values = {
  connection: '● Server connected · demo',
  height: '75.5 cm',
  water: '42.0 %',
  distance: '95.5 cm',
  sensorNotice: 'Illustrative demo: all sensor readings and weather values below are sample data.',
  waterHint: 'Water detected · automatic target: Up',
  waterRaw: 'Raw ADC: 520',
  modeLabel: 'ESP32 local sensor control with optional dashboard buttons',
  liftCommandState: 'Lifting up · will stop at the upper limit or when stopped',
  liftStatus: 'House is lifting',
  liftDetail: 'Upward movement reported by controller · sample reading',
  sceneHeight: '75.5 cm elevation',
  sensorBadge: '● Sensor online · demo',
  temperature: '28.0 °C',
  weatherDescription: 'Rain / drizzle · sample weather',
  rain: '2.4 mm',
  wind: '11.2 km/h',
  humidity: '82.0 %',
  river: '120.0 m³/s',
  weatherTime: 'Illustrative weather values — not a live forecast',
  lastReading: 'Sample sensor reading · demonstration only',
};
html = html.replace(
  '</body>',
  `<script>for(const [id,value] of Object.entries(${JSON.stringify(values)})){document.getElementById(id).textContent=value}document.getElementById('waterBar').style.width='42%';document.getElementById('sceneWater').style.height='43px';document.getElementById('house').style.transform='translateY(-24px)';document.getElementById('sensorNotice').classList.add('good');</script></body>`,
);
await writeFile(`${out}/dashboard-demo.html`, html);
const svg = [];
svg.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1280" viewBox="0 0 1800 1280"><defs><style>text{font-family:Segoe UI,Arial,sans-serif;fill:#17343d}.title{font-size:36px;font-weight:700}.sub{font-size:18px;fill:#526e76}.head{font-size:23px;font-weight:700}.label{font-size:19px}.small{font-size:16px}.pin{font-size:19px;font-weight:600}.wire{fill:none;stroke:#087d72;stroke-width:3}.box{fill:white;stroke:#b9cdd2;stroke-width:2}.ground{stroke:#667b86;stroke-width:3;fill:none}</style></defs><rect width="1800" height="1280" fill="#f5f8fa"/><text x="60" y="70" class="title">FLOOD Lifting House — Circuit &amp; connections</text><text x="60" y="105" class="sub">ESP32-WROOM-32 · BTS7960 syringe lift · current firmware wiring · GPIO numbers, not physical pin positions</text>`,
);
function text(x, y, s, c = 'label') {
  svg.push(`<text x="${x}" y="${y}" class="${c}">${s}</text>`);
}
function box(x, y, w, h, title) {
  svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" class="box"/>`);
  text(x + 22, y + 36, title, 'head');
}
function wire(points) {
  svg.push(`<polyline points="${points}" class="wire"/>`);
}
function dot(x, y) {
  svg.push(`<circle cx="${x}" cy="${y}" r="5" fill="#087d72"/>`);
}
function ground(x, y) {
  svg.push(`<path d="M${x} ${y}v12m-16 0h32m-24 7h16m-12 7h8" class="ground"/>`);
}
box(710, 190, 390, 780, 'ESP32-WROOM-32');
text(735, 262, '3.3 V GPIO logic', 'sub');
box(60, 190, 440, 160, 'SH1106 OLED · I²C');
text(82, 265, 'SDA');
text(82, 305, 'SCL');
text(82, 333, 'VCC → 3V3 · GND → common GND', 'small');
wire('500,260 710,260');
text(545, 246, 'GPIO21', 'pin');
wire('500,302 710,302');
text(545, 289, 'GPIO22', 'pin');
box(60, 400, 440, 150, 'Water-level sensor');
text(82, 473, 'AO (0–3.3 V)');
text(82, 521, 'VCC → 3V3 · GND → common GND', 'small');
wire('500,478 710,478');
text(545, 465, 'GPIO34', 'pin');
box(60, 600, 440, 290, 'HC-SR04 ultrasonic');
text(82, 675, 'TRIG');
text(82, 730, 'ECHO (5 V)');
text(82, 860, 'VCC → 5 V · GND → common GND', 'small');
wire('500,675 710,675');
text(545, 660, 'GPIO18', 'pin');
wire('300,730 360,730');
svg.push(
  '<rect x="360" y="719" width="68" height="22" fill="#fff5d9" stroke="#b0852a" stroke-width="2"/>',
);
text(364, 708, '1 kΩ', 'small');
wire('428,730 710,730');
dot(540, 730);
text(575, 717, 'GPIO19', 'pin');
wire('540,730 540,770');
svg.push(
  '<rect x="529" y="770" width="22" height="55" fill="#fff5d9" stroke="#b0852a" stroke-width="2"/>',
);
text(566, 802, '2 kΩ', 'small');
wire('540,825 540,840');
ground(540, 840);
text(568, 845, 'GND', 'small');
box(1250, 190, 490, 380, 'BTS7960 motor driver');
for (const [y, pin, label] of [
  [270, 25, 'RPWM'],
  [315, 26, 'LPWM'],
  [360, 27, 'R_EN'],
  [405, 14, 'L_EN'],
]) {
  wire(`1100,${y} 1250,${y}`);
  text(1114, y - 12, `GPIO${pin}`, 'pin');
  text(1272, y + 6, label);
}
text(1272, 450, 'VCC → regulated 5 V · GND → common GND', 'small');
text(1272, 487, 'B+ / B− → motor-rated DC supply', 'label');
text(1272, 528, 'M+ / M− → syringe actuator motor', 'label');
box(1250, 610, 490, 150, 'Physical Up / Down pushbuttons');
wire('1100,670 1370,670');
text(1114, 656, 'GPIO15', 'pin');
text(1272, 696, 'UP', 'small');
svg.push('<path d="M1370 670h22m0 0l42 -15m0 15h22" class="ground"/>');
wire('1456,670 1480,670');
ground(1480, 670);
wire('1100,720 1580,720');
text(1114, 706, 'GPIO33', 'pin');
text(1500, 700, 'DOWN', 'small');
svg.push('<path d="M1580 720h22m0 0l42 -15m0 15h22" class="ground"/>');
wire('1666,720 1690,720');
ground(1690, 720);
box(1250, 800, 490, 160, 'Travel-limit switches · normally open');
wire('1100,862 1435,862');
text(1114, 847, 'GPIO16', 'pin');
text(1272, 888, 'UPPER', 'small');
svg.push('<path d="M1435 862h22m0 0l42 -15m0 15h22" class="ground"/>');
wire('1521,862 1540,862');
ground(1540, 862);
wire('1100,917 1580,917');
text(1114, 902, 'GPIO4', 'pin');
text(1475, 900, 'LOWER', 'small');
svg.push('<path d="M1580 917h22m0 0l42 -15m0 15h22" class="ground"/>');
wire('1666,917 1690,917');
ground(1690, 917);
text(735, 850, 'GPIO23 → buzzer driver IN', 'pin');
text(735, 882, 'Active-HIGH buzzer', 'label');
text(735, 916, 'Driver GND → common GND', 'small');
box(60, 1000, 1680, 210, 'Power, networking &amp; operating notes');
text(
  82,
  1070,
  'POWER: ESP32 via USB / regulated board supply. Motor supply is separate; connect all grounds together.',
);
text(
  82,
  1105,
  'BUTTONS: INPUT_PULLUP · pressed = LOW. Release GPIO15 button during boot (strapping pin). GPIO20 is unavailable.',
);
text(
  82,
  1140,
  'NETWORK: ESP32 ⇄ 2.4 GHz Wi-Fi router ⇄ Node.js server /api/esp ⇄ browser dashboard',
);
text(
  82,
  1175,
  'CONTROL: water &gt; 0% → Up · water = 0% → Down · press active direction again to Stop · travel limits always apply.',
);
text(
  60,
  1250,
  'Connection diagram, not a PCB layout. Never connect 5 V ECHO directly to GPIO19. Use a suitable buzzer driver for loads above GPIO ratings.',
  'small',
);
svg.push('</svg>');
await writeFile(`${out}/circuit-diagram.svg`, svg.join('\n'));
await writeFile(
  `${out}/circuit-diagram.html`,
  '<!doctype html><meta charset="utf-8"><style>body{margin:0}</style>' + svg.join('\n'),
);
console.log('Prepared circuit diagram SVG and actual-dashboard demo HTML.');
