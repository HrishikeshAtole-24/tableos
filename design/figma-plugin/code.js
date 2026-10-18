// TableOS Screens — builds the product screens in the "TableOS — Product Design" file from the
// design-system components and variables on page "01 Foundations & Components".
// Run: Figma desktop → Plugins → Development → Import plugin from manifest… → pick this folder's
// manifest.json, open the TableOS file, then Plugins → Development → TableOS Screens.
// Safe to re-run: screens it created before are replaced.

const PHOTO = (id, w = 640) => `https://images.unsplash.com/photo-${id}?w=${w}&q=70&auto=format&fit=crop`;
const PHOTOS = {
  paneer: '1567188040759-fb8a883dc6d8',
  biryani: '1589302168068-964664d93dc0',
  dosa: '1668236543090-82eba5ee5976',
  tandoori: '1626074353765-517a681e40be',
  pavbhaji: '1606491956689-2ea866880c84',
  samosa: '1601050690597-df0568f70950',
  thali: '1546833999-b9f581a1996d',
  shake: '1505252585461-04db1eb84625',
};

const errors = [];
let V = {};
let TS = {};
let ES = {};
let C = {};
const imageCache = {};

async function setup() {
  const fonts = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold'];
  await Promise.all(fonts.map((s) => figma.loadFontAsync({ family: 'Outfit', style: s })));
  for (const v of await figma.variables.getLocalVariablesAsync()) V[v.name] = v;
  for (const s of await figma.getLocalTextStylesAsync()) TS[s.name] = s;
  for (const s of await figma.getLocalEffectStylesAsync()) ES[s.name] = s;
  const libPage = figma.root.children[0];
  await libPage.loadAsync();
  for (const n of libPage.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
    if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
    C[n.name] = n;
  }
  const needed = ['Button', 'DietMark', 'Tag', 'FilterChip', 'AddButton', 'CartBar', 'DishCard', 'SearchBar', 'StatusStepper'];
  const missing = needed.filter((n) => !C[n]);
  if (missing.length) throw new Error('Missing components on page 1: ' + missing.join(', '));
}

// ───────── helpers ─────────
const P = (name) => {
  if (!V[name]) return { type: 'SOLID', color: { r: 1, g: 0, b: 1 } };
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V[name]);
};
const HEX = (hex, opacity = 1) => {
  const v = parseInt(hex.slice(1), 16);
  return { type: 'SOLID', color: { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 }, opacity };
};
async function T(chars, style, color = 'text/primary', opts = {}) {
  const t = figma.createText();
  if (TS[style]) await t.setTextStyleIdAsync(TS[style].id);
  t.characters = chars;
  t.fills = [typeof color === 'string' && color.startsWith('#') ? HEX(color) : P(color)];
  if (opts.size) t.fontSize = opts.size;
  if (opts.width) {
    t.textAutoResize = 'HEIGHT';
    t.resize(opts.width, t.height);
  }
  return t;
}
function AL(dir, props = {}) {
  const f = figma.createAutoLayout(dir, props);
  f.fills = [];
  return f;
}
function add(parent, child, fill) {
  parent.appendChild(child);
  if (fill === 'h' || fill === true) child.layoutSizingHorizontal = 'FILL';
  if (fill === 'grow') child.layoutGrow = 1;
  return child;
}
function variant(setName, variantName) {
  const set = C[setName];
  const comp = set.type === 'COMPONENT_SET' ? set.children.find((c) => c.name === variantName) || set.defaultVariant : set;
  return comp.createInstance();
}
function setProp(inst, prefix, value) {
  const k = Object.keys(inst.componentProperties).find((x) => x.startsWith(prefix));
  if (k) inst.setProperties({ [k]: value });
  return inst;
}
function button(label, v = 'primary', size = 'md') {
  return setProp(variant('Button', `variant=${v}, size=${size}`), 'Label', label);
}
function card(props = {}) {
  const c = AL('VERTICAL', Object.assign({ itemSpacing: 12, paddingLeft: 20, paddingRight: 20, paddingTop: 20, paddingBottom: 20 }, props));
  c.fills = [P('surface/raised')];
  c.cornerRadius = props.radius || 16;
  c.strokes = [P('border/subtle')];
  c.strokeWeight = 1;
  return c;
}
function pill(bg, padX = 10, padY = 4, radius = 999) {
  const p = AL('HORIZONTAL', { paddingLeft: padX, paddingRight: padX, paddingTop: padY, paddingBottom: padY, counterAxisAlignItems: 'CENTER', itemSpacing: 6 });
  p.fills = [typeof bg === 'string' && bg.startsWith('#') ? HEX(bg) : P(bg)];
  p.cornerRadius = radius;
  return p;
}
function rect(w, h, fill, radius = 0) {
  const r = figma.createRectangle();
  r.resize(w, h);
  r.fills = [fill];
  r.cornerRadius = radius;
  return r;
}
async function photoFill(node, key) {
  try {
    if (!imageCache[key]) imageCache[key] = await figma.createImageAsync(PHOTO(PHOTOS[key]));
    node.fills = [{ type: 'IMAGE', imageHash: imageCache[key].hash, scaleMode: 'FILL' }];
  } catch (e) {
    node.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [{ position: 0, color: { r: 1, g: 0.78, b: 0.55, a: 1 } }, { position: 1, color: { r: 0.93, g: 0.42, b: 0.18, a: 1 } }] }];
  }
}
async function dish(parent, name, price, desc, photoKey, diet = 'veg') {
  const inst = C.DishCard.createInstance();
  add(parent, inst, 'h');
  setProp(inst, 'Name', name);
  setProp(inst, 'Price', price);
  setProp(inst, 'Description', desc);
  const photo = inst.findOne((n) => n.name === 'Photo');
  if (photo && photoKey) await photoFill(photo, photoKey);
  const mark = inst.findOne((n) => n.type === 'INSTANCE' && n.mainComponent && n.mainComponent.parent && n.mainComponent.parent.name === 'DietMark');
  if (mark && diet !== 'veg') {
    const target = C.DietMark.children.find((c) => c.name === `diet=${diet}`);
    if (target) mark.swapComponent(target);
  }
  return inst;
}
function phone(name, x, y, bg = 'surface/page') {
  const s = figma.createAutoLayout('VERTICAL', { name, itemSpacing: 0 });
  s.resize(390, 844);
  s.primaryAxisSizingMode = 'AUTO';
  s.counterAxisSizingMode = 'FIXED';
  s.fills = [P(bg)];
  s.cornerRadius = 32;
  s.clipsContent = true;
  s.x = x;
  s.y = y;
  if (ES['Elevation/Card']) s.effectStyleId = ES['Elevation/Card'].id;
  return s;
}
function desktop(name, x, y, w = 1440, h = 900, bg = 'surface/sunken') {
  const s = figma.createFrame();
  s.name = name;
  s.resize(w, h);
  s.fills = [P(bg)];
  s.cornerRadius = 16;
  s.clipsContent = true;
  s.x = x;
  s.y = y;
  return s;
}
async function label(parent, text, x, y, size = 28) {
  const t = await T(text, 'Heading/H1', 'text/secondary');
  t.fontSize = size;
  t.x = x;
  t.y = y;
  parent.appendChild(t);
  return t;
}

// ───────── Diner screens ─────────
async function dinerHeader(scr, table = 'Table T3') {
  const head = add(scr, AL('HORIZONTAL', { name: 'Header', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 10 }), 'h');
  const left = add(head, AL('HORIZONTAL', { itemSpacing: 12, counterAxisAlignItems: 'CENTER' }));
  const logo = figma.createAutoLayout('HORIZONTAL', { primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' });
  logo.resize(36, 36);
  logo.primaryAxisSizingMode = 'FIXED';
  logo.counterAxisSizingMode = 'FIXED';
  logo.cornerRadius = 10;
  logo.fills = [P('brand/primary')];
  logo.appendChild(await T('S', 'Title', 'text/inverse'));
  left.appendChild(logo);
  if (table) {
    const p = pill('surface/dark', 12, 6);
    p.appendChild(await T(table, 'Caption', 'text/inverse'));
    left.appendChild(p);
  }
  const right = add(head, AL('HORIZONTAL', { itemSpacing: 8, counterAxisAlignItems: 'CENTER' }));
  const lang = pill('surface/raised', 12, 8);
  lang.strokes = [P('border/subtle')];
  lang.appendChild(await T('EN', 'Body/Strong'));
  right.appendChild(lang);
  const bell = pill('surface/raised', 10, 8);
  if (ES['Elevation/Card']) bell.effectStyleId = ES['Elevation/Card'].id;
  bell.appendChild(await T('Help', 'Body/Strong'));
  right.appendChild(bell);
}

async function dinerMenu(x, y) {
  const scr = phone('Diner / Menu', x, y);
  await dinerHeader(scr);
  const hero = add(scr, AL('VERTICAL', { name: 'Hero', itemSpacing: 16, paddingLeft: 16, paddingRight: 16, paddingTop: 4, paddingBottom: 16 }), 'h');
  hero.appendChild(await T('Spice Route Café', 'Heading/H1'));
  const tray = add(hero, AL('VERTICAL', { paddingBottom: 16 }), 'h');
  tray.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: { r: 0.008, g: 0.024, b: 0.047, a: 0 } }, { position: 1, color: { r: 0.008, g: 0.024, b: 0.047, a: 0.1 } }] }];
  tray.bottomLeftRadius = 36;
  tray.bottomRightRadius = 36;
  const info = add(tray, card({ itemSpacing: 10, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16, radius: 20 }), 'h');
  if (ES['Elevation/Card']) info.effectStyleId = ES['Elevation/Card'].id;
  info.appendChild(await T('North Indian, Maharashtrian, South Indian', 'Body/Strong', 'text/brand'));
  info.appendChild(await T('14, Lane 6, Koregaon Park, Pune', 'Body/Medium', 'text/secondary'));
  info.appendChild(await T('Open now · 11 am – 11:30 pm', 'Body/Medium', 'status/success'));
  add(info, rect(10, 1, P('border/subtle')), 'h');
  info.appendChild(await T('Dine-in · Table T3', 'Body/Medium'));
  const sw = add(scr, AL('VERTICAL', { name: 'Search & filters', itemSpacing: 12, paddingLeft: 16, paddingRight: 16, paddingBottom: 12 }), 'h');
  add(sw, C.SearchBar.createInstance(), 'h');
  const chips = add(sw, AL('HORIZONTAL', { itemSpacing: 8 }));
  for (const [lbl, sel] of [['Veg', false], ['Non-veg', false], ['Egg', false], ['Bestseller', true]]) {
    chips.appendChild(setProp(variant('FilterChip', sel ? 'state=selected' : 'state=default'), 'Label', lbl));
  }
  const tabs = add(scr, AL('HORIZONTAL', { name: 'Category bar', itemSpacing: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 10 }), 'h');
  tabs.strokes = [P('border/subtle')];
  tabs.strokeTopWeight = 0;
  tabs.strokeLeftWeight = 0;
  tabs.strokeRightWeight = 0;
  tabs.strokeBottomWeight = 1;
  for (const [i, n] of ['Recommended', 'Starters', 'Main Course', 'Biryani'].entries()) {
    const col = add(tabs, AL('VERTICAL', { itemSpacing: 8 }));
    col.appendChild(await T(n, 'Body/Strong', i === 0 ? 'text/primary' : 'text/secondary'));
    add(col, rect(10, 3, i === 0 ? P('brand/primary') : HEX('#ffffff', 0), 2), 'h');
  }
  const sec = add(scr, AL('HORIZONTAL', { name: 'Section header', primaryAxisAlignItems: 'SPACE_BETWEEN', paddingLeft: 16, paddingRight: 16, paddingTop: 20, paddingBottom: 4 }), 'h');
  sec.appendChild(await T('Recommended (7)', 'Heading/H3'));
  sec.appendChild(await T('⌃', 'Heading/H3'));
  await dish(scr, 'Paneer Tikka', 'from ₹189', 'Chunks of cottage cheese marinated in hung curd and spices, char-grilled in the tandoor.', 'paneer');
  await dish(scr, 'Chicken Dum Biryani', '₹329', 'Aged basmati and tender chicken layered with saffron and mint, slow-cooked on dum.', 'biryani', 'nonveg');
  await dish(scr, 'Masala Dosa', '₹149', 'Crisp rice crêpe filled with spiced potato, served with sambar and coconut chutney.', 'dosa');
  const dock = add(scr, AL('VERTICAL', { name: 'Cart dock', paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 24 }), 'h');
  add(dock, C.CartBar.createInstance(), 'h');
  return scr;
}

async function dinerSheet(x, y) {
  const scr = phone('Diner / Dish sheet', x, y, 'surface/page');
  scr.primaryAxisSizingMode = 'FIXED';
  scr.resize(390, 844);
  scr.fills = [HEX('#02060C', 0.56)];
  scr.primaryAxisAlignItems = 'MAX';
  const sheet = add(scr, AL('VERTICAL', { name: 'Bottom sheet', itemSpacing: 14, paddingTop: 10, paddingBottom: 24 }), 'h');
  sheet.fills = [P('surface/raised')];
  sheet.topLeftRadius = 24;
  sheet.topRightRadius = 24;
  const grab = add(sheet, AL('HORIZONTAL', { primaryAxisAlignItems: 'CENTER' }), 'h');
  grab.appendChild(rect(40, 4, P('border/strong'), 2));
  const heroWrap = add(sheet, AL('VERTICAL', { paddingLeft: 16, paddingRight: 16 }), 'h');
  const img = add(heroWrap, rect(358, 224, HEX('#f0f0f5'), 16), 'h');
  await photoFill(img, 'paneer');
  const info = add(sheet, AL('VERTICAL', { itemSpacing: 6, paddingLeft: 20, paddingRight: 20 }), 'h');
  const marks = add(info, AL('HORIZONTAL', { itemSpacing: 8, counterAxisAlignItems: 'CENTER' }));
  marks.appendChild(variant('DietMark', 'diet=veg'));
  marks.appendChild(variant('Tag', 'tone=bestseller'));
  info.appendChild(await T('Paneer Tikka', 'Heading/H2'));
  info.appendChild(await T('₹289', 'Price'));
  info.appendChild(await T('Chunks of cottage cheese marinated in hung curd and spices, char-grilled in the tandoor with peppers and onion.', 'Body/Regular', 'text/secondary', { width: 350 }));
  const grp = add(sheet, AL('VERTICAL', { itemSpacing: 0, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 4 }), 'h');
  const box = add(grp, AL('VERTICAL', { itemSpacing: 0, paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 4 }), 'h');
  box.fills = [P('surface/sunken')];
  box.cornerRadius = 16;
  const legend = add(box, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', paddingBottom: 8 }), 'h');
  legend.appendChild(await T('Choose size', 'Title'));
  const req = pill('surface/raised', 8, 2);
  req.appendChild(await T('Required', 'Caption', 'text/secondary'));
  legend.appendChild(req);
  for (const [n, p, on] of [['Half (6 pcs)', '₹189', false], ['Full (12 pcs)', '₹289', true]]) {
    const row = add(box, AL('HORIZONTAL', { itemSpacing: 12, counterAxisAlignItems: 'CENTER', paddingTop: 14, paddingBottom: 14 }), 'h');
    row.strokes = [P('border/subtle')];
    row.strokeTopWeight = 1;
    row.strokeBottomWeight = 0;
    row.strokeLeftWeight = 0;
    row.strokeRightWeight = 0;
    row.appendChild(variant('DietMark', 'diet=veg'));
    add(row, await T(n, 'Body/Medium'), 'grow');
    row.appendChild(await T(p, 'Body/Medium', 'text/secondary'));
    const radio = figma.createEllipse();
    radio.resize(20, 20);
    radio.fills = [on ? P('status/success') : P('surface/raised')];
    radio.strokes = [on ? P('status/success') : P('border/strong')];
    radio.strokeWeight = on ? 6 : 2;
    if (on) radio.strokes = [HEX('#ffffff')];
    row.appendChild(radio);
  }
  const foot = add(sheet, AL('HORIZONTAL', { itemSpacing: 12, counterAxisAlignItems: 'CENTER', paddingLeft: 16, paddingRight: 16, paddingTop: 12 }), 'h');
  foot.strokes = [P('border/subtle')];
  foot.strokeTopWeight = 1;
  foot.strokeBottomWeight = 0;
  foot.strokeLeftWeight = 0;
  foot.strokeRightWeight = 0;
  foot.appendChild(setProp(variant('AddButton', 'state=stepper'), 'Qty', '1'));
  add(foot, button('Add item · ₹289', 'success', 'lg'), 'grow');
  return scr;
}

async function dinerCart(x, y) {
  const scr = phone('Diner / Cart', x, y, 'surface/sunken');
  const top = add(scr, AL('VERTICAL', { name: 'Top bar', itemSpacing: 2, paddingLeft: 20, paddingRight: 20, paddingTop: 20, paddingBottom: 14 }), 'h');
  top.fills = [P('surface/raised')];
  top.appendChild(await T('←   Spice Route Café', 'Title'));
  top.appendChild(await T('       Table T3', 'Caption', 'text/secondary'));
  const body = add(scr, AL('VERTICAL', { name: 'Body', itemSpacing: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 24 }), 'h');
  const items = add(body, card({ itemSpacing: 16 }), 'h');
  for (const [n, m, price, qty] of [['Paneer Tikka', 'Full (12 pcs)', '₹289', '1'], ['Samosa (2 pcs)', '', '₹138', '2']]) {
    const r = add(items, AL('HORIZONTAL', { itemSpacing: 12 }), 'h');
    r.appendChild(variant('DietMark', 'diet=veg'));
    const tx = add(r, AL('VERTICAL', { itemSpacing: 2 }), 'grow');
    tx.appendChild(await T(n, 'Body/Strong'));
    if (m) tx.appendChild(await T(m, 'Caption', 'text/secondary'));
    const rc = add(r, AL('VERTICAL', { itemSpacing: 6, counterAxisAlignItems: 'MAX' }));
    rc.appendChild(setProp(variant('AddButton', 'state=stepper'), 'Qty', qty));
    rc.appendChild(await T(price, 'Body/Medium'));
  }
  const actions = add(items, AL('HORIZONTAL', { itemSpacing: 8 }), 'h');
  for (const a of ['+  Add more items', '✎  Cooking instructions']) {
    const b = pill('surface/raised', 12, 8, 8);
    b.strokes = [P('border/subtle')];
    b.appendChild(await T(a, 'Body/Medium'));
    actions.appendChild(b);
  }
  const bill = add(body, card({ itemSpacing: 10 }), 'h');
  bill.appendChild(await T('Bill details', 'Title'));
  for (const [l, v, strong] of [['Item total', '₹427'], ['GST and restaurant charges', '₹21.35'], ['Round off', '−₹0.35'], ['To pay', '₹448', true]]) {
    const r = add(bill, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN' }), 'h');
    r.appendChild(await T(l, strong ? 'Title' : 'Body/Regular', strong ? 'text/primary' : 'text/secondary'));
    r.appendChild(await T(v, strong ? 'Title' : 'Body/Regular', strong ? 'text/primary' : 'text/secondary'));
  }
  const det = add(body, card({ itemSpacing: 8 }), 'h');
  det.appendChild(await T('Your name (optional)', 'Caption', 'text/secondary'));
  const inp = add(det, rect(10, 44, P('surface/raised'), 8), 'h');
  inp.strokes = [P('border/strong')];
  inp.strokeWeight = 1.5;
  const foot = add(scr, AL('HORIZONTAL', { name: 'Footer', primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 24 }), 'h');
  foot.fills = [P('surface/raised')];
  const fl = add(foot, AL('VERTICAL'));
  fl.appendChild(await T('₹448', 'Heading/H2'));
  fl.appendChild(await T('Pay at the counter', 'Caption', 'text/secondary'));
  foot.appendChild(button('Place order  →', 'success', 'lg'));
  return scr;
}

async function dinerTracking(x, y) {
  const scr = phone('Diner / Order tracking', x, y, 'surface/sunken');
  const top = add(scr, AL('VERTICAL', { itemSpacing: 2, paddingLeft: 20, paddingRight: 20, paddingTop: 20, paddingBottom: 14 }), 'h');
  top.fills = [P('surface/raised')];
  top.appendChild(await T('←   Your orders', 'Title'));
  top.appendChild(await T('       Table T3', 'Caption', 'text/secondary'));
  const body = add(scr, AL('VERTICAL', { itemSpacing: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 24 }), 'h');
  const oc = add(body, card({ itemSpacing: 14 }), 'h');
  const hr = add(oc, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' }), 'h');
  const ht = add(hr, AL('VERTICAL'));
  ht.appendChild(await T('Order #24', 'Title'));
  ht.appendChild(await T('8:42 pm', 'Caption', 'text/secondary'));
  const b = pill('brand/primary-soft', 10, 4);
  b.appendChild(await T('● Preparing', 'Caption', 'text/brand'));
  hr.appendChild(b);
  add(oc, C.StatusStepper.createInstance(), 'h');
  for (const [q, n, p] of [['1 ×', 'Paneer Tikka · Full', '₹289'], ['2 ×', 'Samosa (2 pcs)', '₹138']]) {
    const r = add(oc, AL('HORIZONTAL', { itemSpacing: 8 }), 'h');
    r.appendChild(await T(q, 'Body/Regular', 'text/secondary'));
    add(r, await T(n, 'Body/Regular'), 'grow');
    r.appendChild(await T(p, 'Body/Regular'));
  }
  const foot = add(scr, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 16, paddingRight: 16, paddingTop: 14, paddingBottom: 24 }), 'h');
  foot.fills = [P('surface/raised')];
  const fl = add(foot, AL('VERTICAL'));
  fl.appendChild(await T('Running bill', 'Caption', 'text/secondary'));
  fl.appendChild(await T('₹448', 'Heading/H2'));
  const btns = add(foot, AL('HORIZONTAL', { itemSpacing: 8 }));
  btns.appendChild(button('Bill', 'outline', 'md'));
  btns.appendChild(button('+ Order more', 'primary', 'md'));
  return scr;
}

async function dinerState(x, y) {
  const scr = phone('Diner / Invalid QR', x, y);
  scr.primaryAxisSizingMode = 'FIXED';
  scr.resize(390, 844);
  scr.primaryAxisAlignItems = 'CENTER';
  scr.counterAxisAlignItems = 'CENTER';
  scr.itemSpacing = 14;
  scr.paddingLeft = 32;
  scr.paddingRight = 32;
  scr.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: { r: 1, g: 0.973, b: 0.949, a: 1 } }, { position: 0.6, color: { r: 1, g: 1, b: 1, a: 1 } }] }];
  const icon = figma.createAutoLayout('HORIZONTAL', { primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER' });
  icon.resize(88, 88);
  icon.primaryAxisSizingMode = 'FIXED';
  icon.counterAxisSizingMode = 'FIXED';
  icon.cornerRadius = 28;
  icon.fills = [P('brand/primary')];
  icon.appendChild(await T('▦', 'Heading/H1', 'text/inverse'));
  scr.appendChild(icon);
  scr.appendChild(await T('SPICE ROUTE CAFÉ', 'Overline', 'text/tertiary'));
  const h = await T('This QR code is no longer valid', 'Heading/H1', 'text/primary', { width: 300 });
  h.textAlignHorizontal = 'CENTER';
  scr.appendChild(h);
  const p = await T('Please call a staff member for help.', 'Body/Regular', 'text/secondary', { width: 300 });
  p.textAlignHorizontal = 'CENTER';
  scr.appendChild(p);
  scr.appendChild(button('Browse the menu', 'outline', 'md'));
  return scr;
}

// ───────── Brand website ─────────
async function brandHome(x, y) {
  const s = desktop('Web / Home', x, y, 1440, 1040, 'surface/page');
  const nav = AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 120, paddingRight: 120 });
  nav.resize(1440, 80);
  nav.primaryAxisSizingMode = 'FIXED';
  nav.counterAxisSizingMode = 'FIXED';
  s.appendChild(nav);
  const brand = add(nav, AL('HORIZONTAL', { itemSpacing: 10, counterAxisAlignItems: 'CENTER' }));
  const mark = rect(36, 36, P('brand/primary'), 10);
  brand.appendChild(mark);
  brand.appendChild(await T('TableOS', 'Heading/H2'));
  const links = add(nav, AL('HORIZONTAL', { itemSpacing: 36 }));
  for (const l of ['Features', 'Pricing', 'Live demo', 'Contact']) links.appendChild(await T(l, 'Body/Strong', 'text/secondary', { size: 16 }));
  const ctas = add(nav, AL('HORIZONTAL', { itemSpacing: 16, counterAxisAlignItems: 'CENTER' }));
  ctas.appendChild(await T('Sign in', 'Body/Strong', 'text/primary', { size: 16 }));
  ctas.appendChild(button('Create free menu', 'primary', 'md'));
  const left = AL('VERTICAL', { itemSpacing: 24 });
  left.x = 120;
  left.y = 200;
  s.appendChild(left);
  const eb = pill('surface/raised', 12, 6);
  if (ES['Elevation/Card']) eb.effectStyleId = ES['Elevation/Card'].id;
  eb.appendChild(await T('✦ Free QR menu · ₹2 per order', 'Caption', 'text/brand'));
  left.appendChild(eb);
  const h1 = await T('Your menu on every table.', 'Display', 'text/primary', { size: 64, width: 620 });
  left.appendChild(h1);
  const h2 = await T('Orders straight to the kitchen.', 'Display', 'text/brand', { size: 64, width: 620 });
  left.appendChild(h2);
  left.appendChild(await T('TableOS gives your restaurant a beautiful QR menu, table ordering, a kitchen screen and billing, all from one dashboard. Go live in fifteen minutes.', 'Body/Regular', 'text/secondary', { size: 18, width: 560 }));
  const row = add(left, AL('HORIZONTAL', { itemSpacing: 12 }));
  row.appendChild(button('Create your free menu  →', 'primary', 'lg'));
  row.appendChild(button('Try the live demo', 'outline', 'lg'));
  left.appendChild(await T('✓ No setup fee     ✓ No commission on your bill     ✓ Cancel anytime', 'Body/Medium', 'text/secondary'));
  const blob = figma.createEllipse();
  blob.resize(460, 460);
  blob.x = 880;
  blob.y = 250;
  blob.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [{ position: 0, color: { r: 1, g: 0.7, b: 0.42, a: 1 } }, { position: 1, color: { r: 0.988, g: 0.502, b: 0.098, a: 1 } }] }];
  s.appendChild(blob);
  const ph = figma.createFrame();
  ph.name = 'Phone';
  ph.resize(290, 590);
  ph.x = 965;
  ph.y = 190;
  ph.cornerRadius = 46;
  ph.fills = [HEX('#0d0f14')];
  s.appendChild(ph);
  const screen = figma.createFrame();
  screen.resize(266, 566);
  screen.x = 12;
  screen.y = 12;
  screen.cornerRadius = 36;
  screen.fills = [HEX('#ffffff')];
  ph.appendChild(screen);
  const t = await T('Spice Route Café', 'Heading/H3');
  t.x = 16;
  t.y = 56;
  screen.appendChild(t);
  let yy = 100;
  for (const [n, p, k] of [['Paneer Tikka', '₹289', 'paneer'], ['Chicken Dum Biryani', '₹329', 'biryani'], ['Masala Dosa', '₹149', 'dosa']]) {
    const nm = await T(n, 'Body/Strong');
    nm.x = 16;
    nm.y = yy + 20;
    screen.appendChild(nm);
    const pr = await T(p, 'Caption', 'text/secondary');
    pr.x = 16;
    pr.y = yy + 42;
    screen.appendChild(pr);
    const img = rect(96, 84, HEX('#f0f0f5'), 12);
    img.x = 154;
    img.y = yy;
    await photoFill(img, k);
    screen.appendChild(img);
    yy += 120;
  }
  const bar = rect(242, 44, P('status/success'), 10);
  bar.x = 12;
  bar.y = 506;
  screen.appendChild(bar);
  const bt = await T('1 item added            View Cart ›', 'Caption', 'text/inverse');
  bt.x = 24;
  bt.y = 520;
  screen.appendChild(bt);
  return s;
}

// ───────── Console ─────────
const NAV = ['Home', 'Live orders', 'Kitchen', 'Waiter', 'Menu', 'Tables & QR', 'Insights', 'Wallet', 'Staff', 'Settings'];
async function consoleShell(name, x, y, active, title, subtitle) {
  const s = desktop(name, x, y);
  const side = AL('VERTICAL', { name: 'Sidebar', itemSpacing: 4, paddingLeft: 12, paddingRight: 12, paddingTop: 20, paddingBottom: 20 });
  side.resize(264, 900);
  side.primaryAxisSizingMode = 'FIXED';
  side.counterAxisSizingMode = 'FIXED';
  side.fills = [P('surface/raised')];
  side.strokes = [P('border/subtle')];
  side.strokeRightWeight = 1;
  side.strokeLeftWeight = 0;
  side.strokeTopWeight = 0;
  side.strokeBottomWeight = 0;
  s.appendChild(side);
  const brand = add(side, AL('HORIZONTAL', { itemSpacing: 10, counterAxisAlignItems: 'CENTER', paddingLeft: 12, paddingBottom: 12 }));
  brand.appendChild(rect(30, 30, P('brand/primary'), 9));
  brand.appendChild(await T('TableOS', 'Heading/H3'));
  const rs = add(side, AL('HORIZONTAL', { itemSpacing: 10, counterAxisAlignItems: 'CENTER', paddingLeft: 12, paddingRight: 12, paddingTop: 12, paddingBottom: 12 }), 'h');
  rs.fills = [P('surface/sunken')];
  rs.cornerRadius = 12;
  rs.appendChild(rect(36, 36, P('brand/primary'), 10));
  const rt = add(rs, AL('VERTICAL'));
  rt.appendChild(await T('Spice Route Café', 'Body/Strong'));
  rt.appendChild(await T('Owner', 'Caption', 'text/secondary'));
  side.appendChild(rect(10, 12, HEX('#ffffff', 0)));
  for (const n of NAV) {
    const item = add(side, AL('HORIZONTAL', { paddingLeft: 12, paddingRight: 12, paddingTop: 11, paddingBottom: 11 }), 'h');
    item.cornerRadius = 8;
    if (n === active) item.fills = [P('brand/primary-soft')];
    item.appendChild(await T(n, n === active ? 'Body/Strong' : 'Body/Medium', n === active ? 'text/brand' : 'text/secondary', { size: 15 }));
  }
  const content = AL('VERTICAL', { name: 'Content', itemSpacing: 24, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 36 });
  content.x = 264;
  content.y = 0;
  content.resize(1176, 900);
  content.primaryAxisSizingMode = 'FIXED';
  content.counterAxisSizingMode = 'FIXED';
  s.appendChild(content);
  const head = add(content, AL('VERTICAL', { itemSpacing: 4 }), 'h');
  head.appendChild(await T(title, 'Heading/H1'));
  if (subtitle) head.appendChild(await T(subtitle, 'Body/Regular', 'text/secondary', { size: 15 }));
  return { s, content };
}

async function stat(parent, lbl, value, hint) {
  const c = add(parent, card({ itemSpacing: 6 }), 'grow');
  c.appendChild(await T(lbl, 'Body/Medium', 'text/secondary'));
  c.appendChild(await T(value, 'Display', 'text/primary', { size: 30 }));
  c.appendChild(await T(hint, 'Caption', 'text/tertiary'));
}

async function consoleDashboard(x, y) {
  const { content } = await consoleShell('Console / Dashboard', x, y, 'Home', 'Good afternoon, Aarti', 'Spice Route Café · Ordering is on');
  const stats = add(content, AL('HORIZONTAL', { itemSpacing: 16 }), 'h');
  await stat(stats, 'Orders today', '38', '2 waiting · 5 in kitchen');
  await stat(stats, 'Order value today', '₹14,280', 'Accepted orders');
  await stat(stats, 'Tables in use', '7/12', 'Open table sessions');
  await stat(stats, 'Wallet', '₹500', '₹76 of ₹999 cap used');
  const row = add(content, AL('HORIZONTAL', { itemSpacing: 16 }), 'h');
  const cl = add(row, card({ itemSpacing: 12 }), 'grow');
  cl.appendChild(await T('Get ready to go live', 'Heading/H3'));
  cl.appendChild(await T('3 of 4 done', 'Caption', 'text/secondary'));
  const prog = add(cl, AL('HORIZONTAL'), 'h');
  prog.fills = [P('surface/sunken')];
  prog.cornerRadius = 999;
  prog.appendChild(rect(380, 8, P('brand/primary'), 999));
  for (const [t, d, done] of [['Add your menu', 'Import from photos with AI', true], ['Add your tables', 'Group them into sections', true], ['Print QR codes', 'Download tent cards', false], ['Place a test order', 'Scan a table QR and order', true]]) {
    const it = add(cl, AL('HORIZONTAL', { itemSpacing: 12, counterAxisAlignItems: 'CENTER', paddingLeft: 12, paddingRight: 12, paddingTop: 12, paddingBottom: 12 }), 'h');
    it.cornerRadius = 12;
    it.strokes = [P('border/subtle')];
    const dot = figma.createEllipse();
    dot.resize(28, 28);
    dot.fills = [done ? P('status/success') : HEX('#ffffff')];
    if (!done) {
      dot.strokes = [P('border/strong')];
      dot.dashPattern = [4, 4];
    }
    it.appendChild(dot);
    const tx = add(it, AL('VERTICAL'), 'grow');
    tx.appendChild(await T(t, 'Body/Strong', done ? 'text/tertiary' : 'text/primary'));
    tx.appendChild(await T(d, 'Caption', 'text/secondary'));
  }
  const ro = add(row, card({ itemSpacing: 12 }), 'grow');
  ro.appendChild(await T('Recent orders', 'Heading/H3'));
  for (const [o, t, st, tot] of [['#38', 'T4', 'Preparing', '₹612'], ['#37', 'R2', 'Ready', '₹349'], ['#36', 'T1', 'Served', '₹1,148'], ['#35', 'T7', 'Served', '₹486']]) {
    const r = add(ro, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', paddingTop: 10, paddingBottom: 10 }), 'h');
    r.strokes = [P('border/subtle')];
    r.strokeTopWeight = 1;
    r.strokeBottomWeight = 0;
    r.strokeLeftWeight = 0;
    r.strokeRightWeight = 0;
    for (const v of [o, t, st, tot]) r.appendChild(await T(v, 'Body/Regular'));
  }
}

async function orderCard(parent, table, no, items, total, status) {
  const c = add(parent, card({ itemSpacing: 10, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16, radius: 12 }), 'h');
  c.strokes = [status === 'placed' ? P('status/warning') : P('border/subtle')];
  c.strokeLeftWeight = 4;
  const h = add(c, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER' }), 'h');
  const l = add(h, AL('HORIZONTAL', { itemSpacing: 8, counterAxisAlignItems: 'CENTER' }));
  const tp = pill('surface/dark', 8, 3, 6);
  tp.appendChild(await T(table, 'Caption', 'text/inverse'));
  l.appendChild(tp);
  l.appendChild(await T(no, 'Title'));
  h.appendChild(await T(status === 'placed' ? '2m' : '12m', 'Caption', status === 'placed' ? 'status/success' : 'status/warning'));
  for (const it of items) c.appendChild(await T(it, 'Body/Regular'));
  const m = add(c, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN' }), 'h');
  m.appendChild(await T('QR order', 'Caption', 'text/secondary'));
  m.appendChild(await T(total, 'Body/Strong'));
  const acts = add(c, AL('HORIZONTAL', { itemSpacing: 8 }), 'h');
  if (status === 'placed') {
    add(acts, button('Reject', 'outline', 'sm'), 'grow');
    add(acts, button('Accept', 'success', 'sm'), 'grow');
  } else if (status === 'accepted') add(acts, button('Start preparing', 'primary', 'sm'), 'grow');
  else if (status === 'preparing') add(acts, button('Mark ready', 'success', 'sm'), 'grow');
  else add(acts, button('Mark served', 'dark', 'sm'), 'grow');
}

async function consoleOrders(x, y) {
  const { content } = await consoleShell('Console / Live orders', x, y, 'Live orders', 'Live orders', '● Live · 2 waiting · 7 tables in use');
  const board = add(content, AL('HORIZONTAL', { itemSpacing: 16 }), 'h');
  const cols = [
    ['New', 'status/warning', [['T6', '#39', ['1× Masala Dosa', '1× Masala Chaas'], '₹218', 'placed'], ['R1', '#40', ['2× Pav Bhaji'], '₹334', 'placed']]],
    ['Accepted', 'status/info', [['T2', '#37', ['1× Butter Chicken', '2× Garlic Naan'], '₹512', 'accepted']]],
    ['Preparing', 'brand/primary', [['T4', '#38', ['1× Chicken Dum Biryani', '1× Raita'], '₹388', 'preparing']]],
    ['Ready to serve', 'status/success', [['T1', '#36', ['1× Paneer Tikka · Full'], '₹303', 'ready']]],
  ];
  for (const [name, color, cards] of cols) {
    const col = add(board, AL('VERTICAL', { itemSpacing: 12, paddingLeft: 12, paddingRight: 12, paddingTop: 12, paddingBottom: 12 }), 'grow');
    col.fills = [HEX('#02060C', 0.035)];
    col.cornerRadius = 16;
    const h = add(col, AL('HORIZONTAL', { itemSpacing: 8, counterAxisAlignItems: 'CENTER' }), 'h');
    const dot = figma.createEllipse();
    dot.resize(10, 10);
    dot.fills = [P(color)];
    h.appendChild(dot);
    add(h, await T(name, 'Title'), 'grow');
    const cnt = pill('surface/raised', 8, 2);
    cnt.appendChild(await T(String(cards.length), 'Caption'));
    h.appendChild(cnt);
    for (const c of cards) await orderCard(col, ...c);
  }
}

async function kitchen(x, y) {
  const s = desktop('Kitchen display', x, y, 1280, 800, 'surface/dark');
  s.fills = [HEX('#11141a')];
  const head = AL('HORIZONTAL', { itemSpacing: 16, counterAxisAlignItems: 'CENTER' });
  head.x = 24;
  head.y = 24;
  s.appendChild(head);
  head.appendChild(await T('Kitchen', 'Display', '#ffffff', { size: 28 }));
  head.appendChild(await T('● 3 open', 'Body/Strong', '#33d68f', { size: 16 }));
  const grid = AL('HORIZONTAL', { itemSpacing: 16 });
  grid.x = 24;
  grid.y = 90;
  s.appendChild(grid);
  const tickets = [
    ['T4', '#38 · Preparing', '11:42', '#ffc35c', '#FC8019', ['1×  Chicken Dum Biryani', '1×  Raita'], 'less spicy please', 'MARK READY', '#1BA672'],
    ['T2', '#37 · New', '02:15', '#e8eaee', '#3a8bff', ['1×  Butter Chicken', '2×  Garlic Naan'], null, 'START PREPARING', '#2B6DE5'],
    ['R1', '#40 · New', '00:40', '#e8eaee', '#3a8bff', ['2×  Pav Bhaji', '    Extra butter'], null, 'START PREPARING', '#2B6DE5'],
  ];
  for (const [tab, no, timer, tcol, top, items, note, action, acol] of tickets) {
    const t = AL('VERTICAL', { itemSpacing: 0 });
    t.resize(392, 100);
    t.counterAxisSizingMode = 'FIXED';
    t.fills = [HEX('#1d2129')];
    t.cornerRadius = 16;
    t.strokes = [HEX(top)];
    t.strokeTopWeight = 8;
    t.strokeBottomWeight = 0;
    t.strokeLeftWeight = 0;
    t.strokeRightWeight = 0;
    t.clipsContent = true;
    grid.appendChild(t);
    const h = add(t, AL('HORIZONTAL', { primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'CENTER', paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }), 'h');
    const hl = add(h, AL('VERTICAL'));
    hl.appendChild(await T(tab, 'Display', '#ffffff', { size: 32 }));
    hl.appendChild(await T(no, 'Body/Medium', '#9aa0ab', { size: 16 }));
    h.appendChild(await T(timer, 'Display', tcol, { size: 28 }));
    const list = add(t, AL('VERTICAL', { itemSpacing: 12, paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 16 }), 'h');
    for (const it of items) list.appendChild(await T(it, 'Heading/H2', '#ffffff', { size: 22 }));
    if (note) {
      const n = add(t, AL('HORIZONTAL', { paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }), 'h');
      const nb = add(n, pill('#3a2f12', 12, 10, 8), 'h');
      nb.appendChild(await T(note, 'Body/Strong', '#ffd27a', { size: 17 }));
    }
    const a = add(t, AL('HORIZONTAL', { primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER', paddingTop: 22, paddingBottom: 22 }), 'h');
    a.fills = [HEX(acol)];
    a.appendChild(await T(action, 'Heading/H3', '#ffffff', { size: 20 }));
  }
}

async function consoleWallet(x, y) {
  const { content } = await consoleShell('Console / Wallet', x, y, 'Wallet', 'Wallet', 'Prepaid platform fees. ₹2 per accepted order, never more than ₹999 a month.');
  const hero = add(content, AL('HORIZONTAL', { itemSpacing: 24, paddingLeft: 28, paddingRight: 28, paddingTop: 28, paddingBottom: 28, counterAxisAlignItems: 'CENTER' }), 'h');
  hero.fills = [HEX('#02060C')];
  hero.cornerRadius = 24;
  const l = add(hero, AL('VERTICAL', { itemSpacing: 12 }), 'grow');
  l.appendChild(await T('Wallet balance', 'Body/Regular', '#ffffff'));
  l.appendChild(await T('₹500', 'Display', '#ffffff', { size: 48 }));
  l.appendChild(await T('This month · 38 accepted orders            ₹76 / ₹999', 'Body/Regular', '#ffffff'));
  const meter = add(l, AL('HORIZONTAL'), 'h');
  meter.fills = [HEX('#ffffff', 0.12)];
  meter.cornerRadius = 999;
  meter.appendChild(rect(46, 12, P('brand/primary'), 999));
  const r = add(hero, card({ itemSpacing: 12, radius: 20 }));
  r.resize(420, r.height);
  r.appendChild(await T('Recharge', 'Heading/H3'));
  const presets = add(r, AL('HORIZONTAL', { itemSpacing: 8 }));
  for (const [p, on] of [['₹200', false], ['₹500', true], ['₹1,000', false], ['₹2,000', false]]) presets.appendChild(setProp(variant('FilterChip', on ? 'state=selected' : 'state=default'), 'Label', p));
  add(r, button('Pay ₹590', 'primary', 'lg'), 'h');
  add(r, button('Switch to flat plan · ₹999/month', 'secondary', 'md'), 'h');
  const led = add(content, card({ itemSpacing: 10 }), 'h');
  led.appendChild(await T('Transactions', 'Heading/H3'));
  for (const [d, t, det, a, b] of [['18 Oct, 9:41 pm', 'Order fee', 'Order #38', '−₹2', '₹500'], ['18 Oct, 6:12 pm', 'Recharge', 'PAY-20261018-K4P9QZ', '+₹500', '₹502'], ['17 Oct, 9:02 pm', 'Order fee', 'Order #31', '−₹2', '₹2']]) {
    const row = add(led, AL('HORIZONTAL', { itemSpacing: 16, paddingTop: 10, paddingBottom: 10 }), 'h');
    row.strokes = [P('border/subtle')];
    row.strokeTopWeight = 1;
    row.strokeBottomWeight = 0;
    row.strokeLeftWeight = 0;
    row.strokeRightWeight = 0;
    for (const [i, v] of [d, t, det, a, b].entries()) add(row, await T(v, 'Body/Regular', i === 3 && v.startsWith('+') ? 'status/success' : 'text/primary'), 'grow');
  }
}

async function consoleLogin(x, y) {
  const s = desktop('Console / Login', x, y, 1440, 900, 'surface/page');
  const side = figma.createFrame();
  side.resize(680, 900);
  side.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.3]], gradientStops: [{ position: 0, color: { r: 1, g: 0.635, b: 0.302, a: 1 } }, { position: 0.5, color: { r: 0.988, g: 0.502, b: 0.098, a: 1 } }, { position: 1, color: { r: 0.8, g: 0.38, b: 0.02, a: 1 } }] }];
  s.appendChild(side);
  const st = AL('VERTICAL', { itemSpacing: 20 });
  st.x = 64;
  st.y = 360;
  side.appendChild(st);
  st.appendChild(await T('Run your dining room from one screen.', 'Display', '#ffffff', { size: 44, width: 520 }));
  for (const b of ['✓  Free QR menu with photos', '✓  Orders straight to the kitchen', '✓  ₹2 per order, never more than ₹999 a month']) st.appendChild(await T(b, 'Title', '#ffffff', { size: 18 }));
  const form = AL('VERTICAL', { itemSpacing: 20 });
  form.x = 840;
  form.y = 280;
  form.resize(420, 100);
  form.counterAxisSizingMode = 'FIXED';
  s.appendChild(form);
  form.appendChild(await T('Welcome back', 'Heading/H1'));
  form.appendChild(await T('Sign in with a one-time code sent to your email.', 'Body/Regular', 'text/secondary', { width: 420 }));
  form.appendChild(await T('Email address', 'Body/Strong'));
  const inp = add(form, AL('HORIZONTAL', { paddingLeft: 14, paddingRight: 14, paddingTop: 14, paddingBottom: 14 }), 'h');
  inp.cornerRadius = 12;
  inp.strokes = [P('brand/primary')];
  inp.strokeWeight = 1.5;
  inp.appendChild(await T('owner@demo.tableos.in', 'Body/Medium'));
  add(form, button('Send code', 'primary', 'lg'), 'h');
  form.appendChild(await T('New to TableOS? Create a free menu', 'Body/Regular', 'text/secondary'));
}

// ───────── run ─────────
async function onPage(index, fns) {
  const page = figma.root.children[index];
  await figma.setCurrentPageAsync(page);
  for (const n of [...page.children]) if (n.getPluginData('tableos') === '1') n.remove();
  for (const [fn, args] of fns) {
    try {
      const node = await fn(...args);
      if (node && node.setPluginData) node.setPluginData('tableos', '1');
    } catch (e) {
      errors.push(`${fn.name}: ${e && e.message ? e.message : e}`);
    }
  }
}

(async () => {
  try {
    figma.notify('Building TableOS screens…', { timeout: 4000 });
    await setup();
    await onPage(1, [
      [dinerMenu, [0, 0]],
      [dinerSheet, [440, 0]],
      [dinerCart, [880, 0]],
      [dinerTracking, [1320, 0]],
      [dinerState, [1760, 0]],
      [brandHome, [0, 1300]],
    ]);
    await onPage(2, [
      [consoleLogin, [0, 0]],
      [consoleDashboard, [1540, 0]],
      [consoleOrders, [0, 1000]],
      [consoleWallet, [1540, 1000]],
      [kitchen, [0, 2000]],
    ]);
    const msg = errors.length ? `Done with ${errors.length} issue(s): ${errors.join(' | ')}` : 'TableOS screens built ✓';
    figma.closePlugin(msg);
  } catch (e) {
    figma.closePlugin('TableOS Screens failed: ' + (e && e.message ? e.message : e));
  }
})();
