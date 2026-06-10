// ===== Mi Despensa — lógica principal =====
// Todos los datos viven en el teléfono (localStorage). Sin servidores.

const STORAGE_KEY = 'despensa_v1';

// Estructura: { consumos: [...], stock: { producto: {actual, minimo} }, carrito: [producto] }
function cargarDatos() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return { consumos: d.consumos || [], stock: d.stock || {}, carrito: d.carrito || [] };
  } catch {
    return { consumos: [], stock: {}, carrito: [] };
  }
}

function guardarDatos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
}

let datos = cargarDatos();

// ---- util ----
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- Íconos dibujados (mismo estilo minimalista que el engranaje) ----
const ICONOS = {
  lapiz: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  carrito: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.17.32-.25.65-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
  caja: 'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z',
  grafico: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99l1.5 1.5z',
  bajando: 'M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.29 6.29L22 12v6h-6z',
  luna: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z',
  sol: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0zM5.99 4.58a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 1 0 1.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 1 0 1.41-1.41l-1.06-1.06zm1.06-10.96a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 1 0 1.41 1.41l1.06-1.06zM7.05 18.36a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 1 0 1.41 1.41l1.06-1.06z',
  campana: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  chat: 'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-3 9H7V9h10v2zm-4 4H7v-2h6v2zm4-8H7V5h10v2z',
  copiar: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  planilla: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z',
  descargar: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  subir: 'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z',
  celular: 'M17 1H7c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm0 17H7V5h10v13zm-5-1.5l4-4-1.41-1.41L13 12.67V8h-2v4.67l-1.59-1.58L8 12.5l4 4z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
};
function icono(n) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;
}

function fmtCant(n) {
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// Catálogo derivado: por cada producto, su última unidad y categoría
function catalogo() {
  const cat = {};
  for (const c of datos.consumos) {
    cat[c.producto] = { unidad: c.unidad, categoria: c.categoria };
  }
  return cat;
}

// Diccionario incorporado: productos comunes con su unidad y categoría sugeridas.
// Sirve para autocompletar la PRIMERA vez. Lo que cargues vos tiene prioridad.
const PRODUCTOS_CONOCIDOS = {
  // Lácteos
  'Leche': { unidad: 'L', categoria: 'Lácteos' },
  'Crema': { unidad: 'ml', categoria: 'Lácteos' },
  'Manteca': { unidad: 'g', categoria: 'Lácteos' },
  'Queso': { unidad: 'g', categoria: 'Lácteos' },
  'Yogur': { unidad: 'u', categoria: 'Lácteos' },
  'Dulce de leche': { unidad: 'g', categoria: 'Lácteos' },
  // Almacén
  'Harina': { unidad: 'kg', categoria: 'Almacén' },
  'Azúcar': { unidad: 'kg', categoria: 'Almacén' },
  'Sal': { unidad: 'kg', categoria: 'Almacén' },
  'Arroz': { unidad: 'kg', categoria: 'Almacén' },
  'Fideos': { unidad: 'paquete', categoria: 'Almacén' },
  'Aceite': { unidad: 'L', categoria: 'Almacén' },
  'Yerba': { unidad: 'kg', categoria: 'Almacén' },
  'Café': { unidad: 'paquete', categoria: 'Almacén' },
  'Té': { unidad: 'paquete', categoria: 'Almacén' },
  'Galletitas': { unidad: 'paquete', categoria: 'Almacén' },
  'Huevos': { unidad: 'u', categoria: 'Almacén' },
  'Puré de tomate': { unidad: 'u', categoria: 'Almacén' },
  'Atún': { unidad: 'u', categoria: 'Almacén' },
  'Mayonesa': { unidad: 'u', categoria: 'Almacén' },
  'Mermelada': { unidad: 'u', categoria: 'Almacén' },
  'Lentejas': { unidad: 'kg', categoria: 'Almacén' },
  'Polenta': { unidad: 'kg', categoria: 'Almacén' },
  // Frutas y verduras
  'Manzanas': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Bananas': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Naranjas': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Papas': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Cebolla': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Tomate': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Lechuga': { unidad: 'u', categoria: 'Frutas y verduras' },
  'Zanahoria': { unidad: 'kg', categoria: 'Frutas y verduras' },
  'Limón': { unidad: 'kg', categoria: 'Frutas y verduras' },
  // Carnes
  'Carne': { unidad: 'kg', categoria: 'Carnes' },
  'Pollo': { unidad: 'kg', categoria: 'Carnes' },
  'Pescado': { unidad: 'kg', categoria: 'Carnes' },
  'Milanesas': { unidad: 'kg', categoria: 'Carnes' },
  // Limpieza
  'Detergente': { unidad: 'ml', categoria: 'Limpieza' },
  'Lavandina': { unidad: 'L', categoria: 'Limpieza' },
  'Jabón en polvo': { unidad: 'kg', categoria: 'Limpieza' },
  'Esponja': { unidad: 'u', categoria: 'Limpieza' },
  'Rollo de cocina': { unidad: 'rollo', categoria: 'Limpieza' },
  // Higiene
  'Papel higiénico': { unidad: 'rollo', categoria: 'Higiene' },
  'Shampoo': { unidad: 'ml', categoria: 'Higiene' },
  'Jabón': { unidad: 'u', categoria: 'Higiene' },
  'Pasta dental': { unidad: 'u', categoria: 'Higiene' },
  'Desodorante': { unidad: 'u', categoria: 'Higiene' },
  // Bebidas
  'Agua': { unidad: 'L', categoria: 'Bebidas' },
  'Gaseosa': { unidad: 'L', categoria: 'Bebidas' },
  'Jugo': { unidad: 'L', categoria: 'Bebidas' },
  'Vino': { unidad: 'u', categoria: 'Bebidas' },
  'Cerveza': { unidad: 'u', categoria: 'Bebidas' },
};

// Mapa normalizado (minúsculas) del diccionario para búsqueda flexible
const DICC_NORM = {};
for (const k in PRODUCTOS_CONOCIDOS) DICC_NORM[normaliza(k)] = PRODUCTOS_CONOCIDOS[k];

function normaliza(s) {
  // minúsculas, sin espacios sobrantes y sin tildes ("café" == "cafe")
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Devuelve {unidad, categoria} para un nombre, o null si no lo conoce.
// Prioridad: lo que el usuario ya cargó > diccionario incorporado.
function infoProducto(nombre) {
  const n = normaliza(nombre);
  if (!n) return null;
  const cat = catalogo();
  const histNorm = {};
  for (const k in cat) histNorm[normaliza(k)] = cat[k];
  // 1) coincidencia exacta en tu historial
  if (histNorm[n]) return histNorm[n];
  // 2) coincidencia exacta en el diccionario
  if (DICC_NORM[n]) return DICC_NORM[n];
  // 3) probar singular/plural simple (con o sin 's' final)
  const alt = n.endsWith('s') ? n.slice(0, -1) : n + 's';
  if (histNorm[alt]) return histNorm[alt];
  if (DICC_NORM[alt]) return DICC_NORM[alt];
  return null;
}

// Nombres para el autocompletado (diccionario + tu historial, sin duplicar)
function nombresConocidos() {
  const m = {};
  for (const k in PRODUCTOS_CONOCIDOS) m[normaliza(k)] = k;
  for (const k of Object.keys(catalogo())) m[normaliza(k)] = k; // tu forma de escribirlo gana
  return Object.values(m).sort((a, b) => a.localeCompare(b, 'es'));
}

// ===== CARGAR =====
const form = document.getElementById('form-cargar');
const inputProducto = document.getElementById('producto');
const inputUnidad = document.getElementById('unidad');
const inputCategoria = document.getElementById('categoria');

// Registra un consumo y descuenta del stock si ese producto se controla
function registrarConsumo(producto, cantidad, unidad, categoria) {
  datos.consumos.push({
    id: uid(), producto, cantidad, unidad, categoria,
    fecha: new Date().toISOString(), comprado: false,
  });
  if (datos.stock[producto]) {
    datos.stock[producto].actual = Math.max(0, datos.stock[producto].actual - cantidad);
  }
  guardarDatos();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const producto = inputProducto.value.trim();
  const cantidad = parseFloat(document.getElementById('cantidad').value);
  if (!producto) { toast('Escribí qué producto consumiste'); inputProducto.focus(); return; }
  if (!(cantidad > 0)) { toast('Poné una cantidad mayor a 0'); document.getElementById('cantidad').focus(); return; }
  registrarConsumo(producto, cantidad, inputUnidad.value, inputCategoria.value);
  toast(`Agregado: ${producto}`);
  form.reset();
  document.getElementById('cantidad').value = 1;
  inputProducto.focus();
  refrescarTodo();
});

// Autocompleta unidad y categoría a partir del nombre escrito
function autocompletarProducto() {
  const info = infoProducto(inputProducto.value);
  if (info) {
    inputUnidad.value = info.unidad;
    inputCategoria.value = info.categoria;
  }
}

// ----- Desplegable de sugerencias propio (reemplaza al <datalist> nativo) -----
const sugBox = document.getElementById('sugerencias');
let sugIndex = -1;

function mostrarSugerencias() {
  const q = normaliza(inputProducto.value);
  if (!q) { ocultarSugerencias(); return; }
  // coincidencias por contenido, priorizando las que empiezan igual
  const matches = nombresConocidos()
    .filter(n => normaliza(n).includes(q))
    .sort((a, b) => (normaliza(b).startsWith(q) ? 1 : 0) - (normaliza(a).startsWith(q) ? 1 : 0))
    .slice(0, 8);
  if (matches.length === 0) { ocultarSugerencias(); return; }
  sugBox.innerHTML = matches.map(n => `<div data-nombre="${escapeHtml(n)}">${escapeHtml(n)}</div>`).join('');
  sugBox.hidden = false;
  sugIndex = -1;
  sugBox.querySelectorAll('div').forEach(d => {
    d.addEventListener('mousedown', (e) => { e.preventDefault(); elegirSugerencia(d.dataset.nombre); });
  });
}
function ocultarSugerencias() { sugBox.hidden = true; sugIndex = -1; }
function elegirSugerencia(nombre) {
  inputProducto.value = nombre;
  autocompletarProducto();
  ocultarSugerencias();
  document.getElementById('cantidad').focus();
}

inputProducto.addEventListener('input', () => { autocompletarProducto(); mostrarSugerencias(); });
inputProducto.addEventListener('focus', mostrarSugerencias);
inputProducto.addEventListener('blur', () => setTimeout(ocultarSugerencias, 150));
inputProducto.addEventListener('keydown', (e) => {
  if (sugBox.hidden) return;
  const items = [...sugBox.querySelectorAll('div')];
  if (e.key === 'ArrowDown') { e.preventDefault(); sugIndex = Math.min(items.length - 1, sugIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sugIndex = Math.max(0, sugIndex - 1); }
  else if (e.key === 'Enter') {
    if (sugIndex >= 0 && items[sugIndex]) { e.preventDefault(); elegirSugerencia(items[sugIndex].dataset.nombre); }
    return;
  } else if (e.key === 'Escape') { ocultarSugerencias(); return; }
  else return;
  items.forEach((d, i) => d.classList.toggle('activa', i === sugIndex));
  if (items[sugIndex]) items[sugIndex].scrollIntoView({ block: 'nearest' });
});

function renderBotonesRapidos() {
  const cuenta = {};
  for (const c of datos.consumos) cuenta[c.producto] = (cuenta[c.producto] || 0) + 1;
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const cont = document.getElementById('botones-rapidos');
  if (top.length === 0) {
    cont.innerHTML = '<span class="hint">Cuando cargues seguido, acá van a aparecer accesos rápidos.</span>';
    return;
  }
  const cat = catalogo();
  cont.innerHTML = top.map(([n]) => `
    <div class="chip-card" data-prod="${escapeHtml(n)}">
      <span class="chip-nombre">${escapeHtml(n)} <small>${escapeHtml(cat[n].unidad)}</small></span>
      <span class="chip-ctrl">
        <button type="button" class="iconbtn menos">−</button>
        <input type="number" step="any" min="0" class="chip-cant" value="1" />
        <button type="button" class="iconbtn mas">+</button>
      </span>
      <button type="button" class="chip-add">Agregar</button>
    </div>`).join('');

  cont.querySelectorAll('.chip-card').forEach(card => {
    const prod = card.dataset.prod;
    const input = card.querySelector('.chip-cant');
    card.querySelector('.menos').addEventListener('click', () => {
      input.value = Math.max(0, (parseFloat(input.value) || 0) - 1);
    });
    card.querySelector('.mas').addEventListener('click', () => {
      input.value = (parseFloat(input.value) || 0) + 1;
    });
    card.querySelector('.chip-add').addEventListener('click', () => {
      const q = parseFloat(input.value);
      if (!(q > 0)) { toast('Poné una cantidad mayor a 0'); return; }
      const info = cat[prod];
      registrarConsumo(prod, q, info.unidad, info.categoria);
      toast(`+${fmtCant(q)} ${prod}`);
      refrescarTodo();
    });
  });
}

function renderUltimos() {
  const ul = document.getElementById('ultimos');
  const ultimos = [...datos.consumos].reverse().slice(0, 8);
  if (ultimos.length === 0) {
    ul.innerHTML = '<li class="vacio">Todavía no cargaste nada.</li>';
    return;
  }
  ul.innerHTML = ultimos.map(c => `
    <li>
      <span class="nombre">${escapeHtml(c.producto)}
        <div class="fecha">${fmtFecha(c.fecha)}</div>
      </span>
      <span class="cant">${fmtCant(c.cantidad)} ${escapeHtml(c.unidad)}</span>
      <button class="iconbtn editar" data-id="${c.id}" title="Editar cantidad">${icono('lapiz')}</button>
      <button class="iconbtn borrar" data-id="${c.id}" title="Borrar">✕</button>
    </li>`).join('');
  ul.querySelectorAll('.borrar').forEach(btn => btn.addEventListener('click', () => {
    const c = datos.consumos.find(x => x.id === btn.dataset.id);
    const nombre = c ? c.producto : 'este registro';
    abrirConfirm(`¿Borrar el registro de ${nombre}?`, () => {
      datos.consumos = datos.consumos.filter(x => x.id !== btn.dataset.id);
      guardarDatos(); toast('Borrado'); refrescarTodo();
    });
  }));
  ul.querySelectorAll('.editar').forEach(btn => btn.addEventListener('click', () => {
    const c = datos.consumos.find(x => x.id === btn.dataset.id);
    if (!c) return;
    const val = prompt(`Nueva cantidad para ${c.producto} (${c.unidad}):`, c.cantidad);
    if (val === null) return;
    const num = parseFloat(val);
    if (!(num > 0)) { toast('Cantidad inválida'); return; }
    c.cantidad = num;
    guardarDatos(); toast('Cantidad actualizada'); refrescarTodo();
  }));
}

// ===== PREDICCIÓN "se te está por acabar" (feature 7) =====
// Mira cada cuántos días solés consumir cada producto y, si ya pasó ese tiempo
// desde la última vez, lo marca como "por acabarse".
function productosPorAcabarse() {
  const porProd = {};
  for (const c of datos.consumos) {
    (porProd[c.producto] = porProd[c.producto] || []).push(new Date(c.fecha).getTime());
  }
  const ahora = Date.now();
  const DIA = 86400000;
  const aviso = [];
  for (const [prod, tiemposRaw] of Object.entries(porProd)) {
    const t = tiemposRaw.sort((a, b) => a - b);
    if (t.length < 3) continue; // hace falta historial para estimar
    let suma = 0;
    for (let i = 1; i < t.length; i++) suma += (t[i] - t[i - 1]);
    const intervaloProm = suma / (t.length - 1) / DIA;
    const diasDesdeUltimo = (ahora - t[t.length - 1]) / DIA;
    if (intervaloProm > 0 && diasDesdeUltimo >= intervaloProm * 0.8) {
      aviso.push({ producto: prod, cada: Math.round(intervaloProm), hace: Math.round(diasDesdeUltimo) });
    }
  }
  return aviso.sort((a, b) => (b.hace - b.cada) - (a.hace - a.cada));
}

function renderPrediccion() {
  const cont = document.getElementById('alerta-prediccion');
  const avisos = productosPorAcabarse();
  if (avisos.length === 0) { cont.style.display = 'none'; return; }
  cont.style.display = '';
  cont.innerHTML = icono('campana') + ' <strong>Se te está por acabar:</strong> ' +
    avisos.map(a => `${escapeHtml(a.producto)}`).join(', ') +
    `<div class="alerta-detalle">Según tu ritmo de consumo (lo usás cada ~${avisos[0].cada} días).</div>`;
}

// ===== STOCK (feature 4) =====
function renderStock() {
  const ul = document.getElementById('lista-stock');
  const cat = catalogo();
  const nombres = Object.keys(cat).sort();
  if (nombres.length === 0) {
    ul.innerHTML = '<li class="vacio">Cargá algún consumo primero para empezar a controlar stock.</li>';
    return;
  }
  ul.innerHTML = nombres.map(n => {
    const st = datos.stock[n] || { actual: 0, minimo: 0 };
    const bajo = st.minimo > 0 && st.actual < st.minimo;
    return `
      <li class="stock-row ${bajo ? 'stock-bajo' : ''}">
        <span class="nombre">${escapeHtml(n)}
          <div class="fecha">${escapeHtml(cat[n].unidad)} ${bajo ? `· ${icono('bajando')} poco` : ''}</div>
        </span>
        <span class="stock-ctrl">
          <button class="iconbtn menos" data-prod="${escapeHtml(n)}">−</button>
          <input class="stock-actual" type="number" step="any" data-prod="${escapeHtml(n)}" value="${st.actual}" />
          <button class="iconbtn mas" data-prod="${escapeHtml(n)}">+</button>
        </span>
        <span class="stock-min">mín<input class="stock-minimo" type="number" step="any" data-prod="${escapeHtml(n)}" value="${st.minimo}" /></span>
      </li>`;
  }).join('');

  function asegurar(prod) {
    if (!datos.stock[prod]) datos.stock[prod] = { actual: 0, minimo: 0 };
    return datos.stock[prod];
  }
  ul.querySelectorAll('.mas').forEach(b => b.addEventListener('click', () => {
    asegurar(b.dataset.prod).actual += 1; guardarDatos(); renderStock(); renderLista();
  }));
  ul.querySelectorAll('.menos').forEach(b => b.addEventListener('click', () => {
    const s = asegurar(b.dataset.prod); s.actual = Math.max(0, s.actual - 1);
    guardarDatos(); renderStock(); renderLista();
  }));
  ul.querySelectorAll('.stock-actual').forEach(inp => inp.addEventListener('change', () => {
    asegurar(inp.dataset.prod).actual = parseFloat(inp.value) || 0; guardarDatos(); renderStock(); renderLista();
  }));
  ul.querySelectorAll('.stock-minimo').forEach(inp => inp.addEventListener('change', () => {
    asegurar(inp.dataset.prod).minimo = parseFloat(inp.value) || 0; guardarDatos(); renderStock(); renderLista();
  }));
}

// ===== LISTA DE COMPRAS =====
// Junta: (a) lo consumido sin reponer + (b) productos con stock bajo.
function listaPendiente() {
  const map = {};
  const cat = catalogo();
  for (const c of datos.consumos) {
    if (c.comprado) continue;
    if (!map[c.producto]) map[c.producto] = { producto: c.producto, cantidad: 0, unidad: c.unidad, categoria: c.categoria, motivo: 'consumo' };
    map[c.producto].cantidad += c.cantidad;
  }
  // agregar productos con poco stock (solo si definiste un mínimo)
  for (const [prod, st] of Object.entries(datos.stock)) {
    if (st.minimo > 0 && st.actual < st.minimo) {
      if (!map[prod]) {
        map[prod] = { producto: prod, cantidad: 0, unidad: cat[prod] ? cat[prod].unidad : '', categoria: cat[prod] ? cat[prod].categoria : 'Otros', motivo: 'stock' };
      }
      map[prod].stockBajo = true;
    }
  }
  return Object.values(map).sort((a, b) =>
    a.categoria.localeCompare(b.categoria) || a.producto.localeCompare(b.producto));
}

// El "carrito" (productos que ya pusiste en el changuito) se guarda para no perderlo.
const seleccionados = new Set(datos.carrito);

function guardarCarrito() {
  datos.carrito = [...seleccionados];
  guardarDatos();
}

function renderLista() {
  const ul = document.getElementById('lista-compras');
  const items = listaPendiente();
  const acciones = ['btn-confirmar', 'btn-whatsapp', 'btn-copiar'];
  if (items.length === 0) {
    ul.innerHTML = '<li class="vacio">¡Lista vacía! No hay nada para reponer.</li>';
    acciones.forEach(id => document.getElementById(id).style.display = 'none');
    return;
  }
  acciones.forEach(id => document.getElementById(id).style.display = '');
  ul.innerHTML = items.map(it => {
    const detalle = it.stockBajo
      ? `${escapeHtml(it.categoria)} · ${icono('bajando')} poco stock`
      : escapeHtml(it.categoria);
    const cant = it.cantidad > 0 ? `${fmtCant(it.cantidad)} ${escapeHtml(it.unidad)}` : '—';
    const enCarrito = seleccionados.has(it.producto);
    return `
      <li class="${enCarrito ? 'en-carrito' : ''}">
        <input type="checkbox" title="Marcar como puesto en el carrito" data-prod="${escapeHtml(it.producto)}" ${enCarrito ? 'checked' : ''} />
        <span class="nombre">${escapeHtml(it.producto)}<div class="fecha">${detalle}</div></span>
        <span class="cant">${cant}</span>
      </li>`;
  }).join('');
  ul.querySelectorAll('input[type=checkbox]').forEach(chk => chk.addEventListener('change', () => {
    if (chk.checked) seleccionados.add(chk.dataset.prod); else seleccionados.delete(chk.dataset.prod);
    chk.closest('li').classList.toggle('en-carrito', chk.checked); // tachar al instante
    guardarCarrito();
    actualizarBotonConfirmar();
  }));
  actualizarBotonConfirmar();
}

// El botón confirma lo del carrito; si no hay nada marcado, confirma toda la lista.
function actualizarBotonConfirmar() {
  const btn = document.getElementById('btn-confirmar');
  const n = seleccionados.size;
  btn.innerHTML = icono('check') + (n > 0 ? ` Confirmar compra (${n})` : ' Confirmar toda la lista');
}

function ejecutarConfirmarCompra(aComprar) {
  for (const c of datos.consumos) {
    if (!c.comprado && aComprar.has(c.producto)) c.comprado = true;
  }
  // Al comprar, repone el stock al menos hasta el mínimo (deja de estar "bajo")
  for (const prod of aComprar) {
    if (datos.stock[prod] && datos.stock[prod].actual < datos.stock[prod].minimo) {
      datos.stock[prod].actual = datos.stock[prod].minimo;
    }
  }
  seleccionados.clear();
  datos.carrito = [];
  guardarDatos();
  toast('Compra confirmada');
  refrescarTodo();
}

document.getElementById('btn-confirmar').addEventListener('click', () => {
  const items = listaPendiente();
  const aComprar = seleccionados.size > 0 ? new Set(seleccionados) : new Set(items.map(i => i.producto));
  if (aComprar.size === 0) return;
  const n = aComprar.size;
  const mensaje = seleccionados.size > 0
    ? `¿Confirmás la compra de ${n} producto${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}? Se archivarán en el historial.`
    : `¿Confirmás la compra de toda la lista (${n} producto${n > 1 ? 's' : ''})? Se archivarán en el historial.`;
  abrirConfirm(mensaje, () => ejecutarConfirmarCompra(aComprar));
});

function textoLista() {
  const items = listaPendiente();
  return '🛒 Lista de compras:\n' + items.map(it =>
    `• ${it.producto}${it.cantidad > 0 ? ` (${fmtCant(it.cantidad)} ${it.unidad})` : ''}${it.stockBajo ? ' [poco stock]' : ''}`
  ).join('\n');
}

// Copia texto al portapapeles con plan B para entornos restrictivos
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Método clásico: textarea oculto + execCommand
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, texto.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

document.getElementById('btn-copiar').addEventListener('click', async () => {
  const ok = await copiarTexto(textoLista());
  toast(ok ? 'Lista copiada' : 'No se pudo copiar');
});

// Compartir por WhatsApp (feature 3)
document.getElementById('btn-whatsapp').addEventListener('click', async () => {
  const texto = textoLista();
  if (navigator.share) {
    try { await navigator.share({ text: texto }); } catch { /* cancelado por el usuario */ }
    return;
  }
  const url = 'https://wa.me/?text=' + encodeURIComponent(texto);
  const w = window.open(url, '_blank');
  if (!w) location.href = url; // ventana emergente bloqueada: abrir en la misma pestaña
});

// ===== HISTORIAL =====
let grafico = null;

function mesClave(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function etiquetaMes(m) {
  const [a, mm] = m.split('-');
  return new Date(a, mm - 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
}

function datosHistorial(dimension, filtro) {
  const mesesSet = new Set();
  const series = {};
  const f = (filtro || '').toLowerCase();
  for (const c of datos.consumos) {
    const clave = c[dimension];
    if (f && !clave.toLowerCase().includes(f)) continue;
    const mes = mesClave(c.fecha);
    mesesSet.add(mes);
    series[clave] = series[clave] || {};
    series[clave][mes] = (series[clave][mes] || 0) + c.cantidad;
  }
  return { meses: [...mesesSet].sort(), series };
}

const PALETA = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

function paramsHistorial() {
  return {
    dim: document.getElementById('ver-por').value,
    filtro: document.getElementById('filtro-historial').value.trim(),
  };
}

function renderGrafico() {
  const { dim, filtro } = paramsHistorial();
  const { meses, series } = datosHistorial(dim, filtro);
  const canvas = document.getElementById('grafico-mes');
  if (meses.length === 0) {
    if (grafico) { grafico.destroy(); grafico = null; }
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = '';
  const datasets = Object.keys(series).map((clave, i) => ({
    label: clave,
    data: meses.map(m => series[clave][m] || 0),
    backgroundColor: PALETA[i % PALETA.length],
  }));
  if (grafico) grafico.destroy();
  grafico = new Chart(canvas, {
    type: 'bar',
    data: { labels: meses.map(etiquetaMes), datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });
}

function renderTablaHistorial() {
  const { dim, filtro } = paramsHistorial();
  const { meses, series } = datosHistorial(dim, filtro);
  const cont = document.getElementById('tabla-historial');
  if (meses.length === 0) { cont.innerHTML = '<p class="vacio">Sin datos todavía.</p>'; return; }

  const ultimo = meses[meses.length - 1];
  const previo = meses.length >= 2 ? meses[meses.length - 2] : null;

  let html = '<table><thead><tr><th>' + (dim === 'categoria' ? 'Categoría' : 'Producto') + '</th>';
  html += meses.map(m => `<th>${etiquetaMes(m)}</th>`).join('');
  html += '<th title="Último mes vs. anterior">Tend.</th></tr></thead><tbody>';
  for (const clave of Object.keys(series).sort()) {
    html += `<tr><td>${escapeHtml(clave)}</td>`;
    html += meses.map(m => `<td class="num">${series[clave][m] ? fmtCant(series[clave][m]) : '–'}</td>`).join('');
    // Tendencia: comparar último mes con el previo (feature 11)
    let tend = '<td class="tend">–</td>';
    if (previo) {
      const a = series[clave][ultimo] || 0, b = series[clave][previo] || 0;
      if (a > b) tend = '<td class="tend sube">▲</td>';
      else if (a < b) tend = '<td class="tend baja">▼</td>';
      else tend = '<td class="tend igual">=</td>';
    }
    html += tend + '</tr>';
  }
  html += '</tbody></table>';
  cont.innerHTML = html;
}

function renderHistorial() { renderGrafico(); renderTablaHistorial(); }

document.getElementById('ver-por').addEventListener('change', renderHistorial);
document.getElementById('filtro-historial').addEventListener('input', renderHistorial);

// ===== EXPORTAR A EXCEL =====
document.getElementById('btn-excel').addEventListener('click', () => {
  if (datos.consumos.length === 0) { toast('No hay datos para exportar'); return; }
  const detalle = datos.consumos.map(c => ({
    Fecha: new Date(c.fecha).toLocaleString('es-AR'),
    Mes: mesClave(c.fecha),
    Producto: c.producto, Cantidad: c.cantidad, Unidad: c.unidad,
    Categoría: c.categoria, Estado: c.comprado ? 'Comprado' : 'Pendiente',
  }));
  const { meses, series } = datosHistorial('producto', '');
  const resumen = Object.keys(series).sort().map(prod => {
    const fila = { Producto: prod };
    meses.forEach(m => { fila[etiquetaMes(m)] = series[prod][m] || 0; });
    return fila;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen por mes');
  XLSX.writeFile(wb, `mi-despensa-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Excel generado');
});

// ===== BACKUP / RESTAURAR (feature 2) =====
document.getElementById('btn-backup').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo-despensa-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Respaldo descargado');
});

const fileRestore = document.getElementById('file-restore');
document.getElementById('btn-restore').addEventListener('click', () => fileRestore.click());
fileRestore.addEventListener('change', () => {
  const file = fileRestore.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let nuevo;
    try {
      nuevo = JSON.parse(reader.result);
      if (!Array.isArray(nuevo.consumos)) throw new Error('formato');
    } catch {
      toast('El archivo no es un respaldo válido');
      fileRestore.value = '';
      return;
    }
    abrirConfirm('Esto reemplazará TODOS tus datos actuales por los del respaldo. ¿Continuar?', () => {
      datos = { consumos: nuevo.consumos, stock: nuevo.stock || {}, carrito: nuevo.carrito || [] };
      seleccionados.clear();
      (datos.carrito || []).forEach(p => seleccionados.add(p));
      guardarDatos();
      toast('Datos restaurados');
      refrescarTodo();
    });
    fileRestore.value = '';
  };
  reader.readAsText(file);
});

// ===== INSTALAR APP (feature 9) =====
let promptInstalar = null;
const btnInstalar = document.getElementById('btn-instalar');

// Si ya está instalada y abierta como app, no tiene sentido el botón.
const yaInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!yaInstalada) btnInstalar.style.display = '';

// Chrome avisa cuando la app se puede instalar de un solo toque.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  btnInstalar.style.display = '';
});

btnInstalar.addEventListener('click', async () => {
  // Camino fácil: instalación de un toque (cuando el navegador lo permite).
  if (promptInstalar) {
    promptInstalar.prompt();
    const { outcome } = await promptInstalar.userChoice;
    promptInstalar = null;
    if (outcome === 'accepted') btnInstalar.style.display = 'none';
    return;
  }
  // Si no, explicamos cómo hacerlo a mano según el navegador.
  abrirConfirm(
    'Para tenerla como app en tu celular:\n\n' +
    '1) Abrí esta página en Chrome\n' +
    '2) Tocá el menú ⋮ (arriba a la derecha)\n' +
    '3) Elegí "Agregar a la pantalla principal"\n\n' +
    '¡Listo! Queda con su ícono junto a tus otras apps.',
    null,
    true
  );
});
window.addEventListener('appinstalled', () => { btnInstalar.style.display = 'none'; });

// ===== Cuadro de confirmación (modal Sí/No con pantalla oscurecida) =====
const modalOverlay = document.getElementById('modal-overlay');
const modalMensaje = document.getElementById('modal-mensaje');
let modalAccion = null;

function abrirConfirm(mensaje, onSi, soloInfo) {
  modalMensaje.textContent = mensaje;
  modalAccion = onSi;
  // soloInfo = aviso de una sola opción ("Entendido"), sin pregunta Sí/No.
  document.getElementById('modal-no').style.display = soloInfo ? 'none' : '';
  document.getElementById('modal-si').textContent = soloInfo ? 'Entendido' : 'Sí';
  modalOverlay.style.display = 'flex';
}
function cerrarConfirm() {
  modalOverlay.style.display = 'none';
  modalAccion = null;
}
document.getElementById('modal-si').addEventListener('click', () => {
  const accion = modalAccion;
  cerrarConfirm();
  if (accion) accion();
});
document.getElementById('modal-no').addEventListener('click', cerrarConfirm);
// Tocar fuera del cuadro = cancelar
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) cerrarConfirm(); });
// Tecla Escape = cancelar
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (modalOverlay.style.display !== 'none') cerrarConfirm();
  else if (ajustesOverlay.style.display !== 'none') cerrarAjustes();
});

// ===== Color principal personalizable =====
const COLORES = [
  { n: 'Azul', c: '#2563eb', o: '#1e40af' },
  { n: 'Verde', c: '#16a34a', o: '#15803d' },
  { n: 'Violeta', c: '#7c3aed', o: '#6d28d9' },
  { n: 'Turquesa', c: '#0891b2', o: '#0e7490' },
  { n: 'Naranja', c: '#ea580c', o: '#c2410c' },
  { n: 'Rosa', c: '#db2777', o: '#be185d' },
  { n: 'Rojo', c: '#dc2626', o: '#b91c1c' },
  { n: 'Grafito', c: '#475569', o: '#334155' },
];

function colorActual() {
  return localStorage.getItem('despensa_color') || '#2563eb';
}

// Oscurece un color hex ~22% (para el estado "presionado" de los botones)
function derivarOscuro(hex) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const d = x => Math.round(x * 0.78).toString(16).padStart(2, '0');
  return '#' + d(r) + d(g) + d(b);
}

function aplicarColor(color, oscuro) {
  document.documentElement.style.setProperty('--azul', color);
  document.documentElement.style.setProperty('--azul-osc', oscuro || derivarOscuro(color));
  localStorage.setItem('despensa_color', color);
  if (temaActual() === 'light') {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = color;
  }
}

function aplicarColorGuardado() {
  const c = colorActual();
  const preset = COLORES.find(x => x.c.toLowerCase() === c.toLowerCase());
  aplicarColor(c, preset ? preset.o : derivarOscuro(c));
}

// ===== Color de fondo y de letra personalizables =====
// Mezcla dos colores hex: t=0 da el primero, t=1 el segundo
function mezclar(h1, h2, t) {
  const p = h => h.replace('#', '').match(/../g).map(x => parseInt(x, 16));
  const a = p(h1), b = p(h2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// ¿El color es claro? (para decidir si los detalles van más oscuros o más claros)
function esClaro(hex) {
  const [r, g, b] = hex.replace('#', '').match(/../g).map(x => parseInt(x, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

const FONDOS = [
  { n: 'Blanco', c: '#ffffff' },
  { n: 'Crema', c: '#f7f3ea' },
  { n: 'Gris perla', c: '#f3f4f6' },
  { n: 'Celeste suave', c: '#eaf2fb' },
  { n: 'Verde agua', c: '#e8f5ef' },
  { n: 'Azul noche', c: '#0f172a' },
  { n: 'Grafito', c: '#1f2937' },
  { n: 'Negro', c: '#18181b' },
];
const LETRAS = [
  { n: 'Negro azulado', c: '#0f172a' },
  { n: 'Negro', c: '#111111' },
  { n: 'Gris oscuro', c: '#374151' },
  { n: 'Azul marino', c: '#1e3a8a' },
  { n: 'Marrón', c: '#44403c' },
  { n: 'Blanco suave', c: '#e2e8f0' },
  { n: 'Blanco', c: '#ffffff' },
  { n: 'Beige claro', c: '#e7e5e4' },
];

const RAIZ = document.documentElement.style;

// Fondo que se está viendo ahora (elegido por el usuario, o el del tema)
function fondoEfectivo() {
  return localStorage.getItem('despensa_fondo') ||
    (temaActual() === 'dark' ? '#0f172a' : '#ffffff');
}
function letraEfectiva() {
  return localStorage.getItem('despensa_letra') ||
    (temaActual() === 'dark' ? '#e2e8f0' : '#0f172a');
}

// color=null vuelve al automático (lo que trae el tema claro/oscuro)
function aplicarFondo(color) {
  if (!color) {
    ['--bg', '--bg-elev', '--gris', '--borde'].forEach(v => RAIZ.removeProperty(v));
    localStorage.removeItem('despensa_fondo');
  } else {
    const claro = esClaro(color);
    RAIZ.setProperty('--bg', color);
    // Derivados: tarjetas, fondos suaves y bordes que combinen con el fondo elegido
    RAIZ.setProperty('--bg-elev', claro ? mezclar(color, '#ffffff', 0.5) : mezclar(color, '#ffffff', 0.07));
    RAIZ.setProperty('--gris', claro ? mezclar(color, '#000000', 0.05) : mezclar(color, '#ffffff', 0.08));
    RAIZ.setProperty('--borde', claro ? mezclar(color, '#000000', 0.11) : mezclar(color, '#ffffff', 0.17));
    localStorage.setItem('despensa_fondo', color);
  }
  aplicarLetraGuardada(); // el gris de los textos secundarios depende del fondo
}

function aplicarLetra(color) {
  if (!color) {
    ['--texto', '--gris-osc'].forEach(v => RAIZ.removeProperty(v));
    localStorage.removeItem('despensa_letra');
    return;
  }
  RAIZ.setProperty('--texto', color);
  // Texto secundario: el mismo color, desvanecido hacia el fondo
  RAIZ.setProperty('--gris-osc', mezclar(color, fondoEfectivo(), 0.4));
  localStorage.setItem('despensa_letra', color);
}

function aplicarLetraGuardada() { aplicarLetra(localStorage.getItem('despensa_letra')); }
function aplicarFondoGuardado() {
  const c = localStorage.getItem('despensa_fondo');
  if (c) aplicarFondo(c); else aplicarLetraGuardada();
}

// ----- Panel de ajustes -----
const ajustesOverlay = document.getElementById('ajustes-overlay');

// Dibuja una fila de circulitos de color. Con conAuto, el primero es "automático".
function renderSwatches(contId, lista, actual, conAuto, onPick) {
  const cont = document.getElementById(contId);
  const act = (actual || '').toLowerCase();
  let html = conAuto
    ? `<button type="button" class="auto ${!actual ? 'activo' : ''}" title="Automático (según el tema)"></button>`
    : '';
  html += lista.map(x =>
    `<button type="button" title="${x.n}" data-c="${x.c}" style="background:${x.c}" class="${x.c.toLowerCase() === act ? 'activo' : ''}"></button>`
  ).join('');
  cont.innerHTML = html;
  cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    onPick(b.classList.contains('auto') ? null : b.dataset.c);
    renderAjustes();
  }));
}

function renderAjustes() {
  renderSwatches('colores-presets', COLORES, colorActual(), false, (c) => {
    const preset = COLORES.find(x => x.c === c);
    aplicarColor(c, preset ? preset.o : undefined);
  });
  renderSwatches('fondos-presets', FONDOS, localStorage.getItem('despensa_fondo'), true, aplicarFondo);
  renderSwatches('letras-presets', LETRAS, localStorage.getItem('despensa_letra'), true, aplicarLetra);
  document.getElementById('color-custom').value = colorActual();
  document.getElementById('fondo-custom').value = fondoEfectivo();
  document.getElementById('letra-custom').value = letraEfectiva();
}

function abrirAjustes() {
  renderAjustes();
  ajustesOverlay.style.display = 'flex';
}
function cerrarAjustes() { ajustesOverlay.style.display = 'none'; }

document.getElementById('btn-ajustes').addEventListener('click', abrirAjustes);
document.getElementById('ajustes-cerrar').addEventListener('click', cerrarAjustes);
// Tocar fuera del panel = cerrar, solo si el gesto EMPEZÓ sobre el fondo
// (evita cierres falsos cuando se arrastra desde adentro o el clic que lo abrió)
let ajustesDownEnFondo = false;
ajustesOverlay.addEventListener('mousedown', (e) => { ajustesDownEnFondo = (e.target === ajustesOverlay); });
ajustesOverlay.addEventListener('click', (e) => {
  if (e.target === ajustesOverlay && ajustesDownEnFondo) cerrarAjustes();
  ajustesDownEnFondo = false;
});
document.getElementById('color-custom').addEventListener('input', (e) => {
  aplicarColor(e.target.value);
  renderAjustes();
});
document.getElementById('fondo-custom').addEventListener('input', (e) => {
  aplicarFondo(e.target.value);
  renderAjustes();
});
document.getElementById('letra-custom').addEventListener('input', (e) => {
  aplicarLetra(e.target.value);
  renderAjustes();
});

// ===== Tema claro/oscuro =====
const btnTema = document.getElementById('btn-tema');
function temaActual() {
  return localStorage.getItem('despensa_tema') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  btnTema.innerHTML = icono(tema === 'dark' ? 'sol' : 'luna');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = tema === 'dark' ? '#0f172a' : colorActual();
  if (window.Chart) {
    Chart.defaults.color = tema === 'dark' ? '#94a3b8' : '#64748b';
    Chart.defaults.borderColor = tema === 'dark' ? '#334155' : '#e2e8f0';
  }
}
btnTema.addEventListener('click', () => {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('despensa_tema', nuevo);
  // Un fondo/letra elegidos a mano pisan a los del tema y el cambio no se
  // vería: al cambiar de tema vuelven al automático para que el tema mande.
  const habiaPersonalizados = localStorage.getItem('despensa_fondo') || localStorage.getItem('despensa_letra');
  aplicarTema(nuevo);
  aplicarFondo(null);
  aplicarLetra(null);
  if (habiaPersonalizados) toast('Fondo y letra volvieron al automático del tema');
  if (document.getElementById('tab-historial').classList.contains('active')) renderGrafico();
});
aplicarColorGuardado();
aplicarTema(temaActual());
aplicarFondoGuardado();

// ===== Navegación por pestañas =====
const TITULOS = {
  cargar: `${icono('lapiz')} Anotar consumo`,
  lista: `${icono('carrito')} Lista de compras`,
  stock: `${icono('caja')} Mi stock`,
  historial: `${icono('grafico')} Historial`,
};
const tituloHeader = document.querySelector('header h1');

document.querySelectorAll('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    btn.classList.add('active');
    tituloHeader.innerHTML = TITULOS[tab];
    if (tab === 'historial') renderHistorial();
    if (tab === 'stock') renderStock();
  });
});
tituloHeader.innerHTML = TITULOS.cargar;

// Rellena los íconos de los elementos fijos del HTML (pestañas, botones, tarjetas)
document.querySelectorAll('[data-ico]').forEach(el => { el.innerHTML = icono(el.dataset.ico); });

// ===== refresco general =====
function refrescarTodo() {
  renderPrediccion();
  renderBotonesRapidos();
  renderUltimos();
  renderLista();
  if (document.getElementById('tab-stock').classList.contains('active')) renderStock();
  if (document.getElementById('tab-historial').classList.contains('active')) renderHistorial();
}

refrescarTodo();

// Service worker (para que funcione offline)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
