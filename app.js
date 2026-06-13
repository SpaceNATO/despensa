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
// Migración: sembrar max = actual en ítems que no tienen max guardado
Object.values(datos.stock).forEach(st => { if (!(st.max > 0) && st.actual > 0) st.max = st.actual; });
guardarDatos();

// ===== NUBE: compartir la despensa entre celulares (Firebase) =====
// En "modo casa" los datos viven en Firestore y se sincronizan en vivo.
// Sin casa, todo sigue igual que siempre (solo en este teléfono).
const firebaseConfig = {
  apiKey: "AIzaSyDh_Zmxz6SLxd2OE6WQgNpatKoXOg17Zds",
  authDomain: "mi-despensa-8214e.firebaseapp.com",
  projectId: "mi-despensa-8214e",
  storageBucket: "mi-despensa-8214e.firebasestorage.app",
  messagingSenderId: "912403854105",
  appId: "1:912403854105:web:362351ad3a44c0e5694b88",
};
const CASA_KEY = 'despensa_casa';
let fbApp = null, fbDb = null, fbAuth = null, casaUnsub = [];

function casaActual() { return localStorage.getItem(CASA_KEY) || null; }
function enCasa() { return !!casaActual(); }
function casaRef() { return fbDb.collection('casas').doc(casaActual()); }

function fbInit() {
  if (fbApp) return true;
  if (!window.firebase) return false;
  try {
    fbApp = firebase.initializeApp(firebaseConfig);
    fbDb = firebase.firestore();
    fbAuth = firebase.auth();
    fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // funciona offline
    return true;
  } catch { return false; }
}
async function fbLogin() {
  if (!fbInit()) throw new Error('sin-firebase');
  if (fbAuth.currentUser) return fbAuth.currentUser;
  await fbAuth.signInAnonymously();
  return new Promise(res => {
    const off = fbAuth.onAuthStateChanged(u => { if (u) { off(); res(u); } });
  });
}
function avisarErrorNube(e) { console.warn('nube:', e && e.message); }

// Código de casa difícil de adivinar (sin letras/números que se confunden)
function generarCodigo() {
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
  return s;
}
function idStock(prod) { return encodeURIComponent(prod).replace(/\./g, '%2E').slice(0, 300); }
const fv = () => firebase.firestore.FieldValue;

// ---- Operaciones en la nube (solo se usan en modo casa) ----
function nubeAgregarConsumo(c) { casaRef().collection('consumos').doc(c.id).set(c).catch(avisarErrorNube); }
function nubeEditarConsumo(id, campos) { casaRef().collection('consumos').doc(id).update(campos).catch(avisarErrorNube); }
function nubeBorrarConsumo(id) { casaRef().collection('consumos').doc(id).delete().catch(avisarErrorNube); }
function nubeIncrementarStock(prod, delta) {
  casaRef().collection('stock').doc(idStock(prod)).set({ producto: prod, actual: fv().increment(delta) }, { merge: true }).catch(avisarErrorNube);
}
function nubeSetStockCampo(prod, campo, valor) {
  casaRef().collection('stock').doc(idStock(prod)).set({ producto: prod, [campo]: valor }, { merge: true }).catch(avisarErrorNube);
}
function nubeSetCarrito(arr) { casaRef().collection('meta').doc('estado').set({ carrito: arr }, { merge: true }).catch(avisarErrorNube); }
function nubeConfirmarCompra(aComprar, cantidades) {
  const batch = fbDb.batch();
  for (const c of datos.consumos) {
    if (!c.comprado && aComprar.has(c.producto)) batch.update(casaRef().collection('consumos').doc(c.id), { comprado: true });
  }
  for (const prod of aComprar) {
    const st = datos.stock[prod];
    if (st) {
      const nivel = (cantidades && cantidades[prod] > 0) ? cantidades[prod] : Math.max(st.max || 0, st.minimo || 0);
      if (nivel > 0) batch.set(casaRef().collection('stock').doc(idStock(prod)), { producto: prod, actual: nivel, max: nivel }, { merge: true });
    }
  }
  batch.set(casaRef().collection('meta').doc('estado'), { carrito: [] }, { merge: true });
  batch.commit().catch(avisarErrorNube);
}
async function subirDatos(d) {
  let batch = fbDb.batch();
  for (const c of d.consumos) batch.set(casaRef().collection('consumos').doc(c.id || uid()), c);
  for (const [prod, st] of Object.entries(d.stock || {})) batch.set(casaRef().collection('stock').doc(idStock(prod)), { producto: prod, actual: st.actual || 0, minimo: st.minimo || 0 });
  batch.set(casaRef().collection('meta').doc('estado'), { carrito: d.carrito || [] });
  await batch.commit();
}
async function nubeReemplazarTodo(d) {
  const [cons, stk] = await Promise.all([casaRef().collection('consumos').get(), casaRef().collection('stock').get()]);
  const borr = fbDb.batch();
  cons.docs.forEach(x => borr.delete(x.ref));
  stk.docs.forEach(x => borr.delete(x.ref));
  await borr.commit();
  await subirDatos(d);
}

// ---- Escuchar la nube y reconstruir `datos` en vivo ----
let nubeConsumos = [], nubeStock = {}, nubeCarrito = [];
function recomponerDesdeNube() {
  datos = { consumos: nubeConsumos.slice(), stock: { ...nubeStock }, carrito: nubeCarrito.slice() };
  seleccionados.clear();
  nubeCarrito.forEach(p => seleccionados.add(p));
  refrescarTodo();
}
function cortarEscucha() { casaUnsub.forEach(u => u()); casaUnsub = []; }
function escucharCasa() {
  cortarEscucha();
  const ref = casaRef();
  casaUnsub.push(ref.collection('consumos').onSnapshot(snap => {
    nubeConsumos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    recomponerDesdeNube();
  }, avisarErrorNube));
  casaUnsub.push(ref.collection('stock').onSnapshot(snap => {
    const s = {};
    snap.docs.forEach(d => { const v = d.data(); s[v.producto] = { actual: Math.max(0, v.actual || 0), minimo: v.minimo || 0 }; });
    nubeStock = s; recomponerDesdeNube();
  }, avisarErrorNube));
  casaUnsub.push(ref.collection('meta').doc('estado').onSnapshot(d => {
    nubeCarrito = (d.exists && d.data().carrito) || [];
    recomponerDesdeNube();
  }, avisarErrorNube));
}

// ---- Crear / unirse / salir ----
async function crearCasa() {
  await fbLogin();
  const codigo = generarCodigo();
  localStorage.setItem(CASA_KEY, codigo);
  await casaRef().set({ creada: new Date().toISOString() }, { merge: true });
  await subirDatos(cargarDatos()); // sube lo que ya tenías en este teléfono
  escucharCasa();
  return codigo;
}
async function unirseCasa(codigo) {
  codigo = (codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (codigo.length < 6) { toast('Código inválido'); return false; }
  try {
    await fbLogin();
    localStorage.setItem(CASA_KEY, codigo);
    const doc = await casaRef().get();
    if (!doc.exists) { localStorage.removeItem(CASA_KEY); toast('No encontré esa casa. Revisá el código.'); return false; }
    escucharCasa();
    return true;
  } catch { localStorage.removeItem(CASA_KEY); toast('No se pudo conectar. ¿Hay internet?'); return false; }
}
function salirCasa() {
  cortarEscucha();
  localStorage.removeItem(CASA_KEY);
  datos = cargarDatos(); // vuelve a tu despensa local
  seleccionados.clear();
  (datos.carrito || []).forEach(p => seleccionados.add(p));
  refrescarTodo();
}
async function iniciarNube() {
  if (!enCasa()) return;
  try { await fbLogin(); escucharCasa(); } catch (e) { avisarErrorNube(e); }
}

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
  lupa: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
  mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z',
  mas: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  ajuste: 'M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 13.93 2h-3.86a.48.48 0 0 0-.48.41l-.36 2.54a7.3 7.3 0 0 0-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.71 8.47a.49.49 0 0 0 .12.61l2.03 1.98a7.07 7.07 0 0 0-.05.94 7.07 7.07 0 0 0 .05.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32a.49.49 0 0 0 .59.22l2.39-.96a7.3 7.3 0 0 0 1.62.94l.36 2.54a.48.48 0 0 0 .48.41h3.86a.48.48 0 0 0 .48-.41l.36-2.54a7.3 7.3 0 0 0 1.62-.94l2.39.96a.49.49 0 0 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z',
  personas: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  compartir: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.66 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z',
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
function tiempoRelativo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return fmtFecha(iso);
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
  const c = { id: uid(), producto, cantidad, unidad, categoria, fecha: new Date().toISOString(), comprado: false };
  if (enCasa()) {
    nubeAgregarConsumo(c);
    if (datos.stock[producto]) {
      const s = datos.stock[producto];
      if (!(s.max > 0) && s.actual > 0) nubeSetStockCampo(producto, 'max', s.actual);
      nubeIncrementarStock(producto, -cantidad);
    }
    return; // el listener actualiza `datos` y refresca
  }
  datos.consumos.push(c);
  if (datos.stock[producto]) {
    const s = datos.stock[producto];
    if (!(s.max > 0) && s.actual > 0) s.max = s.actual;
    s.actual = Math.max(0, s.actual - cantidad);
  }
  guardarDatos();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const producto = inputProducto.value.trim();
  const cantidad = parseFloat(document.getElementById('cantidad').value);
  if (!producto) { toast('Escribí qué producto consumiste'); inputProducto.focus(); return; }
  if (!(cantidad > 0)) { toast('Poné una cantidad mayor a 0'); document.getElementById('cantidad').focus(); return; }
  const ultimaCat = inputCategoria.value; // recordar la categoría elegida
  registrarConsumo(producto, cantidad, inputUnidad.value, inputCategoria.value);
  toast(`Agregado: ${producto}`);
  form.reset();
  document.getElementById('cantidad').value = 1;
  inputCategoria.value = ultimaCat; // no volver siempre a "Almacén"
  sincronizarChips(inputUnidad.value);
  inputCategoria.dispatchEvent(new Event('change'));
  refrescarTodo();
});

// Autocompleta unidad y categoría a partir del nombre escrito
function autocompletarProducto() {
  const info = infoProducto(inputProducto.value);
  if (info) {
    inputUnidad.value = info.unidad;
    sincronizarChips(info.unidad);
    inputCategoria.value = info.categoria;
    inputCategoria.dispatchEvent(new Event('change'));
  }
}

// ----- Dropdown propio para los <select> (Unidad, Categoría) -----
// Reemplaza el selector del sistema por un desplegable anclado al campo.
// opts.onAgregar (opcional) agrega un ítem "+ Nueva categoría…" al final.
function crearDropdown(select, opts) {
  opts = opts || {};
  const cs = document.createElement('div');
  cs.className = 'cs';
  select.parentNode.insertBefore(cs, select);
  cs.appendChild(select); // el select queda adentro, oculto, como fuente del valor
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cs-trigger';
  trigger.innerHTML = '<span class="cs-trigger-left">' + (opts.colorDot ? '<span class="cs-dot"></span>' : '') + '<span class="cs-valor"></span></span><svg class="cs-flecha" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const menu = document.createElement('div');
  menu.className = 'cs-menu';
  menu.hidden = true;
  cs.appendChild(trigger);
  cs.appendChild(menu);
  const valor = trigger.querySelector('.cs-trigger-left .cs-valor') || trigger.querySelector('.cs-valor');
  const dotEl = trigger.querySelector('.cs-dot');

  function cerrar() { cs.classList.remove('abierto'); menu.hidden = true; }
  function abrir() { cerrarDropdowns(cs); cs.classList.add('abierto'); menu.hidden = false; }
  function pintarDot() {
    if (!dotEl) return;
    try { dotEl.style.background = colorCategoria(select.value); } catch {}
  }
  function pintar() {
    const opt = select.options[select.selectedIndex];
    valor.textContent = opt ? opt.textContent : '';
    pintarDot();
    menu.querySelectorAll('.cs-opcion[data-val]').forEach(o => o.classList.toggle('activa', o.dataset.val === select.value));
  }
  function buildMenu() {
    menu.innerHTML = '';
    [...select.options].forEach(o => {
      const div = document.createElement('div');
      div.className = 'cs-opcion';
      div.dataset.val = o.value;
      if (opts.colorDot) {
        const dot = document.createElement('span');
        dot.className = 'cs-opcion-dot';
        try { dot.style.background = colorCategoria(o.value); } catch {}
        div.appendChild(dot);
      }
      const txt = document.createElement('span');
      txt.textContent = o.textContent;
      div.appendChild(txt);
      div.addEventListener('click', () => { select.value = o.value; select.dispatchEvent(new Event('change', { bubbles: true })); cerrar(); });
      menu.appendChild(div);
    });
    if (opts.onAgregar) {
      const add = document.createElement('div');
      add.className = 'cs-opcion cs-agregar';
      add.textContent = '+ Nueva categoría…';
      add.addEventListener('click', () => { cerrar(); opts.onAgregar(); });
      menu.appendChild(add);
    }
    pintar();
  }
  cs._rebuild = buildMenu;
  cs._cerrar = cerrar;
  trigger.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? abrir() : cerrar(); });
  select.addEventListener('change', pintar);
  buildMenu();
  if (opts.colorDot) setTimeout(() => { buildMenu(); pintarDot(); }, 0); // CAT_COLOR no inicializada aún
}
function cerrarDropdowns(except) {
  document.querySelectorAll('.cs.abierto').forEach(cs => { if (cs !== except && cs._cerrar) cs._cerrar(); });
}
document.addEventListener('click', () => cerrarDropdowns(null));

// Categorías propias (las que agrega el usuario) — se recuerdan
function categoriasPropias() {
  try { return JSON.parse(localStorage.getItem('despensa_categorias')) || []; } catch { return []; }
}
function guardarCategoriaPropia(nombre) {
  const lista = categoriasPropias();
  if (!lista.includes(nombre)) { lista.push(nombre); localStorage.setItem('despensa_categorias', JSON.stringify(lista)); }
}
// Inyectar las guardadas en el <select> antes de armar el dropdown
categoriasPropias().forEach(nombre => {
  if (![...inputCategoria.options].some(o => o.value === nombre)) inputCategoria.add(new Option(nombre, nombre));
});

// Chips de unidad (reemplazan al dropdown para Unidad)
function sincronizarChips(val) {
  document.querySelectorAll('#unidad-chips .u-chip:not(.u-chip-add)').forEach(c => c.classList.toggle('activo', c.dataset.val === val));
}

function agregarChipUnidad(val) {
  const chipsEl = document.getElementById('unidad-chips');
  if ([...chipsEl.querySelectorAll('.u-chip')].some(c => c.dataset.val === val)) return;
  const addBtn = document.getElementById('chip-add-unidad');
  const chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'u-chip'; chip.dataset.val = val; chip.textContent = val;
  chip.addEventListener('click', () => { inputUnidad.value = val; sincronizarChips(val); });
  chipsEl.insertBefore(chip, addBtn);
  if (![...inputUnidad.options].some(o => o.value === val)) inputUnidad.add(new Option(val, val));
}

function unidadesPropias() { try { return JSON.parse(localStorage.getItem('despensa_unidades')) || []; } catch { return []; } }

document.querySelectorAll('#unidad-chips .u-chip:not(.u-chip-add)').forEach(chip => {
  chip.addEventListener('click', () => { inputUnidad.value = chip.dataset.val; sincronizarChips(chip.dataset.val); });
});

// Inyectar unidades guardadas por el usuario
unidadesPropias().forEach(u => agregarChipUnidad(u));

// Chip "+"
document.getElementById('chip-add-unidad').addEventListener('click', () => {
  abrirPrompt('Nueva unidad (ej: docena, atado, sobre):', '', (nombre) => {
    const lista = unidadesPropias();
    if (!lista.includes(nombre)) { lista.push(nombre); localStorage.setItem('despensa_unidades', JSON.stringify(lista)); }
    agregarChipUnidad(nombre);
    inputUnidad.value = nombre;
    sincronizarChips(nombre);
  });
});

sincronizarChips(inputUnidad.value);

crearDropdown(inputCategoria, {
  colorDot: true,
  onAgregar() {
    abrirPrompt('Nombre de la nueva categoría:', '', (nombre) => {
      if (![...inputCategoria.options].some(o => o.value.toLowerCase() === nombre.toLowerCase())) {
        inputCategoria.add(new Option(nombre, nombre));
        guardarCategoriaPropia(nombre);
      }
      inputCategoria.value = nombre;
      const cs = inputCategoria.closest('.cs');
      if (cs && cs._rebuild) cs._rebuild();
      inputCategoria.dispatchEvent(new Event('change'));
    });
  }
});

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

// ----- Botones − / + de la cantidad -----
const inputCantidad = document.getElementById('cantidad');
function pasoCantidad(delta) {
  const v = parseFloat(inputCantidad.value) || 0;
  inputCantidad.value = Math.max(0, Math.round((v + delta) * 100) / 100);
}
document.getElementById('cant-menos').addEventListener('click', () => pasoCantidad(-1));
document.getElementById('cant-mas').addEventListener('click', () => pasoCantidad(1));

// ----- Dictado por voz (Chrome en Android lo soporta; donde no, avisa) -----
const btnVoz = document.getElementById('btn-voz');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  let rec = null, escuchando = false;
  btnVoz.addEventListener('click', () => {
    if (escuchando) { rec && rec.stop(); return; }
    rec = new SR();
    rec.lang = 'es-AR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const texto = (e.results[0][0].transcript || '').trim();
      if (texto) {
        inputProducto.value = texto.charAt(0).toUpperCase() + texto.slice(1);
        autocompletarProducto();
        inputCantidad.focus();
      }
    };
    rec.onerror = () => toast('No pude escuchar, probá de nuevo');
    rec.onend = () => { escuchando = false; btnVoz.classList.remove('escuchando'); };
    escuchando = true;
    btnVoz.classList.add('escuchando');
    rec.start();
  });
} else {
  btnVoz.addEventListener('click', () => toast('Tu navegador no permite dictar por voz'));
}

function renderUltimos() {
  const ul = document.getElementById('ultimos');
  const ultimos = [...datos.consumos].reverse().slice(0, 8);
  if (ultimos.length === 0) {
    ul.innerHTML = '<li class="vacio">Todavía no cargaste nada.</li>';
    return;
  }
  ul.innerHTML = ultimos.map(c => {
    const color = colorCategoria(c.categoria || 'Otros');
    const cant = `+${fmtCant(c.cantidad)} ${escapeHtml(c.unidad)}`;
    return `
    <li class="consumo-card">
      <div class="consumo-info">
        <div class="consumo-nombre">${escapeHtml(c.producto)}<span class="consumo-u">${escapeHtml(c.unidad)}</span></div>
        <div class="consumo-meta">
          <span class="consumo-cat-dot" style="background:${color}"></span>
          <span class="consumo-cat">${escapeHtml(c.categoria || '')}</span>
          <span class="consumo-sep">·</span>
          <span class="consumo-tiempo">${tiempoRelativo(c.fecha)}</span>
        </div>
      </div>
      <div class="consumo-acciones">
        <span class="consumo-cant">${cant}</span>
        <button class="iconbtn editar" data-id="${c.id}" title="Editar cantidad">${icono('lapiz')}</button>
        <button class="iconbtn borrar" data-id="${c.id}" title="Borrar">✕</button>
      </div>
    </li>`;
  }).join('');
  ul.querySelectorAll('.borrar').forEach(btn => btn.addEventListener('click', () => {
    const c = datos.consumos.find(x => x.id === btn.dataset.id);
    const nombre = c ? c.producto : 'este registro';
    abrirConfirm(`¿Borrar el registro de ${nombre}?`, () => {
      if (enCasa()) { nubeBorrarConsumo(btn.dataset.id); toast('Borrado'); return; }
      datos.consumos = datos.consumos.filter(x => x.id !== btn.dataset.id);
      guardarDatos(); toast('Borrado'); refrescarTodo();
    });
  }));
  ul.querySelectorAll('.editar').forEach(btn => btn.addEventListener('click', () => {
    const c = datos.consumos.find(x => x.id === btn.dataset.id);
    if (!c) return;
    abrirPrompt(`Cantidad de ${c.producto} (${c.unidad}):`, c.cantidad, (val) => {
      const num = parseFloat(val);
      if (!(num > 0)) { toast('Cantidad inválida'); return; }
      const diff = num - c.cantidad; // positivo = consumió más, stock baja más
      if (enCasa()) {
        nubeEditarConsumo(c.id, { cantidad: num });
        if (datos.stock[c.producto] && diff !== 0) nubeIncrementarStock(c.producto, -diff);
        toast('Actualizado'); return;
      }
      if (datos.stock[c.producto] && diff !== 0) {
        datos.stock[c.producto].actual = Math.max(0, (datos.stock[c.producto].actual || 0) - diff);
      }
      c.cantidad = num;
      guardarDatos(); toast('Actualizado'); refrescarTodo();
    });
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
// Color por categoría (las propias derivan un color estable de su nombre)
const CAT_COLOR = {
  'Almacén': '#f59e0b', 'Lácteos': '#3b82f6', 'Frutas y verduras': '#22c55e',
  'Carnes': '#ef4444', 'Limpieza': '#06b6d4', 'Higiene': '#a855f7',
  'Bebidas': '#0ea5e9', 'Otros': '#64748b',
};
const CAT_ORDEN = ['Almacén', 'Lácteos', 'Frutas y verduras', 'Carnes', 'Limpieza', 'Higiene', 'Bebidas', 'Otros'];
function colorCategoria(cat) {
  if (CAT_COLOR[cat]) return CAT_COLOR[cat];
  const pal = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#06b6d4', '#a855f7', '#0ea5e9', '#ec4899', '#14b8a6', '#f97316'];
  let h = 0; for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return pal[h % pal.length];
}
// Qué categorías están plegadas (se recuerda)
function colapsadasStock() {
  try { return new Set(JSON.parse(localStorage.getItem('despensa_stock_colapsadas')) || []); } catch { return new Set(); }
}
function guardarColapsadas(set) { localStorage.setItem('despensa_stock_colapsadas', JSON.stringify([...set])); }
// Referencia "lleno" para la barra: el máximo que tuvo, o el actual/mínimo
function refStock(st) { return Math.max(st.max || 0, st.minimo || 0, 1); }

function renderStock() {
  const cont = document.getElementById('lista-stock');
  const cat = catalogo();
  const nombres = Object.keys(cat);
  const alerta = document.getElementById('stock-alerta');
  const urg = document.getElementById('stock-urgentes');
  if (nombres.length === 0) {
    cont.innerHTML = '<p class="vacio">Cargá algún consumo primero para empezar a controlar stock.</p>';
    alerta.hidden = true; urg.hidden = true;
    return;
  }
  // Agrupar productos por categoría
  const grupos = {};
  for (const n of nombres) { const c = cat[n].categoria || 'Otros'; (grupos[c] = grupos[c] || []).push(n); }
  const cats = Object.keys(grupos).sort((a, b) => {
    const ia = CAT_ORDEN.indexOf(a), ib = CAT_ORDEN.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  const colapsadas = colapsadasStock();
  const urgentes = [];
  let html = '';
  for (const c of cats) {
    const color = colorCategoria(c);
    let porReponer = 0;
    const itemsHtml = grupos[c].sort().map(n => {
      const st = datos.stock[n] || { actual: 0, minimo: 0 };
      const cero = st.minimo > 0 && st.actual <= 0;
      const bajo = st.minimo > 0 && st.actual > 0 && st.actual < st.minimo;
      if (st.minimo > 0 && st.actual < st.minimo) { porReponer++; urgentes.push({ producto: n, categoria: c, cero }); }
      const pct = Math.round(Math.min(1, (st.actual || 0) / refStock(st)) * 100);
      const estado = cero ? 'cero' : (bajo ? 'bajo' : 'ok');
      const badge = cero ? '<span class="si-badge cero">SIN STOCK</span>' : (bajo ? '<span class="si-badge">REPONER</span>' : '');
      return `
        <div class="stock-item ${estado}">
          <div class="si-top">
            <div class="si-info"><div class="si-nombre">${escapeHtml(n)} <small>${escapeHtml(cat[n].unidad)}</small> ${badge}</div></div>
            <div class="si-ctrl">
              <input class="stock-actual" type="number" step="any" data-prod="${escapeHtml(n)}" value="${st.actual}" />
            </div>
            <label class="si-min">MÍN<input class="stock-minimo" type="number" step="any" data-prod="${escapeHtml(n)}" value="${st.minimo}" /></label>
          </div>
          <div class="si-barra"><span style="width:${pct}%"></span></div>
        </div>`;
    }).join('');
    const colap = colapsadas.has(c);
    html += `
      <div class="cat-card ${colap ? 'colapsada' : ''}" data-cat="${escapeHtml(c)}" style="--cat:${color}">
        <button type="button" class="cat-head">
          <span class="cat-dot"></span>
          <span class="cat-nombre">${escapeHtml(c)}</span>
          <span class="cat-meta">
            ${porReponer > 0 ? `<span class="cat-aviso">${icono('bajando')} ${porReponer}</span>` : ''}
            <span class="cat-count">${grupos[c].length}</span>
            <svg class="cat-flecha" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
        <div class="cat-items">${itemsHtml}</div>
      </div>`;
  }
  cont.innerHTML = html;

  // Alerta superior + lista de urgentes (se despliega al tocarla)
  const total = urgentes.length;
  if (total > 0) {
    alerta.hidden = false;
    alerta.innerHTML = `${icono('bajando')} ${total} ítem${total > 1 ? 's' : ''} por reponer`;
    urg.innerHTML = urgentes.map(u =>
      `<div class="urg-item" style="--cat:${colorCategoria(u.categoria)}"><span class="urg-dot"></span><span class="urg-nom">${escapeHtml(u.producto)} <small>${escapeHtml(u.categoria)}</small></span>${u.cero ? '<span class="si-badge cero">SIN STOCK</span>' : '<span class="si-badge">REPONER</span>'}</div>`
    ).join('');
  } else {
    alerta.hidden = true; urg.hidden = true; alerta.classList.remove('abierta');
  }

  // Plegar / desplegar categorías
  cont.querySelectorAll('.cat-head').forEach(h => h.addEventListener('click', () => {
    const card = h.closest('.cat-card'); const c = card.dataset.cat;
    const set = colapsadasStock();
    if (set.has(c)) set.delete(c); else set.add(c);
    guardarColapsadas(set);
    card.classList.toggle('colapsada');
  }));

  function asegurar(prod) {
    if (!datos.stock[prod]) datos.stock[prod] = { actual: 0, minimo: 0 };
    return datos.stock[prod];
  }
  const maxDe = prod => (datos.stock[prod] && datos.stock[prod].max) || 0;
  cont.querySelectorAll('.stock-actual').forEach(inp => inp.addEventListener('change', () => {
    const p = inp.dataset.prod, v = parseFloat(inp.value) || 0;
    if (enCasa()) { nubeSetStockCampo(p, 'actual', v); if (v > ((datos.stock[p] && datos.stock[p].actual) || 0)) nubeSetStockCampo(p, 'max', v); return; }
    const s = asegurar(p); if (v > (s.actual || 0)) s.max = v; s.actual = v; guardarDatos(); renderStock(); renderLista();
  }));
  cont.querySelectorAll('.stock-minimo').forEach(inp => inp.addEventListener('change', () => {
    const p = inp.dataset.prod, v = parseFloat(inp.value) || 0;
    if (enCasa()) { nubeSetStockCampo(p, 'minimo', v); return; }
    asegurar(p).minimo = v; guardarDatos(); renderStock(); renderLista();
  }));
}
// La alerta de arriba despliega/pliega la lista de urgentes
document.getElementById('stock-alerta').addEventListener('click', () => {
  const urg = document.getElementById('stock-urgentes');
  urg.hidden = !urg.hidden;
  document.getElementById('stock-alerta').classList.toggle('abierta', !urg.hidden);
});

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
  if (enCasa()) { nubeSetCarrito([...seleccionados]); return; }
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
    const cantVal = it.cantidad > 0 ? fmtCant(it.cantidad) : 1;
    const enCarrito = seleccionados.has(it.producto);
    return `
      <li class="${enCarrito ? 'en-carrito' : ''}">
        <input type="checkbox" title="Marcar como puesto en el carrito" data-prod="${escapeHtml(it.producto)}" ${enCarrito ? 'checked' : ''} />
        <span class="nombre">${escapeHtml(it.producto)}<div class="fecha">${detalle}</div></span>
        <div class="li-cant">
          <input type="number" class="cant-compra" data-prod="${escapeHtml(it.producto)}"
            value="${cantVal}" min="0.1" step="any" inputmode="none" />
          <span class="li-unidad">${escapeHtml(it.unidad)}</span>
        </div>
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

function ejecutarConfirmarCompra(aComprar, cantidades) {
  if (enCasa()) {
    nubeConfirmarCompra(aComprar, cantidades);
    seleccionados.clear();
    toast('Compra confirmada');
    return; // el listener actualiza todo
  }
  for (const c of datos.consumos) {
    if (!c.comprado && aComprar.has(c.producto)) c.comprado = true;
  }
  // Repone el stock: usa la cantidad comprada editada, o el máximo registrado
  for (const prod of aComprar) {
    const st = datos.stock[prod];
    if (!st) continue;
    const nivel = (cantidades && cantidades[prod] > 0) ? cantidades[prod] : Math.max(st.max || 0, st.minimo || 0);
    if (nivel > 0) { st.actual = nivel; st.max = nivel; }
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
  const cantidades = {};
  document.querySelectorAll('.cant-compra').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) cantidades[inp.dataset.prod] = v;
  });
  const n = aComprar.size;
  const mensaje = seleccionados.size > 0
    ? `¿Confirmás la compra de ${n} producto${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}? Se archivarán en el historial.`
    : `¿Confirmás la compra de toda la lista (${n} producto${n > 1 ? 's' : ''})? Se archivarán en el historial.`;
  abrirConfirm(mensaje, () => ejecutarConfirmarCompra(aComprar, cantidades));
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
  // La paleta arranca con el color de acento elegido por el usuario
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || PALETA[0];
  const paleta = [accent, ...PALETA.filter(c => c.toLowerCase() !== accent.toLowerCase())];
  const datasets = Object.keys(series).map((clave, i) => ({
    label: clave,
    data: meses.map(m => series[clave][m] || 0),
    backgroundColor: paleta[i % paleta.length],
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
    abrirConfirm('Esto reemplazará TODOS tus datos actuales por los del respaldo. ¿Continuar?', async () => {
      const limpio = { consumos: nuevo.consumos, stock: nuevo.stock || {}, carrito: nuevo.carrito || [] };
      if (enCasa()) {
        try { await nubeReemplazarTodo(limpio); toast('Datos restaurados'); }
        catch { toast('No se pudo restaurar en la nube'); }
        return;
      }
      datos = limpio;
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
let modalOnClose = null; // limpieza extra para modo prompt

function abrirConfirm(mensaje, onSi, soloInfo) {
  modalMensaje.textContent = mensaje;
  modalAccion = onSi;
  document.getElementById('modal-no').style.display = soloInfo ? 'none' : '';
  document.getElementById('modal-si').textContent = soloInfo ? 'Entendido' : 'Sí';
  modalOverlay.style.display = 'flex';
}
function cerrarConfirm() {
  modalOverlay.style.display = 'none';
  modalAccion = null;
  if (modalOnClose) { modalOnClose(); modalOnClose = null; }
}

// Modal con campo de texto (reemplaza prompt() del sistema)
function abrirPrompt(msg, valorInicial, onOk) {
  const modal = modalOverlay.querySelector('.modal');
  let inp = modal.querySelector('.modal-prompt-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.className = 'modal-prompt-input';
    inp.type = 'text';
    modalMensaje.after(inp);
  }
  inp.value = valorInicial != null ? String(valorInicial) : '';
  inp.style.display = 'block';
  document.getElementById('modal-no').style.display = '';
  document.getElementById('modal-no').textContent = 'Cancelar';
  document.getElementById('modal-si').textContent = 'Listo';
  modalMensaje.textContent = msg;

  function onKey(e) {
    if (e.key === 'Enter') document.getElementById('modal-si').click();
    if (e.key === 'Escape') cerrarConfirm();
  }
  inp.addEventListener('keydown', onKey);

  modalOnClose = () => {
    inp.style.display = 'none';
    inp.removeEventListener('keydown', onKey);
    document.getElementById('modal-no').textContent = 'No';
    document.getElementById('modal-si').textContent = 'Sí';
  };
  modalAccion = () => {
    const val = inp.value.trim();
    if (val) onOk(val);
  };

  modalOverlay.style.display = 'flex';
  setTimeout(() => inp.focus(), 60);
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
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent-osc', oscuro || derivarOscuro(color));
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
    ['--bg', '--bg-elev', '--card', '--nav-bg', '--gris', '--borde', '--dot'].forEach(v => RAIZ.removeProperty(v));
    localStorage.removeItem('despensa_fondo');
  } else {
    const claro = esClaro(color);
    // Tarjetas/barras: tinte claro del MISMO fondo (antes quedaban blancas)
    const elev = claro ? mezclar(color, '#ffffff', 0.5) : mezclar(color, '#ffffff', 0.07);
    RAIZ.setProperty('--bg', color);
    RAIZ.setProperty('--bg-elev', elev);
    RAIZ.setProperty('--card', elev);
    RAIZ.setProperty('--nav-bg', claro ? mezclar(color, '#ffffff', 0.62) : mezclar(color, '#ffffff', 0.12));
    RAIZ.setProperty('--gris', claro ? mezclar(color, '#000000', 0.05) : mezclar(color, '#ffffff', 0.08));
    RAIZ.setProperty('--borde', claro ? mezclar(color, '#000000', 0.11) : mezclar(color, '#ffffff', 0.17));
    // Puntitos del confeti: el mismo tono del fondo, apenas más claro (si el
    // fondo es oscuro) o un poco más intenso (si es claro), para que siempre
    // se noten y combinen con el color elegido.
    RAIZ.setProperty('--dot', claro ? mezclar(color, '#000000', 0.07) : mezclar(color, '#ffffff', 0.16));
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

// ===== Rueda selectora de color (tono + saturación + brillo hasta el negro) =====
const ruedaOverlay = document.getElementById('rueda-overlay');
const ruedaCanvas = document.getElementById('rueda-canvas');
const ruedaMarker = document.getElementById('rueda-marker');
const ruedaOscuro = document.getElementById('rueda-oscuro');
const ruedaBrillo = document.getElementById('rueda-brillo');
const ruedaPreview = document.getElementById('rueda-preview');
let ruedaH = 0, ruedaS = 1, ruedaV = 1, ruedaOnElegir = null, ruedaLista = false;

function hsv2rgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
function hex2rgb(hex) {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgb2hex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Dibuja la rueda una sola vez: tono por ángulo, saturación por radio (a brillo full)
function dibujarRueda() {
  const ctx = ruedaCanvas.getContext('2d');
  const w = ruedaCanvas.width, r = w / 2;
  const img = ctx.createImageData(w, w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - r, dy = y - r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * w + x) * 4;
      if (dist <= r) {
        let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
        const [R, G, B] = hsv2rgb(h, Math.min(1, dist / r), 1);
        img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B;
        img.data[i + 3] = dist > r - 1.2 ? Math.max(0, r - dist + 1.2) * 212 : 255;
      } else { img.data[i + 3] = 0; }
    }
  }
  ctx.putImageData(img, 0, 0);
  ruedaLista = true;
}

// Refresca preview, capa oscura, slider y marcador según H/S/V actuales
function ruedaActualizar() {
  const hex = rgb2hex(...hsv2rgb(ruedaH, ruedaS, ruedaV));
  ruedaPreview.style.background = hex;
  ruedaOscuro.style.opacity = (1 - ruedaV).toFixed(3);
  ruedaBrillo.style.setProperty('--rueda-tono', rgb2hex(...hsv2rgb(ruedaH, ruedaS, 1)));
  const r = ruedaCanvas.width / 2;
  const ang = ruedaH * Math.PI / 180;
  ruedaMarker.style.left = (r + Math.cos(ang) * ruedaS * r) + 'px';
  ruedaMarker.style.top = (r + Math.sin(ang) * ruedaS * r) + 'px';
  return hex;
}

function ruedaDesdePunto(clientX, clientY) {
  const rect = ruedaCanvas.getBoundingClientRect();
  const r = ruedaCanvas.width / 2;
  const dx = (clientX - rect.left) * (ruedaCanvas.width / rect.width) - r;
  const dy = (clientY - rect.top) * (ruedaCanvas.height / rect.height) - r;
  let h = Math.atan2(dy, dx) * 180 / Math.PI; if (h < 0) h += 360;
  ruedaH = h;
  ruedaS = Math.min(1, Math.sqrt(dx * dx + dy * dy) / r);
  ruedaActualizar();
}

let ruedaArrastrando = false;
ruedaCanvas.addEventListener('pointerdown', (e) => {
  ruedaArrastrando = true; ruedaCanvas.setPointerCapture(e.pointerId); ruedaDesdePunto(e.clientX, e.clientY);
});
ruedaCanvas.addEventListener('pointermove', (e) => { if (ruedaArrastrando) ruedaDesdePunto(e.clientX, e.clientY); });
ruedaCanvas.addEventListener('pointerup', () => { ruedaArrastrando = false; });
ruedaBrillo.addEventListener('input', () => { ruedaV = ruedaBrillo.value / 100; ruedaActualizar(); });

function abrirRueda(colorInicial, onElegir) {
  if (!ruedaLista) dibujarRueda();
  ruedaOnElegir = onElegir;
  const [h, s, v] = rgb2hsv(...hex2rgb(colorInicial));
  ruedaH = h; ruedaS = s; ruedaV = v;
  ruedaBrillo.value = Math.round(v * 100);
  ruedaActualizar();
  ruedaOverlay.style.display = 'flex';
}
function cerrarRueda() { ruedaOverlay.style.display = 'none'; ruedaOnElegir = null; }
document.getElementById('rueda-cancelar').addEventListener('click', cerrarRueda);
document.getElementById('rueda-usar').addEventListener('click', () => {
  const hex = ruedaActualizar();
  if (ruedaOnElegir) ruedaOnElegir(hex);
  cerrarRueda();
});
ruedaOverlay.addEventListener('click', (e) => { if (e.target === ruedaOverlay) cerrarRueda(); });

// ----- Panel de ajustes (bottom sheet) -----
const ajustesOverlay = document.getElementById('ajustes-overlay');

// Dibuja los primeros 6 colores de la lista como círculos de 24px,
// más un botón "+" con selector de color nativo para elegir uno libre.
function renderSwatches(contId, lista, actual, onPick) {
  const cont = document.getElementById(contId);
  const act = (actual || '').toLowerCase();
  cont.innerHTML = '';
  lista.slice(0, 6).forEach(x => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (x.c.toLowerCase() === act ? ' activo' : '');
    b.style.background = x.c;
    b.title = x.n;
    b.addEventListener('click', () => { onPick(x.c); renderAjustes(); });
    cont.appendChild(b);
  });
  // Botón "+" que abre la rueda selectora de color
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'swatch-add';
  add.title = 'Elegir un color con la rueda';
  add.textContent = '+';
  const inicial = /^#[0-9a-f]{6}$/i.test(actual || '') ? actual : '#ff0000';
  add.addEventListener('click', () => abrirRueda(inicial, (hex) => { onPick(hex); renderAjustes(); }));
  cont.appendChild(add);
}

function renderAjustes() {
  renderSwatches('set-principal', COLORES, colorActual(), (c) => {
    const preset = COLORES.find(x => x.c === c);
    aplicarColor(c, preset ? preset.o : undefined);
  });
  renderSwatches('set-fondo', FONDOS, fondoEfectivo(), aplicarFondo);
  renderSwatches('set-texto', LETRAS, letraEfectiva(), aplicarLetra);
  const oscuro = temaActual() === 'dark';
  document.getElementById('modo-claro').classList.toggle('activo', !oscuro);
  document.getElementById('modo-oscuro').classList.toggle('activo', oscuro);
}

function abrirAjustes() {
  renderAjustes();
  ajustesOverlay.style.display = 'flex';
}
function cerrarAjustes() { ajustesOverlay.style.display = 'none'; }

document.getElementById('btn-ajustes').addEventListener('click', abrirAjustes);
document.getElementById('ajustes-cerrar').addEventListener('click', cerrarAjustes);
// Tocar fuera del panel = cerrar, solo si el gesto EMPEZÓ sobre el fondo
let ajustesDownEnFondo = false;
ajustesOverlay.addEventListener('mousedown', (e) => { ajustesDownEnFondo = (e.target === ajustesOverlay); });
ajustesOverlay.addEventListener('click', (e) => {
  if (e.target === ajustesOverlay && ajustesDownEnFondo) cerrarAjustes();
  ajustesDownEnFondo = false;
});
// Modo claro / oscuro desde el panel
document.getElementById('modo-claro').addEventListener('click', () => setTema('light'));
document.getElementById('modo-oscuro').addEventListener('click', () => setTema('dark'));

// ===== Compartir despensa (crear / unirse a una casa) =====
const casaOverlay = document.getElementById('casa-overlay');
function renderCasaUI() {
  const cont = document.getElementById('casa-contenido');
  const estado = document.getElementById('compartir-estado');
  if (enCasa()) {
    const code = casaActual();
    const url = location.origin + location.pathname + '?casa=' + code;
    cont.innerHTML = `
      <p class="casa-titulo">${icono('personas')} Despensa compartida</p>
      <p class="casa-sub">Mostrale este código o el QR a la otra persona. Lo que anote cualquiera se sincroniza en todos los celulares.</p>
      <div class="casa-codigo">${code}</div>
      <div id="casa-qr" class="casa-qr"></div>
      <p class="casa-sub">La otra persona puede <b>escanear el QR</b> con la cámara del celular, o escribir el código en "Unirme".</p>
      <button type="button" id="casa-salir" class="btn-secundario casa-salir">Salir de la despensa compartida</button>`;
    const qrEl = document.getElementById('casa-qr');
    if (window.QRCode) { qrEl.innerHTML = ''; new QRCode(qrEl, { text: url, width: 184, height: 184, correctLevel: QRCode.CorrectLevel.M }); }
    document.getElementById('casa-salir').addEventListener('click', () => {
      abrirConfirm('¿Salir de la despensa compartida? En este celular volvés a tu despensa propia.', () => { salirCasa(); renderCasaUI(); });
    });
    if (estado) estado.textContent = 'Compartida — ver código / QR';
  } else {
    cont.innerHTML = `
      <p class="casa-titulo">${icono('personas')} Compartir despensa</p>
      <p class="casa-sub">Conectá tu despensa con tu pareja o familia: lo que cualquiera consuma se suma a la lista y baja el stock en todos los celulares, aunque no estén juntos.</p>
      <button type="button" id="casa-crear" class="btn-primary">Crear mi despensa compartida</button>
      <div class="casa-o">— o —</div>
      <label class="casa-unir-label">Unirme con un código</label>
      <div class="casa-unir">
        <input type="text" id="casa-codigo-input" placeholder="Ej: K7P3QX9A" maxlength="8" autocapitalize="characters" />
        <button type="button" id="casa-unirme" class="btn-primary">Unirme</button>
      </div>`;
    document.getElementById('casa-crear').addEventListener('click', async () => {
      const b = document.getElementById('casa-crear'); b.disabled = true; b.textContent = 'Creando…';
      try { await crearCasa(); toast('¡Despensa compartida creada!'); renderCasaUI(); }
      catch { toast('No se pudo crear. ¿Hay internet?'); b.disabled = false; b.textContent = 'Crear mi despensa compartida'; }
    });
    document.getElementById('casa-unirme').addEventListener('click', async () => {
      const b = document.getElementById('casa-unirme'); b.disabled = true;
      const ok = await unirseCasa(document.getElementById('casa-codigo-input').value);
      b.disabled = false;
      if (ok) { toast('¡Te uniste!'); renderCasaUI(); }
    });
    if (estado) estado.textContent = 'Compartir con otra persona';
  }
}
function abrirCasa() { renderCasaUI(); casaOverlay.style.display = 'flex'; }
function cerrarCasa() { casaOverlay.style.display = 'none'; }
document.getElementById('btn-compartir').addEventListener('click', abrirCasa);
document.getElementById('casa-cerrar').addEventListener('click', cerrarCasa);
casaOverlay.addEventListener('click', (e) => { if (e.target === casaOverlay) cerrarCasa(); });

// Invitación por link: si la URL trae ?casa=CODIGO, ofrecer unirse
function detectarInvitacionCasa() {
  const code = (new URLSearchParams(location.search).get('casa') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return;
  history.replaceState({}, '', location.pathname);
  if (casaActual() === code) return;
  abrirConfirm(`¿Querés unirte a la despensa ${code}? Vas a compartirla con esa persona.`, async () => {
    const ok = await unirseCasa(code);
    if (ok) { toast('¡Te uniste a la despensa!'); renderCasaUI(); }
  });
}

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
// Cambia a claro/oscuro. Un fondo/letra elegidos a mano pisan a los del tema y
// el cambio no se vería, así que al cambiar de tema vuelven al automático.
function setTema(tema) {
  localStorage.setItem('despensa_tema', tema);
  const habiaPersonalizados = localStorage.getItem('despensa_fondo') || localStorage.getItem('despensa_letra');
  aplicarTema(tema);
  aplicarFondo(null);
  aplicarLetra(null);
  if (habiaPersonalizados) toast('Fondo y letra volvieron al automático del tema');
  if (document.getElementById('tab-historial').classList.contains('active')) renderGrafico();
  if (ajustesOverlay.style.display !== 'none') renderAjustes();
}
btnTema.addEventListener('click', () => setTema(temaActual() === 'dark' ? 'light' : 'dark'));
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
  renderUltimos();
  renderLista();
  if (document.getElementById('tab-stock').classList.contains('active')) renderStock();
  if (document.getElementById('tab-historial').classList.contains('active')) renderHistorial();
}

refrescarTodo();

// Nube: si ya estabas en una despensa compartida, reconectar; y detectar
// invitaciones que llegan por link (?casa=CODIGO).
iniciarNube();
detectarInvitacionCasa();

// Service worker (para que funcione offline)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ===== Teclado numérico propio =====
let numpadTarget = null;
let numpadValor = '';

function abrirNumpad(inputEl) {
  numpadTarget = inputEl;
  numpadValor = String(inputEl.value || '');
  document.getElementById('numpad-display').textContent = numpadValor || '0';
  document.getElementById('numpad-overlay').style.display = 'flex';
}
function cerrarNumpad() {
  document.getElementById('numpad-overlay').style.display = 'none';
  numpadTarget = null;
}

document.querySelectorAll('.nk[data-k]').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const k = btn.dataset.k;
    if (k === '⌫') {
      numpadValor = numpadValor.slice(0, -1);
    } else if (k === '.') {
      if (!numpadValor.includes('.')) numpadValor += '.';
    } else {
      if (numpadValor === '0' || numpadValor === '') numpadValor = k;
      else numpadValor += k;
    }
    document.getElementById('numpad-display').textContent = numpadValor || '0';
    if (numpadTarget) numpadTarget.value = numpadValor;
  });
});

document.getElementById('numpad-cancel').addEventListener('click', () => cerrarNumpad());
document.getElementById('numpad-ok').addEventListener('click', () => {
  if (numpadTarget) {
    const v = numpadValor !== '' ? numpadValor : '0';
    numpadTarget.value = v;
    numpadTarget.dispatchEvent(new Event('change', { bubbles: true }));
  }
  cerrarNumpad();
});
document.getElementById('numpad-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('numpad-overlay')) cerrarNumpad();
});

// Interceptar taps sobre #cantidad y .cant-compra para abrir numpad
document.getElementById('cantidad').addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') { e.preventDefault(); abrirNumpad(e.currentTarget); }
});
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    const target = e.target.closest('.cant-compra');
    if (target) { e.preventDefault(); abrirNumpad(target); }
  }
});
