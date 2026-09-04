// ============================================================
// SISTEMA DE MANEJO DE GADO - app.js
// Vanilla JS + Supabase (Postgres) — sem build step, roda direto no navegador
// ============================================================

let sb = null;
let currentUser = null;
let currentProfile = null;

// caches simples (recarregadas quando necessário)
let pastosCache = [];
let lotesCache = [];

const GESTACAO_DIAS = 283; // média da gestação bovina

// ------------------------------------------------------------
// BOOT
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (typeof SUPABASE_URL === 'undefined' || !SUPABASE_URL || SUPABASE_URL.includes('COLE_AQUI')) {
    renderConfigMissing();
    return;
  }
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    renderConfigMissing();
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await afterLogin();
  } else {
    renderLogin();
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      afterLogin();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      renderLogin();
    }
  });

  window.addEventListener('hashchange', route);
}

function renderConfigMissing() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="max-w-md bg-white border rounded-xl shadow-sm p-6 text-center">
        <img src="logo-estancia-boa-estrela.svg" alt="Estância Boa Estrela" class="h-16 w-16 mx-auto mb-3" />
        <h1 class="text-lg font-semibold mb-2">Configuração pendente</h1>
        <p class="text-sm text-gray-600">Este sistema ainda não foi conectado a um banco de dados.
        Abra o arquivo <code class="bg-gray-100 px-1 rounded">config.js</code> e cole a URL e a chave
        do seu projeto Supabase. Veja o guia de configuração para o passo a passo.</p>
      </div>
    </div>`;
}

// ------------------------------------------------------------
// AUTENTICAÇÃO
// ------------------------------------------------------------
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-6 bg-brand-800">
      <div class="max-w-sm w-full bg-white rounded-xl shadow-xl p-6">
        <div class="text-center mb-6">
          <img src="logo-estancia-boa-estrela.svg" alt="Estância Boa Estrela" class="h-20 w-20 mx-auto mb-2" />
          <h1 class="text-xl font-bold text-brand-800">Manejo de Gado</h1>
          <p class="text-sm text-gray-500">Entre com seu e-mail e senha</p>
        </div>
        <form id="loginForm" class="space-y-3">
          <div>
            <label class="text-sm font-medium text-gray-600">E-mail</label>
            <input name="email" type="email" required class="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-600">Senha</label>
            <input name="password" type="password" required class="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div id="loginError" class="text-sm text-red-600 hidden"></div>
          <button type="submit" class="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2 rounded-md text-sm">Entrar</button>
        </form>
        <p class="text-xs text-gray-400 mt-4 text-center">Não tem acesso? Peça ao administrador da fazenda para criar seu usuário.</p>
      </div>
    </div>`;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    const errBox = document.getElementById('loginError');
    errBox.classList.add('hidden');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (error) {
      errBox.textContent = 'E-mail ou senha inválidos.';
      errBox.classList.remove('hidden');
    }
  });
}

async function afterLogin() {
  const { data: perfil } = await sb.from('perfis').select('*').eq('id', currentUser.id).maybeSingle();
  currentProfile = perfil || { nome: currentUser.email, papel: 'peao' };
  await refreshCaches();
  initShell();
  route();
}

async function logout() {
  await sb.auth.signOut();
}

async function refreshCaches() {
  pastosCache = await dbSelect('pastos', { order: { col: 'nome' } });
  lotesCache = await dbSelect('lotes', { select: '*, pasto:pastos(id,nome)', order: { col: 'nome' } });
}

// ------------------------------------------------------------
// SHELL (layout com menu)
// ------------------------------------------------------------
const NAV_ITEMS = [
  { route: 'dashboard', label: 'Painel', icon: '📊' },
  { route: 'animais', label: 'Rebanho', icon: '🐄' },
  { route: 'lotes', label: 'Lotes', icon: '🗂️' },
  { route: 'pastos', label: 'Pastos', icon: '🌱' },
  { route: 'movimentacoes', label: 'Movimentação', icon: '🚚' },
  { route: 'reproducao', label: 'Reprodução', icon: '🍼' },
  { route: 'alimentacao', label: 'Alimentação', icon: '🌾' },
  { route: 'sanidade', label: 'Sanidade', icon: '💉' },
  { route: 'vendas', label: 'Vendas', icon: '💵' },
  { route: 'custos', label: 'Financeiro', icon: '💰' },
  { route: 'orcamentos', label: 'Orçamentos', icon: '📐' },
  { route: 'relatorios', label: 'Relatórios', icon: '📑' },
];

function navLinksHtml() {
  return NAV_ITEMS.map(i => `
    <a href="#${i.route}" data-route="${i.route}" class="nav-link flex items-center gap-2 px-3 py-2 rounded-md text-sm text-brand-100 hover:bg-brand-700">
      <span>${i.icon}</span><span>${i.label}</span>
    </a>`).join('');
}

function initShell() {
  document.getElementById('app').innerHTML = `
    <div class="flex h-screen overflow-hidden">
      <aside class="hidden md:flex md:flex-col w-60 bg-brand-800 text-white shrink-0">
        <div class="px-4 py-4 border-b border-brand-700">
          <div class="flex items-center gap-2">
            <img src="logo-estancia-boa-estrela.svg" alt="" class="h-9 w-9 bg-white rounded-full p-0.5 shrink-0" />
            <div class="font-bold text-lg leading-tight">Manejo de Gado</div>
          </div>
          <div class="text-xs text-brand-200 mt-1">${escapeHtml(currentProfile.nome)} · ${escapeHtml(currentProfile.papel)}</div>
        </div>
        <nav class="flex-1 px-2 py-3 space-y-1 overflow-y-auto">${navLinksHtml()}</nav>
        <div class="p-3 border-t border-brand-700">
          <button id="logoutBtnDesktop" class="w-full text-sm text-brand-100 hover:text-white text-left px-3 py-2">↩️ Sair</button>
        </div>
      </aside>

      <div class="flex-1 flex flex-col overflow-hidden">
        <header class="md:hidden flex items-center justify-between bg-brand-800 text-white px-3 py-3 shrink-0">
          <button id="menuBtn" class="text-2xl leading-none">☰</button>
          <span class="font-bold flex items-center gap-1.5"><img src="logo-estancia-boa-estrela.svg" alt="" class="h-6 w-6 bg-white rounded-full p-0.5" />Manejo de Gado</span>
          <button id="logoutBtnMobile" class="text-sm">Sair</button>
        </header>
        <div id="mobileNav" class="md:hidden hidden bg-brand-800 text-white px-2 pb-3 space-y-1 shrink-0">${navLinksHtml()}</div>
        <main id="page-content" class="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50"></main>
      </div>
    </div>
    <div id="modal-root"></div>
  `;

  document.getElementById('logoutBtnDesktop').onclick = logout;
  document.getElementById('logoutBtnMobile').onclick = logout;
  document.getElementById('menuBtn').onclick = () => {
    document.getElementById('mobileNav').classList.toggle('hidden');
  };
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', () => document.getElementById('mobileNav').classList.add('hidden'));
  });
}

function setActiveNav(routeName) {
  document.querySelectorAll('.nav-link').forEach(a => {
    if (a.dataset.route === routeName) {
      a.classList.add('bg-brand-700', 'text-white', 'font-medium');
    } else {
      a.classList.remove('bg-brand-700', 'text-white', 'font-medium');
    }
  });
}

// ------------------------------------------------------------
// ROTEADOR
// ------------------------------------------------------------
const ROUTES = {
  dashboard: pageDashboard,
  animais: pageAnimais,
  lotes: pageLotes,
  pastos: pagePastos,
  movimentacoes: pageMovimentacoes,
  reproducao: pageReproducao,
  alimentacao: pageAlimentacao,
  sanidade: pageSanidade,
  vendas: pageVendas,
  custos: pageCustos,
  orcamentos: pageOrcamentos,
  relatorios: pageRelatorios,
};

function route() {
  if (!currentUser) return;
  let hash = location.hash.replace('#', '') || 'dashboard';
  let param = null;
  if (hash.includes('/')) {
    const parts = hash.split('/');
    hash = parts[0];
    param = parts[1];
  }
  setActiveNav(hash);
  const content = document.getElementById('page-content');
  if (!content) return;
  if (hash === 'animal' && param) {
    pageAnimalDetalhe(param);
    return;
  }
  const fn = ROUTES[hash];
  if (fn) {
    fn();
  } else {
    pageDashboard();
  }
}

function loading(msg = 'Carregando...') {
  return `<div class="text-center text-gray-400 py-16">${msg}</div>`;
}

// ------------------------------------------------------------
// HELPERS GERAIS
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('pt-BR');
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return 'R$ 0,00';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr, days) {
  const dt = new Date(dateStr + 'T00:00:00');
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(dateStr1, dateStr2) {
  const a = new Date(dateStr1 + 'T00:00:00');
  const b = new Date(dateStr2 + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function idade(dataNascimento) {
  if (!dataNascimento) return '-';
  const dias = daysBetween(dataNascimento, todayISO());
  if (dias < 0) return '-';
  if (dias < 60) return `${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 24) return `${meses} meses`;
  return `${(meses / 12).toFixed(1)} anos`;
}

function toast(msg, type = 'info') {
  const colors = { info: 'bg-gray-800', error: 'bg-red-600', success: 'bg-brand-600' };
  const div = document.createElement('div');
  div.className = `fixed bottom-4 right-4 ${colors[type] || colors.info} text-white px-4 py-3 rounded-md shadow-lg z-[70] text-sm max-w-xs`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function confirmAction(msg) {
  return window.confirm(msg);
}

// ------------------------------------------------------------
// FORM FIELD BUILDERS
// ------------------------------------------------------------
function fld(label, inputHtml, extraClass = '') {
  return `<label class="block mb-3 ${extraClass}"><span class="text-sm font-medium text-gray-600">${label}</span>${inputHtml}</label>`;
}
function inp(name, value = '', type = 'text', extra = '') {
  const v = value === null || value === undefined ? '' : value;
  return `<input name="${name}" type="${type}" value="${escapeHtml(String(v))}" class="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" ${extra}>`;
}
function txt(name, value = '', extra = '') {
  return `<textarea name="${name}" class="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" rows="3" ${extra}>${escapeHtml(value || '')}</textarea>`;
}
function sel(name, options, selected = '', extra = '') {
  const opts = options.map(o => `<option value="${escapeHtml(String(o.value))}" ${String(o.value) === String(selected) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
  return `<select name="${name}" class="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" ${extra}>${opts}</select>`;
}
function formToObject(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) {
    obj[k] = v === '' ? null : v;
  }
  return obj;
}

// ------------------------------------------------------------
// MODAL
// ------------------------------------------------------------
function showModal(title, innerHtml, size = 'max-w-lg') {
  document.getElementById('modal-root').innerHTML = `
    <div class="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" id="modalOverlay">
      <div class="bg-white rounded-lg shadow-xl w-full ${size} my-8">
        <div class="flex justify-between items-center px-5 py-4 border-b">
          <h3 class="font-semibold text-lg">${title}</h3>
          <button id="modalClose" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-5">${innerHtml}</div>
      </div>
    </div>`;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

// ------------------------------------------------------------
// ACESSO AO BANCO (Supabase)
// ------------------------------------------------------------
async function dbSelect(table, { select = '*', filters = [], order = null, limit = null } = {}) {
  let q = sb.from(table).select(select);
  filters.forEach(f => { q = q[f.op || 'eq'](f.col, f.val); });
  if (order) q = q.order(order.col, { ascending: order.asc !== false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) {
    console.error(error);
    toast('Erro ao carregar dados: ' + error.message, 'error');
    return [];
  }
  return data || [];
}
async function dbInsert(table, obj) {
  const { data, error } = await sb.from(table).insert(obj).select();
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    throw error;
  }
  return data[0];
}
async function dbUpdate(table, id, obj) {
  const { data, error } = await sb.from(table).update(obj).eq('id', id).select();
  if (error) {
    toast('Erro ao atualizar: ' + error.message, 'error');
    throw error;
  }
  return data[0];
}
// Atualiza vários registros já existentes (cada um identificado por "id"),
// cada um só com os campos que estão mudando — usa UPDATE de verdade
// (não upsert), porque um upsert monta um INSERT por baixo dos panos e
// exige valores para toda coluna NOT NULL sem default (ex.: "identificacao"
// em "animais"), mesmo quando a intenção é só atualizar uma linha existente.
async function dbUpdateEmLote(table, registros) {
  return Promise.all(registros.map(r => {
    const { id, ...campos } = r;
    return dbUpdate(table, id, campos);
  }));
}
async function dbDelete(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) {
    toast('Erro ao excluir: ' + error.message, 'error');
    throw error;
  }
}
async function dbSelectOne(table, id, select = '*') {
  const { data, error } = await sb.from(table).select(select).eq('id', id).maybeSingle();
  if (error) {
    console.error(error);
    toast('Erro ao carregar dados: ' + error.message, 'error');
    return null;
  }
  return data;
}
async function dbCount(table, filters = []) {
  let q = sb.from(table).select('id', { count: 'exact', head: true });
  filters.forEach(f => { q = q[f.op || 'eq'](f.col, f.val); });
  const { count, error } = await q;
  if (error) { console.error(error); return 0; }
  return count || 0;
}
async function dbUpsert(table, obj, onConflict) {
  const { data, error } = await sb.from(table).upsert(obj, { onConflict }).select();
  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    throw error;
  }
  return data;
}

// pequenos helpers de opções reutilizados nos formulários
function pastoOptions(selected) {
  return [{ value: '', label: '— selecione —' }, ...pastosCache.map(p => ({ value: p.id, label: p.nome }))].map(o =>
    `<option value="${o.value}" ${String(o.value) === String(selected) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}
function loteOptions(selected, apenasAtivos = true) {
  const lista = apenasAtivos ? lotesCache.filter(l => l.ativo) : lotesCache;
  return [{ value: '', label: '— selecione —' }, ...lista.map(l => ({ value: l.id, label: l.nome + (l.pasto ? ' (' + l.pasto.nome + ')' : '') }))].map(o =>
    `<option value="${o.value}" ${String(o.value) === String(selected) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}

// ------------------------------------------------------------
// IMPORTAÇÃO DE CSV (genérico, com mapeamento de colunas)
// Funciona com qualquer exportação (leitor de microchip, planilha
// de pastos etc.) — o usuário indica qual coluna é qual.
// ------------------------------------------------------------
function parseCSV(text) {
  // remove BOM se existir
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const primeiraLinha = text.split(/\r?\n/)[0] || '';
  const delim = (primeiraLinha.split(';').length > primeiraLinha.split(',').length) ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignora
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => (v || '').trim() !== ''));
}

function normalizarSexo(v) {
  const s = (v || '').trim().toLowerCase();
  if (['f', 'femea', 'fêmea', 'female', 'fem'].includes(s)) return 'F';
  if (['m', 'macho', 'male'].includes(s)) return 'M';
  return s.startsWith('f') ? 'F' : 'M';
}

function parseDataFlexivel(v) {
  if (!v) return null;
  v = String(v).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

// Modal genérico: seleciona arquivo CSV, mostra mapeamento de colunas → campos, e chama onImportar(linhas, mapeamento, valoresFixos)
function formImportarCSV({ titulo, instrucoes, campos, onImportar }) {
  showModal(titulo, `
    <p class="text-sm text-gray-600 mb-3">${instrucoes || 'Selecione um arquivo .csv, .xlsx ou .xls exportado do seu aplicativo ou planilha.'}</p>
    <input type="file" id="csvFile" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="mb-3 block text-sm">
    <div id="csvArea" class="text-sm text-gray-400">Nenhum arquivo selecionado ainda.</div>
  `, 'max-w-3xl');

  document.getElementById('csvFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('csvArea').innerHTML = '<p class="text-gray-400">Lendo arquivo...</p>';
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        if (typeof XLSX === 'undefined') {
          document.getElementById('csvArea').innerHTML = '<p class="text-red-600">Não foi possível carregar o leitor de planilhas Excel (verifique sua conexão com a internet) — tente novamente, ou exporte o arquivo como .csv.</p>';
          return;
        }
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        if (wb.SheetNames.length > 1) renderSelecaoAba(wb);
        else processarPlanilha(wb, wb.SheetNames[0]);
      } else {
        const text = await file.text();
        prosseguirComLinhas(parseCSV(text));
      }
    } catch (err) {
      console.error(err);
      document.getElementById('csvArea').innerHTML = '<p class="text-red-600">Não foi possível ler esse arquivo. Confira se é um .csv, .xlsx ou .xls válido.</p>';
    }
  });

  function renderSelecaoAba(wb) {
    document.getElementById('csvArea').innerHTML = `
      <label class="block text-sm mb-3"><span class="text-gray-600">Sua planilha tem várias abas — qual delas usar?</span>
        <select id="selAba" class="mt-1 w-full border rounded-md px-2 py-1.5 text-sm bg-white">
          ${wb.SheetNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
        </select>
      </label>
      <button type="button" id="btnUsarAba" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Usar esta aba</button>
    `;
    document.getElementById('btnUsarAba').onclick = () => processarPlanilha(wb, document.getElementById('selAba').value);
  }

  function processarPlanilha(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map(r =>
      r.map(v => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (v === null || v === undefined) return '';
        return String(v);
      })
    );
    prosseguirComLinhas(rows);
  }

  function prosseguirComLinhas(rows) {
    const limpas = (rows || []).filter(r => r.some(v => (v || '').toString().trim() !== ''));
    if (!limpas.length) {
      document.getElementById('csvArea').innerHTML = '<p class="text-red-600">Não foi possível ler nenhuma linha desse arquivo.</p>';
      return;
    }
    const headers = limpas[0].map(h => (h || '').toString().trim());
    const dataRows = limpas.slice(1);
    renderMapeamento(headers, dataRows);
  }

  function renderMapeamento(headers, dataRows) {
    document.getElementById('csvArea').innerHTML = `
      <p class="text-sm mb-2"><strong>${dataRows.length}</strong> linha(s) de dados encontrada(s). Indique qual coluna do seu arquivo corresponde a cada campo:</p>
      <div class="grid md:grid-cols-2 gap-x-4 gap-y-2 mb-3">
        ${campos.map(c => `
          <label class="block text-sm">
            <span class="text-gray-600">${c.label}${c.obrigatorio ? ' *' : ''}</span>
            <select data-campo="${c.key}" class="mapSelect mt-1 w-full border rounded-md px-2 py-1.5 text-sm bg-white">
              <option value="">— não importar —</option>
              ${headers.map((h, i) => `<option value="${i}">${escapeHtml(h || 'Coluna ' + (i + 1))}</option>`).join('')}
              ${c.permiteFixo ? `<option value="__fixo__">Usar o mesmo valor para todos...</option>` : ''}
            </select>
            ${c.permiteFixo ? `<input type="text" data-fixo="${c.key}" placeholder="valor fixo" class="hidden mt-1 w-full border rounded-md px-2 py-1 text-xs">` : ''}
          </label>
        `).join('')}
      </div>
      <p class="text-xs text-gray-400 mb-1">Prévia das 3 primeiras linhas:</p>
      <div class="overflow-x-auto border rounded-md mb-3">
        <table class="w-full text-xs">
          <thead><tr>${headers.map(h => `<th class="text-left px-2 py-1 border-b bg-gray-50">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${dataRows.slice(0, 3).map(r => `<tr>${r.map(v => `<td class="px-2 py-1 border-b">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="flex justify-end gap-2">
        <button type="button" id="btnCancelarImp" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="button" id="btnConfirmarImp" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Importar ${dataRows.length} registro(s)</button>
      </div>
    `;
    document.getElementById('btnCancelarImp').onclick = closeModal;
    document.querySelectorAll('.mapSelect').forEach(selEl => {
      selEl.addEventListener('change', () => {
        const campo = selEl.dataset.campo;
        const fixoInput = document.querySelector(`[data-fixo="${campo}"]`);
        if (fixoInput) fixoInput.classList.toggle('hidden', selEl.value !== '__fixo__');
      });
    });
    document.getElementById('btnConfirmarImp').onclick = async () => {
      const mapping = {};
      const fixos = {};
      document.querySelectorAll('.mapSelect').forEach(selEl => {
        const campo = selEl.dataset.campo;
        if (selEl.value === '__fixo__') {
          fixos[campo] = document.querySelector(`[data-fixo="${campo}"]`)?.value || '';
        } else if (selEl.value !== '') {
          mapping[campo] = parseInt(selEl.value, 10);
        }
      });
      const faltando = campos.filter(c => c.obrigatorio && mapping[c.key] === undefined && !fixos[c.key]);
      if (faltando.length) {
        toast('Preencha o mapeamento obrigatório: ' + faltando.map(f => f.label).join(', '), 'error');
        return;
      }
      const btn = document.getElementById('btnConfirmarImp');
      btn.disabled = true; btn.textContent = 'Importando...';
      try {
        await onImportar(dataRows, mapping, fixos);
      } finally {
        btn.disabled = false;
      }
    };
  }
}

async function inserirEmLotes(table, registros, tamanhoLote = 200) {
  let sucesso = 0, falhas = 0;
  for (let i = 0; i < registros.length; i += tamanhoLote) {
    const bloco = registros.slice(i, i + tamanhoLote);
    const { error } = await sb.from(table).insert(bloco);
    if (error) { console.error(error); falhas += bloco.length; } else { sucesso += bloco.length; }
  }
  return { sucesso, falhas };
}

function importarAnimaisCSV() {
  formImportarCSV({
    titulo: 'Importar animais de CSV (leitor de microchip / planilha)',
    instrucoes: 'Funciona com a exportação de qualquer aplicativo de leitura de brinco eletrônico — basta indicar abaixo qual coluna do seu arquivo é cada campo.',
    campos: [
      { key: 'identificacao', label: 'Brinco / identificação (eletrônico ou visual)', obrigatorio: true },
      { key: 'nome', label: 'Nome' },
      { key: 'sexo', label: 'Sexo', obrigatorio: true, permiteFixo: true },
      { key: 'categoria', label: 'Categoria', obrigatorio: true, permiteFixo: true },
      { key: 'raca', label: 'Raça' },
      { key: 'data_nascimento', label: 'Data de nascimento' },
      { key: 'peso_atual', label: 'Peso (kg)' },
      { key: 'lote', label: 'Lote (pelo nome, opcional)' },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      const registros = rows.map(r => {
        const loteNome = get(r, 'lote');
        const lote = loteNome ? lotesCache.find(l => l.nome.toLowerCase() === loteNome.toLowerCase()) : null;
        const peso = get(r, 'peso_atual');
        return {
          identificacao: get(r, 'identificacao'),
          nome: get(r, 'nome') || null,
          sexo: normalizarSexo(get(r, 'sexo')),
          categoria: get(r, 'categoria') || 'Bezerra',
          raca: get(r, 'raca') || null,
          data_nascimento: parseDataFlexivel(get(r, 'data_nascimento')),
          peso_atual: peso ? Number(String(peso).replace(',', '.')) || null : null,
          peso_atual_data: peso ? todayISO() : null,
          lote_id: lote ? lote.id : null,
          status: 'ativo',
        };
      }).filter(r => r.identificacao);

      if (!registros.length) {
        toast('Nenhum registro válido (confira a coluna de identificação)', 'error');
        return;
      }
      const { sucesso, falhas } = await inserirEmLotes('animais', registros);
      toast(`Importação concluída: ${sucesso} animal(is) importado(s)${falhas ? `, ${falhas} com erro` : ''}`, falhas ? 'error' : 'success');
      closeModal();
      pageAnimais();
    },
  });
}

function importarPastosCSV() {
  formImportarCSV({
    titulo: 'Importar pastos de CSV',
    instrucoes: 'Arquivo simples com o nome do pasto e a área em hectares (ex.: "nome do pasto,area").',
    campos: [
      { key: 'nome', label: 'Nome do pasto', obrigatorio: true },
      { key: 'area_ha', label: 'Área (ha)' },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      const registros = rows.map(r => {
        const area = get(r, 'area_ha');
        return {
          nome: get(r, 'nome'),
          area_ha: area ? Number(String(area).replace(',', '.')) || null : null,
          ativo: true,
        };
      }).filter(r => r.nome);

      if (!registros.length) {
        toast('Nenhum registro válido (confira a coluna de nome do pasto)', 'error');
        return;
      }
      const { sucesso, falhas } = await inserirEmLotes('pastos', registros);
      toast(`Importação concluída: ${sucesso} pasto(s) importado(s)${falhas ? `, ${falhas} com erro` : ''}`, falhas ? 'error' : 'success');
      closeModal();
      await refreshCaches();
      pagePastos();
    },
  });
}

// Importa pesagens de qualquer app/balança que consiga exportar um arquivo
// (CSV, XLS ou XLSX) com o chip/brinco e o peso de cada animal pesado.
// Grava cada pesagem no histórico (tabela "pesagens", usada para calcular
// GMD e comparar com a pesagem anterior) e mantém o peso atual do animal
// sincronizado com a pesagem mais recente. Só atualiza animais já
// cadastrados (casando pelo brinco/identificação) — não cria animais novos.
function importarPesagensCSV() {
  formImportarCSV({
    titulo: 'Importar pesagens de arquivo do app de pesagem',
    instrucoes: 'Funciona com a exportação de qualquer app ou balança — por exemplo, apps de leitura de RFID com balança Bluetooth acoplada (ex.: balanças Coimma) costumam ter um botão "Exportar" ou "Compartilhar" que gera um arquivo CSV/XLSX com o chip e o peso de cada animal pesado. Selecione esse arquivo aqui. Só atualiza animais que já estão cadastrados no Rebanho — o brinco/chip precisa ser igual ao já cadastrado.',
    campos: [
      { key: 'identificacao', label: 'Brinco / Chip / identificação do animal', obrigatorio: true },
      { key: 'peso', label: 'Peso (kg)', obrigatorio: true },
      { key: 'data', label: 'Data da pesagem (opcional — usa hoje se vazio)' },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      const animaisAtivos = await dbSelect('animais', { select: 'id,identificacao,peso_atual_data', filters: [{ col: 'status', val: 'ativo' }] });
      const porIdentificacao = {};
      animaisAtivos.forEach(a => { porIdentificacao[(a.identificacao || '').trim().toLowerCase()] = a; });

      const novasPesagens = [];
      const maisRecentePorAnimal = {}; // id -> { peso, data } — só a pesagem mais nova deste lote, por animal
      const naoEncontrados = [];
      const semPesoValido = [];
      rows.forEach(r => {
        const identificacao = get(r, 'identificacao');
        if (!identificacao) return;
        const pesoTexto = get(r, 'peso');
        const peso = pesoTexto ? Number(String(pesoTexto).replace(',', '.')) : NaN;
        if (!pesoTexto || isNaN(peso) || peso <= 0) { semPesoValido.push(identificacao); return; }
        const animal = porIdentificacao[identificacao.toLowerCase()];
        if (!animal) { naoEncontrados.push(identificacao); return; }
        const data = parseDataFlexivel(get(r, 'data')) || todayISO();
        novasPesagens.push({ animal_id: animal.id, peso, data });
        const atual = maisRecentePorAnimal[animal.id];
        if (!atual || data >= atual.data) maisRecentePorAnimal[animal.id] = { peso, data, peso_atual_data_anterior: animal.peso_atual_data };
      });

      if (!novasPesagens.length) {
        toast('Nenhum brinco do arquivo bateu com animais ativos já cadastrados (confira o mapeamento de colunas)', 'error');
        return;
      }
      await inserirEmLotes('pesagens', novasPesagens);

      // só atualiza o peso "atual" do animal se a pesagem importada for igual/mais nova que a que já estava registrada
      const atualizacoesAnimais = Object.entries(maisRecentePorAnimal)
        .filter(([, v]) => !v.peso_atual_data_anterior || v.data >= v.peso_atual_data_anterior)
        .map(([id, v]) => ({ id, peso_atual: v.peso, peso_atual_data: v.data }));
      if (atualizacoesAnimais.length) await dbUpdateEmLote('animais', atualizacoesAnimais);

      toast(`${novasPesagens.length} pesagem(ns) importada(s)${naoEncontrados.length ? `, ${naoEncontrados.length} brinco(s) não encontrado(s)` : ''}${semPesoValido.length ? `, ${semPesoValido.length} sem peso válido` : ''}`, naoEncontrados.length || semPesoValido.length ? 'error' : 'success');
      closeModal();
      await refreshCaches();
      pageAnimais();

      if (naoEncontrados.length) {
        showModal('Brincos não encontrados', `
          <p class="text-sm text-gray-600 mb-3">Esses ${naoEncontrados.length} brinco(s) do arquivo de pesagem não bateram com nenhum animal ativo já cadastrado no sistema. Confira se não há erro de digitação, ou se o animal ainda não foi cadastrado no Rebanho.</p>
          <div class="max-h-64 overflow-y-auto border rounded-md p-2 text-sm font-mono">${naoEncontrados.map(id => escapeHtml(id)).join('<br>')}</div>
          <div class="flex justify-end mt-3"><button type="button" id="btnFecharNaoEncontrados" class="px-4 py-2 text-sm rounded-md border">Fechar</button></div>
        `);
        document.getElementById('btnFecharNaoEncontrados').onclick = closeModal;
      }
    },
  });
}

// ------------------------------------------------------------
// CORREÇÃO EM LOTE DE SEXO/CATEGORIA
// (útil quando uma importação anterior gravou tudo com o mesmo sexo
// por engano — busca em TODOS os animais, não só os ativos/fêmeas)
// ------------------------------------------------------------
function corrigirSexoCategoriaCSV() {
  formImportarCSV({
    titulo: 'Corrigir sexo/categoria em lote',
    instrucoes: 'Use isso se algum animal ficou cadastrado com o sexo ou a categoria errada (por exemplo, se uma importação anterior marcou o rebanho todo como macho por engano). Cada linha atualiza o animal já cadastrado com esse brinco — não cria animal novo. Se o brinco não bater (ex.: sua planilha tem o RGN/RGD, mas o sistema tem o número do chip), eu tento casar pelo nome cadastrado do animal como alternativa — nesse caso, mapeie a coluna do RGN/RGD também no campo "Nome". Se não souber a categoria de cada um, pode deixar essa coluna sem mapear e corrigir só o sexo.',
    campos: [
      { key: 'identificacao', label: 'Brinco / RGN do animal', obrigatorio: true },
      { key: 'nome', label: 'Nome cadastrado do animal (usado se o brinco não bater)' },
      { key: 'sexo', label: 'Sexo correto (F ou M)', permiteFixo: true },
      { key: 'categoria', label: 'Categoria correta (Vaca, Novilha, Touro, Boi...)', permiteFixo: true },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      const todosAnimais = await dbSelect('animais', { select: 'id,identificacao,nome,sexo,categoria' });
      const porIdentificacao = {};
      const porNome = {};
      todosAnimais.forEach(a => {
        if (a.identificacao) porIdentificacao[a.identificacao.trim().toLowerCase()] = a;
        if (a.nome) porNome[a.nome.trim().toLowerCase()] = a;
      });

      const atualizacoes = [];
      const naoEncontrados = [];
      const semAlteracao = [];
      rows.forEach(r => {
        const identificacao = get(r, 'identificacao');
        const nomeBusca = get(r, 'nome');
        if (!identificacao && !nomeBusca) return;
        let animal = identificacao ? porIdentificacao[identificacao.toLowerCase()] : null;
        if (!animal && nomeBusca) animal = porNome[nomeBusca.toLowerCase()];
        if (!animal) { naoEncontrados.push(identificacao || nomeBusca); return; }
        const sexoTxt = get(r, 'sexo').toUpperCase();
        const sexo = sexoTxt === 'F' || sexoTxt === 'FEMEA' || sexoTxt === 'FÊMEA' ? 'F'
          : sexoTxt === 'M' || sexoTxt === 'MACHO' ? 'M' : null;
        const categoria = get(r, 'categoria');
        const upd = { id: animal.id };
        let mudou = false;
        if (sexo && sexo !== animal.sexo) { upd.sexo = sexo; mudou = true; }
        if (categoria && categoria !== animal.categoria) { upd.categoria = categoria; mudou = true; }
        if (mudou) atualizacoes.push(upd);
        else semAlteracao.push(identificacao || nomeBusca);
      });

      if (atualizacoes.length) await dbUpdateEmLote('animais', atualizacoes);

      toast(`${atualizacoes.length} animal(is) corrigido(s)${naoEncontrados.length ? `, ${naoEncontrados.length} não encontrado(s)` : ''}${semAlteracao.length ? `, ${semAlteracao.length} já estavam certos` : ''}`, atualizacoes.length ? 'success' : 'error');
      closeModal();
      pageAnimais();

      if (naoEncontrados.length) {
        showModal('Animais não encontrados', `
          <p class="text-sm text-gray-600 mb-3">Esses ${naoEncontrados.length} brinco(s)/nome(s) não bateram com nenhum animal cadastrado (de nenhum status).</p>
          <div class="max-h-64 overflow-y-auto border rounded-md p-2 text-sm font-mono">${naoEncontrados.map(id => escapeHtml(id)).join('<br>')}</div>
          <div class="flex justify-end mt-3"><button type="button" id="btnFecharNaoEncontrados" class="px-4 py-2 text-sm rounded-md border">Fechar</button></div>
        `);
        document.getElementById('btnFecharNaoEncontrados').onclick = closeModal;
      }
    },
  });
}

// ------------------------------------------------------------
// PESO / GMD — comparação com a pesagem anterior
// ------------------------------------------------------------
// Recebe as pesagens de UM animal (em qualquer ordem) e retorna a mais
// recente, a anterior a ela, a diferença de peso e o GMD (kg/dia) entre
// as duas. Retorna null se não houver nenhuma pesagem.
function comparativoPeso(pesagensDoAnimal) {
  if (!pesagensDoAnimal || !pesagensDoAnimal.length) return null;
  const ordenadas = [...pesagensDoAnimal].sort((a, b) => (a.data < b.data ? 1 : (a.data > b.data ? -1 : 0)));
  const atual = ordenadas[0];
  const anterior = ordenadas[1] || null;
  if (!anterior) return { atual, anterior: null, diferenca: null, dias: null, gmd: null };
  const diferenca = Number((Number(atual.peso) - Number(anterior.peso)).toFixed(1));
  const dias = daysBetween(anterior.data, atual.data);
  const gmd = dias > 0 ? Number((diferenca / dias).toFixed(3)) : null;
  return { atual, anterior, diferenca, dias, gmd };
}

// Badge compacto: seta + valor ganho/perdido (+ GMD quando houver pesagem anterior)
function comparativoPesoBadgeHtml(comp) {
  if (!comp) return '<span class="text-gray-300">—</span>';
  if (!comp.anterior) return `<span class="text-gray-700">${comp.atual.peso} kg</span> <span class="text-xs text-gray-400">(1ª pesagem)</span>`;
  const cor = comp.diferenca > 0 ? 'text-green-600' : (comp.diferenca < 0 ? 'text-red-600' : 'text-gray-500');
  const seta = comp.diferenca > 0 ? '▲' : (comp.diferenca < 0 ? '▼' : '▬');
  const sinal = comp.diferenca > 0 ? '+' : '';
  return `<span class="text-gray-700">${comp.atual.peso} kg</span> <span class="${cor} font-medium">${seta} ${sinal}${comp.diferenca} kg</span>` +
    (comp.gmd !== null ? ` <span class="text-xs text-gray-400">(GMD ${comp.gmd >= 0 ? '+' : ''}${comp.gmd} kg/dia)</span>` : '');
}

// aceita "1.234,56", "R$ 1.234,56", "1234.56" etc.
function parseValorFlexivel(v) {
  if (v === null || v === undefined || v === '') return NaN;
  let s = String(v).trim().replace(/^R\$\s?/i, '').replace(/\s/g, '');
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.'); // formato brasileiro: 1.234,56
  } else {
    s = s.replace(/,/g, ''); // formato americano com vírgula de milhar: 1,234.56
  }
  return parseFloat(s);
}

// tenta reconhecer a categoria pelo texto da planilha (ex.: "Ração", "Veterinário", "Salários"...)
function normalizarCategoria(v) {
  const s = (v || '').trim().toLowerCase();
  if (!s) return null;
  if (CATEGORIAS_CUSTO.some(c => c.value === s)) return s;
  const mapa = [
    [['aliment', 'ração', 'racao', 'nutri', 'suplement', 'sal mineral'], 'alimentacao'],
    [['sanidade', 'veterinar', 'vacina', 'remedio', 'remédio', 'medicamento', 'saude', 'saúde'], 'sanidade'],
    [['mao de obra', 'mão de obra', 'salario', 'salário', 'funcionario', 'funcionário', 'diarista', 'folha'], 'mao_de_obra'],
    [['infraestrutura', 'cerca', 'curral', 'manutenc', 'construc'], 'infraestrutura'],
    [['reprodu', 'iatf', 'semen', 'sêmen', 'inseminac'], 'reproducao'],
    [['combustivel', 'combustível', 'diesel', 'gasolina', 'oleo diesel', 'óleo diesel', 'abastec'], 'combustivel'],
    [['assinatura', 'mensalidade', 'software', 'sistema', 'streaming'], 'assinaturas'],
    [['investimento', 'maquinario', 'maquinário', 'implemento', 'trator novo', 'benfeitoria'], 'investimentos'],
    [['imposto', 'taxa', 'itr', 'funrural'], 'impostos_taxas'],
  ];
  for (const [chaves, cat] of mapa) {
    if (chaves.some(k => s.includes(k))) return cat;
  }
  return null;
}

// tenta reconhecer a categoria de receita pelo texto da planilha
function normalizarCategoriaReceita(v) {
  const s = (v || '').trim().toLowerCase();
  if (!s) return null;
  if (CATEGORIAS_RECEITA.some(c => c.value === s)) return s;
  const mapa = [
    [['insumo', 'leite', 'feno', 'esterco', 'silagem', 'venda de'], 'venda_insumos'],
    [['arrend', 'aluguel', 'aluguer', 'locac'], 'arrendamento'],
    [['servico', 'serviço', 'prestac'], 'prestacao_servico'],
    [['subsidio', 'subsídio', 'incentivo', 'programa'], 'subsidio'],
    [['rendimento', 'juros', 'aplicac', 'financeir'], 'rendimento_financeiro'],
  ];
  for (const [chaves, cat] of mapa) {
    if (chaves.some(k => s.includes(k))) return cat;
  }
  return null;
}

function importarLancamentosCSV() {
  formImportarCSV({
    titulo: 'Importar lançamentos de custos (planilha Excel/CSV)',
    instrucoes: 'Selecione a planilha de lançamentos que você já utiliza (.xlsx, .xls ou .csv). Indique abaixo qual coluna é a descrição, o valor, a data etc.',
    campos: [
      { key: 'descricao', label: 'Descrição do lançamento', obrigatorio: true },
      { key: 'valor', label: 'Valor (R$)', obrigatorio: true },
      { key: 'data', label: 'Data', obrigatorio: true, permiteFixo: true },
      { key: 'categoria', label: 'Categoria', permiteFixo: true },
      { key: 'lote', label: 'Lote (pelo nome, opcional)' },
      { key: 'pasto', label: 'Pasto (pelo nome, opcional)' },
      { key: 'observacoes', label: 'Observações' },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      let semValor = 0;
      const registros = rows.map(r => {
        const valor = parseValorFlexivel(get(r, 'valor'));
        const loteNome = get(r, 'lote');
        const pastoNome = get(r, 'pasto');
        const lote = loteNome ? lotesCache.find(l => l.nome.toLowerCase() === loteNome.toLowerCase()) : null;
        const pasto = pastoNome ? pastosCache.find(p => p.nome.toLowerCase() === pastoNome.toLowerCase()) : null;
        if (!get(r, 'descricao') || isNaN(valor) || valor <= 0) { semValor++; return null; }
        return {
          descricao: get(r, 'descricao'),
          valor,
          data: parseDataFlexivel(get(r, 'data')) || todayISO(),
          categoria: normalizarCategoria(get(r, 'categoria')) || 'outros',
          lote_id: lote ? lote.id : null,
          pasto_id: pasto ? pasto.id : null,
          observacoes: get(r, 'observacoes') || null,
        };
      }).filter(Boolean);

      if (!registros.length) {
        toast('Nenhum lançamento válido (confira as colunas de descrição e valor)', 'error');
        return;
      }
      const { sucesso, falhas } = await inserirEmLotes('custos', registros);
      const avisoIgnorados = semValor ? `, ${semValor} linha(s) ignorada(s) por falta de descrição/valor` : '';
      toast(`Importação concluída: ${sucesso} lançamento(s) importado(s)${falhas ? `, ${falhas} com erro` : ''}${avisoIgnorados}`, falhas ? 'error' : 'success');
      closeModal();
      pageCustos();
    },
  });
}

function importarReceitasCSV() {
  formImportarCSV({
    titulo: 'Importar entradas financeiras (planilha Excel/CSV)',
    instrucoes: 'Selecione a planilha de entradas/receitas que não são venda de gado (venda de insumos, arrendamento, prestação de serviço, subsídio, rendimento financeiro etc.). Indique abaixo qual coluna é a descrição, o valor, a data etc.',
    campos: [
      { key: 'descricao', label: 'Descrição da entrada', obrigatorio: true },
      { key: 'valor', label: 'Valor (R$)', obrigatorio: true },
      { key: 'data', label: 'Data', obrigatorio: true, permiteFixo: true },
      { key: 'categoria', label: 'Categoria', permiteFixo: true },
      { key: 'observacoes', label: 'Observações' },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      let semValor = 0;
      const registros = rows.map(r => {
        const valor = parseValorFlexivel(get(r, 'valor'));
        if (!get(r, 'descricao') || isNaN(valor) || valor <= 0) { semValor++; return null; }
        return {
          descricao: get(r, 'descricao'),
          valor,
          data: parseDataFlexivel(get(r, 'data')) || todayISO(),
          categoria: normalizarCategoriaReceita(get(r, 'categoria')) || 'outros',
          observacoes: get(r, 'observacoes') || null,
        };
      }).filter(Boolean);

      if (!registros.length) {
        toast('Nenhuma entrada válida (confira as colunas de descrição e valor)', 'error');
        return;
      }
      const { sucesso, falhas } = await inserirEmLotes('receitas', registros);
      const avisoIgnorados = semValor ? `, ${semValor} linha(s) ignorada(s) por falta de descrição/valor` : '';
      toast(`Importação concluída: ${sucesso} entrada(s) importada(s)${falhas ? `, ${falhas} com erro` : ''}${avisoIgnorados}`, falhas ? 'error' : 'success');
      closeModal();
      renderReceitas();
    },
  });
}

// ------------------------------------------------------------
// IMPORTAÇÃO DE NOTA FISCAL (XML) e ANEXOS (fotos de nota, PDFs)
// ------------------------------------------------------------
function xmlTag(root, name) {
  const els = root.getElementsByTagName(name);
  return els.length ? (els[0].textContent || '').trim() : '';
}

function parseNFeXML(xmlText) {
  try {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) return null;
    const infNFeAttrId = xml.getElementsByTagName('infNFe')[0]?.getAttribute('Id') || '';
    const chave = xmlTag(xml, 'chNFe') || infNFeAttrId.replace(/^NFe/, '');
    const numero = xmlTag(xml, 'nNF');
    let data = xmlTag(xml, 'dhEmi') || xmlTag(xml, 'dEmi');
    data = data ? data.slice(0, 10) : todayISO();
    const fornecedor = xmlTag(xml, 'xNome');
    const valorTxt = xmlTag(xml, 'vNF');
    if (!numero && !valorTxt && !fornecedor) return null;
    return { chave, numero, data, fornecedor, valor: valorTxt ? Number(valorTxt) : null };
  } catch (e) {
    return null;
  }
}

function formImportarNotaFiscal() {
  showModal('Importar nota fiscal (XML)', `
    <p class="text-sm text-gray-600 mb-3">Selecione um ou mais arquivos .xml de NF-e/NFC-e (o mesmo arquivo que o fornecedor envia, ou que você baixa da SEFAZ). Os dados são lidos automaticamente e viram lançamentos de custo.</p>
    <input type="file" id="xmlFile" accept=".xml,text/xml" multiple class="mb-3 block text-sm">
    <div id="xmlArea" class="text-sm text-gray-400">Nenhum arquivo selecionado ainda.</div>
  `, 'max-w-2xl');

  document.getElementById('xmlFile').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const parsed = [];
    for (const f of files) {
      const text = await f.text();
      const info = parseNFeXML(text);
      if (info) parsed.push(info); else toast('Não foi possível ler o XML: ' + f.name, 'error');
    }
    if (!parsed.length) {
      document.getElementById('xmlArea').innerHTML = '<p class="text-red-600">Nenhuma nota fiscal válida encontrada nos arquivos selecionados.</p>';
      return;
    }
    renderNFPreview(parsed);
  });

  function renderNFPreview(parsed) {
    document.getElementById('xmlArea').innerHTML = `
      <p class="text-sm mb-2">${parsed.length} nota(s) lida(s). Confira e ajuste antes de lançar como custo:</p>
      <div class="space-y-3 max-h-80 overflow-y-auto">
        ${parsed.map((nf, i) => `
          <div class="border rounded-md p-3">
            <div class="grid grid-cols-2 gap-2">
              ${fld('Fornecedor', inp(`forn_${i}`, nf.fornecedor, 'text', `id="forn_${i}"`))}
              ${fld('Valor (R$)', inp(`valor_${i}`, nf.valor, 'number', `step="0.01" id="valor_${i}"`))}
              ${fld('Data', inp(`data_${i}`, nf.data, 'date', `id="data_${i}"`))}
              ${fld('Categoria', sel(`cat_${i}`, CATEGORIAS_CUSTO, 'outros', `id="cat_${i}"`))}
            </div>
            <p class="text-xs text-gray-400 mt-1">NF nº ${escapeHtml(nf.numero || '-')} ${nf.chave ? '· chave ' + escapeHtml(nf.chave.slice(-8)) : ''}</p>
          </div>
        `).join('')}
      </div>
      <div class="flex justify-end gap-2 mt-3">
        <button type="button" id="btnCancelarNF" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="button" id="btnConfirmarNF" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Lançar ${parsed.length} custo(s)</button>
      </div>
    `;
    document.getElementById('btnCancelarNF').onclick = closeModal;
    document.getElementById('btnConfirmarNF').onclick = async () => {
      const registros = parsed.map((nf, i) => ({
        categoria: document.getElementById(`cat_${i}`).value,
        descricao: 'NF ' + (nf.numero || '') + (document.getElementById(`forn_${i}`).value ? ' - ' + document.getElementById(`forn_${i}`).value : ''),
        valor: Number(document.getElementById(`valor_${i}`).value) || 0,
        data: document.getElementById(`data_${i}`).value || todayISO(),
        nf_numero: nf.numero || null,
        nf_fornecedor: document.getElementById(`forn_${i}`).value || null,
        nf_chave_acesso: nf.chave || null,
      })).filter(r => r.valor > 0);
      if (!registros.length) {
        toast('Nenhum lançamento com valor válido para importar', 'error');
        return;
      }
      const { sucesso, falhas } = await inserirEmLotes('custos', registros);
      toast(`${sucesso} custo(s) lançado(s) a partir das notas fiscais${falhas ? `, ${falhas} com erro` : ''}`, falhas ? 'error' : 'success');
      closeModal();
      pageCustos();
    };
  }
}

// upload de foto/PDF (ex.: nota fiscal fotografada) para o Supabase Storage
async function uploadAnexo(file, pastaPrefix = 'custos') {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${pastaPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('anexos').upload(path, file);
  if (error) {
    toast('Erro ao enviar anexo: ' + error.message, 'error');
    throw error;
  }
  return path;
}
function anexoUrl(path) {
  if (!path) return null;
  const { data } = sb.storage.from('anexos').getPublicUrl(path);
  return data?.publicUrl || null;
}

// ------------------------------------------------------------
// LÓGICA DE REPRODUÇÃO (gestações em andamento / previsão de partos)
// ------------------------------------------------------------
// A partir da lista de eventos reprodutivos de TODOS os animais, calcula,
// por fêmea, se ela está "provavelmente prenhe" com base no último evento
// de inseminação/monta que ainda não tem diagnóstico negativo nem parto
// registrado depois dele.
function computeGestacoesAtivas(eventos) {
  const porAnimal = {};
  eventos.forEach(ev => {
    if (!porAnimal[ev.animal_id]) porAnimal[ev.animal_id] = [];
    porAnimal[ev.animal_id].push(ev);
  });
  const resultado = [];
  Object.keys(porAnimal).forEach(animalId => {
    const evs = porAnimal[animalId].slice().sort((a, b) => a.data < b.data ? -1 : 1);
    // encontra o último evento de cobertura (inseminação/monta)
    let ultimaCobertura = null;
    for (const ev of evs) {
      if (ev.tipo_evento === 'inseminacao' || ev.tipo_evento === 'monta_natural') {
        ultimaCobertura = ev;
      }
    }
    if (!ultimaCobertura) return;
    // eventos depois da última cobertura
    const depois = evs.filter(ev => ev.data >= ultimaCobertura.data && ev.id !== ultimaCobertura.id);
    const temPartoDepois = depois.some(ev => ev.tipo_evento === 'parto');
    const temDescarteDepois = depois.some(ev => ev.tipo_evento === 'descarte_reprodutivo' || ev.tipo_evento === 'aborto');
    const diagnosticos = depois.filter(ev => ev.tipo_evento === 'diagnostico_gestacao').sort((a, b) => a.data < b.data ? -1 : 1);
    const ultimoDiagnostico = diagnosticos.length ? diagnosticos[diagnosticos.length - 1] : null;
    if (temPartoDepois || temDescarteDepois) return;
    if (ultimoDiagnostico && ultimoDiagnostico.resultado === 'negativo') return;
    const dataPrevista = ultimaCobertura.data_prevista_parto || addDaysISO(ultimaCobertura.data, GESTACAO_DIAS);
    resultado.push({
      animal_id: animalId,
      evento: ultimaCobertura,
      data_cobertura: ultimaCobertura.data,
      data_prevista_parto: dataPrevista,
      diagnostico: ultimoDiagnostico ? ultimoDiagnostico.resultado : 'pendente',
      dias_restantes: daysBetween(todayISO(), dataPrevista),
    });
  });
  return resultado.sort((a, b) => a.data_prevista_parto < b.data_prevista_parto ? -1 : 1);
}

function taxaPrenhez(diagnosticos) {
  const validos = diagnosticos.filter(d => d.resultado === 'positivo' || d.resultado === 'negativo');
  const positivos = validos.filter(d => d.resultado === 'positivo').length;
  const pct = validos.length ? (positivos / validos.length * 100) : 0;
  return { total: validos.length, positivos, negativos: validos.length - positivos, pct };
}

// ------------------------------------------------------------
// PÁGINA: DASHBOARD
// ------------------------------------------------------------
async function pageDashboard() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();

  const [animaisAtivos, totalLotes, totalPastos, eventos, tratamentos, custosMes] = await Promise.all([
    dbSelect('animais', { select: 'id,categoria,sexo,lote_id', filters: [{ col: 'status', val: 'ativo' }] }),
    dbCount('lotes', [{ col: 'ativo', val: true }]),
    dbCount('pastos', [{ col: 'ativo', val: true }]),
    dbSelect('eventos_reprodutivos'),
    dbCount('registros_sanitarios', [{ col: 'status', val: 'em_tratamento' }]),
    dbSelect('custos', { filters: [{ col: 'data', op: 'gte', val: todayISO().slice(0, 8) + '01' }] }),
  ]);

  const gestacoes = computeGestacoesAtivas(eventos);
  const partosProximos = gestacoes.filter(g => g.dias_restantes <= 30 && g.dias_restantes >= -15);
  const dataLimite90 = addDaysISO(todayISO(), -90);
  const diagnosticos90 = eventos.filter(e => e.tipo_evento === 'diagnostico_gestacao' && e.data >= dataLimite90);
  const taxa = taxaPrenhez(diagnosticos90);
  const totalCustosMes = custosMes.reduce((s, c) => s + Number(c.valor || 0), 0);

  // rebanho por pasto/lote
  const animaisPorLote = {};
  animaisAtivos.forEach(a => {
    if (!a.lote_id) return;
    animaisPorLote[a.lote_id] = (animaisPorLote[a.lote_id] || 0) + 1;
  });
  const linhasPastoLote = lotesCache.map(l => ({
    pasto: l.pasto ? l.pasto.nome : '— sem pasto —',
    lote: l.nome,
    qtd: animaisPorLote[l.id] || 0,
  })).sort((a, b) => b.qtd - a.qtd);

  const animaisSemLote = animaisAtivos.filter(a => !a.lote_id).length;

  content.innerHTML = `
    <h1 class="text-xl font-bold mb-4">Painel geral</h1>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('🐄', animaisAtivos.length, 'Animais ativos')}
      ${statCard('🗂️', totalLotes, 'Lotes ativos')}
      ${statCard('🌱', totalPastos, 'Pastos ativos')}
      ${statCard('🍼', partosProximos.length, 'Partos previstos (30 dias)')}
      ${statCard('📈', taxa.pct.toFixed(0) + '%', 'Taxa de prenhez (90 dias)')}
      ${statCard('💉', tratamentos, 'Animais em tratamento')}
      ${statCard('💰', fmtMoney(totalCustosMes), 'Custos deste mês')}
      ${statCard('❓', animaisSemLote, 'Animais sem lote definido')}
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Rebanho por pasto / lote</h2>
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Pasto</th><th>Lote</th><th class="text-right">Qtd.</th></tr></thead>
          <tbody>
            ${linhasPastoLote.map(l => `<tr class="border-b last:border-0"><td class="py-1">${escapeHtml(l.pasto)}</td><td>${escapeHtml(l.lote)}</td><td class="text-right font-medium">${l.qtd}</td></tr>`).join('') || `<tr><td colspan="3" class="text-gray-400 py-3 text-center">Nenhum lote cadastrado ainda</td></tr>`}
          </tbody>
        </table>
        </div>
      </div>

      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Próximos partos previstos</h2>
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Animal</th><th>Data prevista</th><th class="text-right">Dias</th></tr></thead>
          <tbody>
            ${partosProximos.slice(0, 10).map(g => `<tr class="border-b last:border-0"><td class="py-1"><a class="text-brand-700 hover:underline" href="#animal/${g.animal_id}">Ver animal</a></td><td>${fmtDate(g.data_prevista_parto)}</td><td class="text-right ${g.dias_restantes < 0 ? 'text-red-600 font-medium' : ''}">${g.dias_restantes}</td></tr>`).join('') || `<tr><td colspan="3" class="text-gray-400 py-3 text-center">Nenhum parto previsto no período</td></tr>`}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  `;
}

function statCard(icon, value, label) {
  return `<div class="bg-white border rounded-lg p-4">
    <div class="text-2xl">${icon}</div>
    <div class="text-xl font-bold mt-1">${value}</div>
    <div class="text-xs text-gray-500">${label}</div>
  </div>`;
}

// ------------------------------------------------------------
// PÁGINA: REBANHO (ANIMAIS)
// ------------------------------------------------------------
const CATEGORIAS_ANIMAL = ['Bezerro', 'Bezerra', 'Novilho', 'Novilha', 'Vaca', 'Touro', 'Boi', 'Garrote'];

let animaisFiltro = { busca: '', status: 'ativo', lote_id: '' };

async function pageAnimais() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();

  const filters = [];
  if (animaisFiltro.status) filters.push({ col: 'status', val: animaisFiltro.status });
  if (animaisFiltro.lote_id) filters.push({ col: 'lote_id', val: animaisFiltro.lote_id });
  let animais = await dbSelect('animais', {
    select: '*, lote:lotes(id,nome,pasto:pastos(id,nome))',
    filters,
    order: { col: 'identificacao' },
  });
  if (animaisFiltro.busca) {
    const b = animaisFiltro.busca.toLowerCase();
    animais = animais.filter(a => (a.identificacao || '').toLowerCase().includes(b) || (a.nome || '').toLowerCase().includes(b));
  }

  const idsAnimais = animais.map(a => a.id);
  const pesagensPorAnimal = {};
  if (idsAnimais.length) {
    const todasPesagens = await dbSelect('pesagens', {
      select: 'id,animal_id,peso,data',
      filters: [{ col: 'animal_id', op: 'in', val: idsAnimais }],
      order: { col: 'data', asc: false },
    });
    todasPesagens.forEach(p => {
      (pesagensPorAnimal[p.animal_id] = pesagensPorAnimal[p.animal_id] || []).push(p);
    });
  }

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Rebanho</h1>
      <div class="flex gap-2">
        <button id="btnImportarAnimais" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📥 Importar CSV</button>
        <button id="btnImportarPesagens" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">⚖️ Importar pesagens</button>
        <button id="btnCorrigirSexo" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">🔧 Corrigir sexo/categoria em lote</button>
        <button id="btnNovoAnimal" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo animal</button>
      </div>
    </div>

    <div class="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-end">
      <div>
        <label class="text-xs font-medium text-gray-500">Buscar (brinco/nome)</label>
        <input id="fBusca" value="${escapeHtml(animaisFiltro.busca)}" class="mt-1 border rounded-md px-3 py-1.5 text-sm">
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Status</label>
        <select id="fStatus" class="mt-1 border rounded-md px-3 py-1.5 text-sm bg-white">
          <option value="ativo" ${animaisFiltro.status === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="" ${animaisFiltro.status === '' ? 'selected' : ''}>Todos</option>
          <option value="vendido" ${animaisFiltro.status === 'vendido' ? 'selected' : ''}>Vendido</option>
          <option value="morto" ${animaisFiltro.status === 'morto' ? 'selected' : ''}>Morto</option>
          <option value="descartado" ${animaisFiltro.status === 'descartado' ? 'selected' : ''}>Descartado</option>
        </select>
      </div>
      <div>
        <label class="text-xs font-medium text-gray-500">Lote</label>
        <select id="fLote" class="mt-1 border rounded-md px-3 py-1.5 text-sm bg-white">${loteOptions(animaisFiltro.lote_id, false)}</select>
      </div>
      <button id="btnFiltrar" class="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1.5 rounded-md">Filtrar</button>
      <span class="text-sm text-gray-400 ml-auto">${animais.length} animal(is)</span>
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b">
          <th class="py-2 px-3">Brinco</th><th>Nome</th><th>Sexo</th><th>Categoria</th><th>Lote</th><th>Pasto</th><th>Peso</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          ${animais.map(a => `
            <tr class="border-b last:border-0 hover:bg-gray-50">
              <td class="py-2 px-3"><a href="#animal/${a.id}" class="text-brand-700 font-medium hover:underline">${escapeHtml(a.identificacao)}</a></td>
              <td>${escapeHtml(a.nome || '-')}</td>
              <td>${a.sexo}</td>
              <td>${escapeHtml(a.categoria)}</td>
              <td>${a.lote ? escapeHtml(a.lote.nome) : '-'}</td>
              <td>${a.lote && a.lote.pasto ? escapeHtml(a.lote.pasto.nome) : '-'}</td>
              <td class="whitespace-nowrap">${comparativoPesoBadgeHtml(comparativoPeso(pesagensPorAnimal[a.id] || (a.peso_atual ? [{ peso: a.peso_atual, data: a.peso_atual_data || '' }] : [])))}</td>
              <td><span class="px-2 py-0.5 rounded-full text-xs ${statusBadge(a.status)}">${a.status}</span></td>
              <td class="text-right px-3"><button data-id="${a.id}" class="btnEditarAnimal text-gray-400 hover:text-brand-700">✏️</button></td>
            </tr>`).join('') || `<tr><td colspan="9" class="text-center text-gray-400 py-6">Nenhum animal encontrado</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovoAnimal').onclick = () => formAnimal();
  document.getElementById('btnImportarAnimais').onclick = () => importarAnimaisCSV();
  document.getElementById('btnImportarPesagens').onclick = () => importarPesagensCSV();
  document.getElementById('btnCorrigirSexo').onclick = () => corrigirSexoCategoriaCSV();
  document.getElementById('btnFiltrar').onclick = () => {
    animaisFiltro.busca = document.getElementById('fBusca').value;
    animaisFiltro.status = document.getElementById('fStatus').value;
    animaisFiltro.lote_id = document.getElementById('fLote').value;
    pageAnimais();
  };
  document.querySelectorAll('.btnEditarAnimal').forEach(b => {
    b.onclick = () => {
      const a = animais.find(x => x.id === b.dataset.id);
      formAnimal(a);
    };
  });
}

function statusBadge(status) {
  const map = { ativo: 'bg-green-100 text-green-700', vendido: 'bg-blue-100 text-blue-700', morto: 'bg-red-100 text-red-700', descartado: 'bg-gray-200 text-gray-600' };
  return map[status] || 'bg-gray-100 text-gray-600';
}

function formAnimal(animal = null) {
  const isEdit = !!animal;
  showModal(isEdit ? 'Editar animal' : 'Novo animal', `
    <form id="formAnimal" class="grid grid-cols-2 gap-x-3">
      ${fld('Brinco / identificação *', inp('identificacao', animal?.identificacao, 'text', 'required'))}
      ${fld('Nome', inp('nome', animal?.nome))}
      ${fld('Sexo *', sel('sexo', [{ value: 'F', label: 'Fêmea' }, { value: 'M', label: 'Macho' }], animal?.sexo || 'F', 'required'))}
      ${fld('Categoria *', sel('categoria', CATEGORIAS_ANIMAL.map(c => ({ value: c, label: c })), animal?.categoria || 'Bezerra', 'required'))}
      ${fld('Raça', inp('raca', animal?.raca))}
      ${fld('Data de nascimento', inp('data_nascimento', animal?.data_nascimento, 'date'))}
      ${fld('Peso atual (kg)', inp('peso_atual', animal?.peso_atual, 'number', 'step="0.1"'))}
      ${fld('Lote', sel('lote_id', [], animal?.lote_id).replace('<select', '<select id="selLoteAnimal"'))}
      ${fld('Observações', txt('observacoes', animal?.observacoes), 'col-span-2')}
      <div class="col-span-2 flex justify-end gap-2 mt-2">
        ${isEdit ? `<button type="button" id="btnExcluirAnimal" class="text-red-600 text-sm mr-auto">Excluir</button>` : ''}
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('selLoteAnimal').innerHTML = loteOptions(animal?.lote_id, false);
  document.getElementById('btnCancelar').onclick = closeModal;
  if (isEdit) {
    document.getElementById('btnExcluirAnimal').onclick = async () => {
      if (!confirmAction('Excluir este animal permanentemente? Esta ação não pode ser desfeita.')) return;
      await dbDelete('animais', animal.id);
      toast('Animal excluído', 'success');
      closeModal();
      pageAnimais();
    };
  }
  document.getElementById('formAnimal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    if (obj.peso_atual) { obj.peso_atual = Number(obj.peso_atual); obj.peso_atual_data = todayISO(); }
    try {
      if (isEdit) {
        await dbUpdate('animais', animal.id, obj);
        toast('Animal atualizado', 'success');
      } else {
        obj.status = 'ativo';
        await dbInsert('animais', obj);
        toast('Animal cadastrado', 'success');
      }
      closeModal();
      pageAnimais();
    } catch (err) { /* toast já mostrado */ }
  });
}

// ------------------------------------------------------------
// PÁGINA: DETALHE DO ANIMAL
// ------------------------------------------------------------
async function pageAnimalDetalhe(id) {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();

  const [animal, eventos, sanitarios, baixasList, pesagens] = await Promise.all([
    dbSelectOne('animais', id, '*, lote:lotes(id,nome,pasto:pastos(id,nome)), mae:mae_id(id,identificacao)'),
    dbSelect('eventos_reprodutivos', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
    dbSelect('registros_sanitarios', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
    dbSelect('baixas', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
    dbSelect('pesagens', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
  ]);

  if (!animal) {
    content.innerHTML = `<p class="text-gray-500">Animal não encontrado.</p><a href="#animais" class="text-brand-700 hover:underline">Voltar</a>`;
    return;
  }

  const compPrincipal = comparativoPeso(pesagens.length ? pesagens : (animal.peso_atual ? [{ peso: animal.peso_atual, data: animal.peso_atual_data || '' }] : []));

  content.innerHTML = `
    <a href="#animais" class="text-sm text-brand-700 hover:underline">&larr; Voltar ao rebanho</a>
    <div class="flex flex-wrap justify-between items-start gap-2 mt-2 mb-4">
      <div>
        <h1 class="text-xl font-bold">${escapeHtml(animal.identificacao)} ${animal.nome ? '· ' + escapeHtml(animal.nome) : ''}</h1>
        <p class="text-sm text-gray-500">${animal.sexo === 'F' ? 'Fêmea' : 'Macho'} · ${escapeHtml(animal.categoria)} ${animal.raca ? '· ' + escapeHtml(animal.raca) : ''} · ${idade(animal.data_nascimento)}</p>
      </div>
      <span class="px-2 py-1 rounded-full text-xs ${statusBadge(animal.status)}">${animal.status}</span>
    </div>

    <div class="grid md:grid-cols-3 gap-4 mb-6">
      <div class="bg-white border rounded-lg p-4">
        <div class="text-xs text-gray-500">Lote atual</div>
        <div class="font-medium">${animal.lote ? escapeHtml(animal.lote.nome) : '—'}</div>
      </div>
      <div class="bg-white border rounded-lg p-4">
        <div class="text-xs text-gray-500">Pasto atual</div>
        <div class="font-medium">${animal.lote && animal.lote.pasto ? escapeHtml(animal.lote.pasto.nome) : '—'}</div>
      </div>
      <div class="bg-white border rounded-lg p-4">
        <div class="text-xs text-gray-500">Peso atual</div>
        <div class="font-medium">${comparativoPesoBadgeHtml(compPrincipal)}</div>
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Histórico reprodutivo</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Data</th><th>Evento</th><th>Resultado</th></tr></thead>
          <tbody>${eventos.map(e => `<tr class="border-b last:border-0"><td class="py-1">${fmtDate(e.data)}</td><td>${labelEvento(e.tipo_evento)}</td><td>${e.resultado || (e.data_prevista_parto ? 'Prev. parto: ' + fmtDate(e.data_prevista_parto) : '-')}</td></tr>`).join('') || `<tr><td colspan="3" class="text-gray-400 text-center py-3">Sem registros</td></tr>`}</tbody>
        </table>
      </div>
      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Histórico sanitário</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Data</th><th>Tipo</th><th>Nome</th><th>Status</th></tr></thead>
          <tbody>${sanitarios.map(s => `<tr class="border-b last:border-0"><td class="py-1">${fmtDate(s.data)}</td><td>${s.tipo}</td><td>${escapeHtml(s.nome)}</td><td>${s.status || '-'}</td></tr>`).join('') || `<tr><td colspan="4" class="text-gray-400 text-center py-3">Sem registros</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <div class="bg-white border rounded-lg p-4 mt-6">
      <div class="flex justify-between items-center mb-3">
        <h2 class="font-semibold">Histórico de pesagens</h2>
        <button id="btnRegistrarPesagem" class="bg-white border text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50">⚖️ + Registrar pesagem</button>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Data</th><th>Peso</th><th>Variação</th><th>GMD desde a pesagem anterior</th></tr></thead>
        <tbody>${pesagens.map((p, i) => {
          const c = comparativoPeso(pesagens.slice(i));
          const varTxt = c && c.anterior ? `<span class="${c.diferenca > 0 ? 'text-green-600' : (c.diferenca < 0 ? 'text-red-600' : 'text-gray-500')} font-medium">${c.diferenca > 0 ? '▲' : (c.diferenca < 0 ? '▼' : '▬')} ${c.diferenca > 0 ? '+' : ''}${c.diferenca} kg</span>` : '<span class="text-gray-300">—</span>';
          const gmdTxt = c && c.gmd !== null ? `${c.gmd >= 0 ? '+' : ''}${c.gmd} kg/dia` : '—';
          return `<tr class="border-b last:border-0"><td class="py-1">${fmtDate(p.data)}</td><td>${p.peso} kg</td><td>${varTxt}</td><td class="text-gray-500">${gmdTxt}</td></tr>`;
        }).join('') || `<tr><td colspan="4" class="text-gray-400 text-center py-3">Nenhuma pesagem registrada</td></tr>`}</tbody>
      </table>
    </div>

    ${baixasList.length ? `
    <div class="bg-white border rounded-lg p-4 mt-6">
      <h2 class="font-semibold mb-3">Baixa registrada</h2>
      ${baixasList.map(b => `<p class="text-sm">${b.tipo} em ${fmtDate(b.data)} — ${escapeHtml(b.motivo || '')} ${b.valor ? '· ' + fmtMoney(b.valor) : ''}</p>`).join('')}
    </div>` : ''}
  `;

  document.getElementById('btnRegistrarPesagem').onclick = () => formPesagem(animal);
}

function formPesagem(animal) {
  showModal('Registrar pesagem', `
    <form id="formPesagem" class="grid grid-cols-2 gap-x-3">
      ${fld('Peso (kg) *', inp('peso', '', 'number', 'step="0.1" required'))}
      ${fld('Data *', inp('data', todayISO(), 'date', 'required'))}
      ${fld('Observações', txt('observacoes', ''), 'col-span-2')}
      <div class="col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelarPesagem" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelarPesagem').onclick = closeModal;
  document.getElementById('formPesagem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.peso = Number(obj.peso);
    obj.animal_id = animal.id;
    try {
      await dbInsert('pesagens', obj);
      if (!animal.peso_atual_data || obj.data >= animal.peso_atual_data) {
        await dbUpdate('animais', animal.id, { peso_atual: obj.peso, peso_atual_data: obj.data });
      }
      toast('Pesagem registrada', 'success');
      closeModal();
      pageAnimalDetalhe(animal.id);
    } catch (err) { /* toast já mostrado */ }
  });
}

function labelEvento(tipo) {
  const map = {
    inseminacao: 'Inseminação artificial', monta_natural: 'Monta natural',
    diagnostico_gestacao: 'Diagnóstico de gestação', parto: 'Parto',
    secagem: 'Secagem', descarte_reprodutivo: 'Descarte reprodutivo', aborto: 'Aborto',
  };
  return map[tipo] || tipo;
}

// ------------------------------------------------------------
// PÁGINA: LOTES
// ------------------------------------------------------------
async function pageLotes() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  const contagens = await dbSelect('animais', { select: 'id,lote_id', filters: [{ col: 'status', val: 'ativo' }] });
  const porLote = {};
  contagens.forEach(a => { if (a.lote_id) porLote[a.lote_id] = (porLote[a.lote_id] || 0) + 1; });

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Lotes</h1>
      <button id="btnNovoLote" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo lote</button>
    </div>
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Nome</th><th>Finalidade</th><th>Pasto atual</th><th class="text-right">Animais</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${lotesCache.map(l => `
            <tr class="border-b last:border-0 hover:bg-gray-50">
              <td class="py-2 px-3 font-medium">${escapeHtml(l.nome)}</td>
              <td>${escapeHtml(l.finalidade || '-')}</td>
              <td>${l.pasto ? escapeHtml(l.pasto.nome) : '-'}</td>
              <td class="text-right">${porLote[l.id] || 0}</td>
              <td><span class="px-2 py-0.5 rounded-full text-xs ${l.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">${l.ativo ? 'ativo' : 'inativo'}</span></td>
              <td class="text-right px-3"><button data-id="${l.id}" class="btnEditarLote text-gray-400 hover:text-brand-700">✏️</button></td>
            </tr>`).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhum lote cadastrado</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('btnNovoLote').onclick = () => formLote();
  document.querySelectorAll('.btnEditarLote').forEach(b => {
    b.onclick = () => formLote(lotesCache.find(x => x.id === b.dataset.id));
  });
}

function formLote(lote = null) {
  const isEdit = !!lote;
  showModal(isEdit ? 'Editar lote' : 'Novo lote', `
    <form id="formLote">
      ${fld('Nome *', inp('nome', lote?.nome, 'text', 'required'))}
      ${fld('Finalidade', inp('finalidade', lote?.finalidade, 'text', 'placeholder="cria, recria, engorda, leite..."'))}
      ${fld('Pasto atual', sel('pasto_id', [], lote?.pasto_id).replace('<select', '<select id="selPastoLote"'))}
      ${fld('Status', sel('ativo', [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }], lote ? String(lote.ativo) : 'true'))}
      ${fld('Observações', txt('observacoes', lote?.observacoes))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('selPastoLote').innerHTML = pastoOptions(lote?.pasto_id);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formLote').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.ativo = obj.ativo === 'true';
    try {
      if (isEdit) await dbUpdate('lotes', lote.id, obj);
      else await dbInsert('lotes', obj);
      toast('Lote salvo', 'success');
      closeModal();
      await refreshCaches();
      pageLotes();
    } catch (err) {}
  });
}

// ------------------------------------------------------------
// PÁGINA: PASTOS
// ------------------------------------------------------------
async function pagePastos() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  const contagens = await dbSelect('animais', { select: 'id,lote_id', filters: [{ col: 'status', val: 'ativo' }] });
  const porLote = {};
  contagens.forEach(a => { if (a.lote_id) porLote[a.lote_id] = (porLote[a.lote_id] || 0) + 1; });

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Pastos</h1>
      <div class="flex gap-2">
        <button id="btnImportarPastos" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📥 Importar CSV</button>
        <button id="btnNovoPasto" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo pasto</button>
      </div>
    </div>
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${pastosCache.map(p => {
        const lotesAqui = lotesCache.filter(l => l.pasto_id === p.id);
        const qtd = lotesAqui.reduce((s, l) => s + (porLote[l.id] || 0), 0);
        return `<div class="bg-white border rounded-lg p-4">
          <div class="flex justify-between items-start">
            <h3 class="font-semibold">${escapeHtml(p.nome)}</h3>
            <button data-id="${p.id}" class="btnEditarPasto text-gray-400 hover:text-brand-700">✏️</button>
          </div>
          <p class="text-xs text-gray-500 mt-1">${p.area_ha ? p.area_ha + ' ha' : ''} ${p.capacidade_ua ? '· cap. ' + p.capacidade_ua + ' UA' : ''}</p>
          <div class="mt-3 text-sm">
            <div><span class="font-medium">${qtd}</span> animais neste pasto</div>
            <div class="text-gray-500 text-xs mt-1">${lotesAqui.map(l => escapeHtml(l.nome)).join(', ') || 'sem lotes'}</div>
          </div>
        </div>`;
      }).join('') || `<p class="text-gray-400 col-span-full text-center py-6">Nenhum pasto cadastrado</p>`}
    </div>
  `;
  document.getElementById('btnNovoPasto').onclick = () => formPasto();
  document.getElementById('btnImportarPastos').onclick = () => importarPastosCSV();
  document.querySelectorAll('.btnEditarPasto').forEach(b => {
    b.onclick = () => formPasto(pastosCache.find(x => x.id === b.dataset.id));
  });
}

function formPasto(pasto = null) {
  const isEdit = !!pasto;
  showModal(isEdit ? 'Editar pasto' : 'Novo pasto', `
    <form id="formPasto">
      ${fld('Nome *', inp('nome', pasto?.nome, 'text', 'required'))}
      ${fld('Área (ha)', inp('area_ha', pasto?.area_ha, 'number', 'step="0.01"'))}
      ${fld('Capacidade (UA)', inp('capacidade_ua', pasto?.capacidade_ua, 'number', 'step="0.1"'))}
      ${fld('Tipo de pastagem', inp('tipo_pastagem', pasto?.tipo_pastagem))}
      ${fld('Status', sel('ativo', [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }], pasto ? String(pasto.ativo) : 'true'))}
      ${fld('Observações', txt('observacoes', pasto?.observacoes))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formPasto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.ativo = obj.ativo === 'true';
    try {
      if (isEdit) await dbUpdate('pastos', pasto.id, obj);
      else await dbInsert('pastos', obj);
      toast('Pasto salvo', 'success');
      closeModal();
      await refreshCaches();
      pagePastos();
    } catch (err) {}
  });
}

// ------------------------------------------------------------
// PÁGINA: MOVIMENTAÇÃO
// ------------------------------------------------------------
async function pageMovimentacoes() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  const historico = await dbSelect('movimentacoes', {
    select: '*, lote:lotes(nome), origem:pasto_origem_id(nome), destino:pasto_destino_id(nome)',
    order: { col: 'data', asc: false },
    limit: 100,
  });

  content.innerHTML = `
    <h1 class="text-xl font-bold mb-4">Movimentação entre pastos</h1>

    <div class="bg-white border rounded-lg p-4 mb-6">
      <h2 class="font-semibold mb-3">Registrar movimentação de lote</h2>
      <form id="formMovimentacao" class="grid md:grid-cols-2 gap-x-4">
        ${fld('Lote *', sel('lote_id', [], '', 'required').replace('<select', '<select id="selLoteMov"'))}
        ${fld('Pasto de destino *', sel('pasto_destino_id', [], '', 'required').replace('<select', '<select id="selPastoDestino"'))}
        ${fld('Data *', inp('data', todayISO(), 'date', 'required'))}
        ${fld('Responsável', inp('responsavel'))}
        ${fld('Motivo', inp('motivo', '', 'text', 'placeholder="rotação, pastejo, reforma..."'))}
        ${fld('Observações', txt('observacoes'), 'md:col-span-2')}
        <div class="md:col-span-2 flex justify-end">
          <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Registrar movimentação</button>
        </div>
      </form>
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <h2 class="font-semibold px-4 pt-4">Histórico</h2>
      <table class="w-full text-sm mt-2">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Lote</th><th>Origem</th><th>Destino</th><th class="text-right">Qtd.</th><th>Responsável</th></tr></thead>
        <tbody>
          ${historico.map(m => `<tr class="border-b last:border-0">
            <td class="py-2 px-3">${fmtDate(m.data)}</td>
            <td>${m.lote ? escapeHtml(m.lote.nome) : '-'}</td>
            <td>${m.origem ? escapeHtml(m.origem.nome) : '-'}</td>
            <td>${m.destino ? escapeHtml(m.destino.nome) : '-'}</td>
            <td class="text-right">${m.quantidade_animais ?? '-'}</td>
            <td>${escapeHtml(m.responsavel || '-')}</td>
          </tr>`).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhuma movimentação registrada</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('selLoteMov').innerHTML = loteOptions('', true);
  document.getElementById('selPastoDestino').innerHTML = pastoOptions('');

  document.getElementById('formMovimentacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    const lote = lotesCache.find(l => l.id === obj.lote_id);
    if (!lote) { toast('Selecione um lote', 'error'); return; }
    if (lote.pasto_id === obj.pasto_destino_id) { toast('O lote já está nesse pasto', 'error'); return; }
    const qtd = await dbCount('animais', [{ col: 'lote_id', val: lote.id }, { col: 'status', val: 'ativo' }]);
    try {
      await dbInsert('movimentacoes', {
        lote_id: lote.id,
        pasto_origem_id: lote.pasto_id || null,
        pasto_destino_id: obj.pasto_destino_id,
        data: obj.data,
        quantidade_animais: qtd,
        responsavel: obj.responsavel,
        motivo: obj.motivo,
        observacoes: obj.observacoes,
      });
      await dbUpdate('lotes', lote.id, { pasto_id: obj.pasto_destino_id });
      toast('Movimentação registrada', 'success');
      await refreshCaches();
      pageMovimentacoes();
    } catch (err) {}
  });
}

// ------------------------------------------------------------
// PÁGINA: REPRODUÇÃO
// ------------------------------------------------------------
let reproducaoTab = 'eventos';
let protocolosReprodutivosCache = [];
let femeasCache = [];

function tabsBar(tabs, active, onClickAttr) {
  return `<div class="flex flex-wrap gap-2 mb-4">${tabs.map(t => `
    <button data-tab="${t.key}" class="tabBtn px-3 py-1.5 rounded-md text-sm font-medium ${active === t.key ? 'bg-brand-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}">${t.label}</button>
  `).join('')}</div>`;
}

async function pageReproducao() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  const [protocolos, femeas] = await Promise.all([
    dbSelect('protocolos_reprodutivos', { order: { col: 'nome' } }),
    dbSelect('animais', { select: 'id,identificacao,nome', filters: [{ col: 'sexo', val: 'F' }, { col: 'status', val: 'ativo' }], order: { col: 'identificacao' } }),
  ]);
  protocolosReprodutivosCache = protocolos;
  femeasCache = femeas;

  content.innerHTML = `<h1 class="text-xl font-bold mb-4">Reprodução</h1><div id="reproTabs"></div><div id="reproContent"></div>`;
  document.getElementById('reproTabs').innerHTML = tabsBar([
    { key: 'eventos', label: 'Eventos' },
    { key: 'protocolos', label: 'Protocolos' },
    { key: 'partos', label: 'Partos previstos' },
    { key: 'taxa', label: 'Taxa de prenhez' },
  ], reproducaoTab);
  document.querySelectorAll('#reproTabs .tabBtn').forEach(b => {
    b.onclick = () => { reproducaoTab = b.dataset.tab; pageReproducao(); };
  });

  if (reproducaoTab === 'eventos') await renderReproEventos();
  else if (reproducaoTab === 'protocolos') await renderReproProtocolos();
  else if (reproducaoTab === 'partos') await renderReproPartos();
  else if (reproducaoTab === 'taxa') await renderReproTaxa();
}

async function renderReproEventos() {
  const eventos = await dbSelect('eventos_reprodutivos', {
    select: '*, animal:animal_id(identificacao,nome)',
    order: { col: 'data', asc: false }, limit: 150,
  });
  document.getElementById('reproContent').innerHTML = `
    <div class="flex flex-wrap justify-end gap-2 mb-3">
      <button id="btnImportarPrevisaoPartos" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📥 Importar previsão de partos</button>
      <button id="btnNovoEvento" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Registrar evento</button>
    </div>
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Animal</th><th>Evento</th><th>Resultado</th><th>Prev. parto</th></tr></thead>
        <tbody>${eventos.map(e => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(e.data)}</td>
          <td><a class="text-brand-700 hover:underline" href="#animal/${e.animal_id}">${escapeHtml(e.animal?.identificacao || '')}</a></td>
          <td>${labelEvento(e.tipo_evento)}</td>
          <td>${e.resultado || '-'}</td>
          <td>${e.data_prevista_parto ? fmtDate(e.data_prevista_parto) : '-'}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="text-center text-gray-400 py-6">Nenhum evento registrado</td></tr>`}</tbody>
      </table>
    </div>
  `;
  document.getElementById('btnNovoEvento').onclick = () => formEventoReprodutivo();
  document.getElementById('btnImportarPrevisaoPartos').onclick = () => importarPrevisaoPartosCSV();
}

function importarPrevisaoPartosCSV() {
  formImportarCSV({
    titulo: 'Importar previsão de partos (planilha de prenhez)',
    instrucoes: 'Cada linha vira um evento de "Inseminação artificial" (ou monta) já com a previsão de parto preenchida. Só funciona pra animais já cadastrados no Rebanho. Casamento por brinco é opcional — se o brinco cadastrado no sistema for outra coisa (ex.: número do chip) e não bater, mapeie a coluna do RGN/RGD no campo "Nome / RGN / RGD" abaixo, que é por aí que eu vou casar com o animal.',
    campos: [
      { key: 'identificacao', label: 'Brinco do animal (opcional)' },
      { key: 'nome', label: 'Nome / RGN / RGD do animal (como está cadastrado no Rebanho)', obrigatorio: true },
      { key: 'touro', label: 'Touro / sêmen utilizado' },
      { key: 'data_ia', label: 'Data da I.A. / cobertura', obrigatorio: true },
      { key: 'data_prevista_parto', label: 'Data prevista de parto', obrigatorio: true },
    ],
    onImportar: async (rows, mapping, fixos) => {
      const get = (r, k) => (mapping[k] !== undefined ? (r[mapping[k]] || '').trim() : (fixos[k] || ''));
      const porIdentificacao = {};
      const porNome = {};
      femeasCache.forEach(f => {
        porIdentificacao[(f.identificacao || '').trim().toLowerCase()] = f;
        if (f.nome) porNome[f.nome.trim().toLowerCase()] = f;
      });

      const registros = [];
      const naoEncontrados = [];
      const semData = [];
      rows.forEach(r => {
        const identificacao = get(r, 'identificacao');
        const nome = get(r, 'nome');
        if (!identificacao && !nome) return;
        const dataIA = parseDataFlexivel(get(r, 'data_ia'));
        const dataPrevista = parseDataFlexivel(get(r, 'data_prevista_parto'));
        if (!dataIA || !dataPrevista) { semData.push(identificacao || nome); return; }
        let animal = identificacao ? porIdentificacao[identificacao.toLowerCase()] : null;
        if (!animal && nome) animal = porNome[nome.toLowerCase()];
        if (!animal) { naoEncontrados.push(identificacao || nome); return; }
        registros.push({
          animal_id: animal.id,
          tipo_evento: 'inseminacao',
          data: dataIA,
          touro_semen: get(r, 'touro') || null,
          data_prevista_parto: dataPrevista,
        });
        // Nota: por enquanto NÃO atualizamos o campo "nome" do animal aqui
        // (o valor mapeado nesse importador é o RGN/RGD usado só pra
        // localizar o animal, não necessariamente um nome novo pra gravar).
      });

      if (registros.length) {
        await inserirEmLotes('eventos_reprodutivos', registros);
        toast(`${registros.length} previsão(ões) de parto importada(s)${naoEncontrados.length ? `, ${naoEncontrados.length} animal(is) não encontrado(s)` : ''}${semData.length ? `, ${semData.length} sem data válida` : ''}`, naoEncontrados.length || semData.length ? 'error' : 'success');
      } else {
        toast('Nenhuma linha pôde ser importada — veja o detalhe abaixo do que travou', 'error');
      }
      closeModal();
      if (registros.length) pageReproducao();

      if (naoEncontrados.length || semData.length) {
        showModal('Detalhes da importação', `
          ${naoEncontrados.length ? `
            <p class="text-sm text-gray-600 mb-2"><strong>${naoEncontrados.length} animal(is)</strong> da planilha não bateram com nenhuma fêmea ativa cadastrada no Rebanho (nem pelo brinco, nem pelo nome). Confira se não há erro de digitação, se o brinco no sistema está escrito exatamente igual (ex.: espaços, maiúsculas), ou se o animal ainda não foi cadastrado.</p>
            <div class="max-h-48 overflow-y-auto border rounded-md p-2 text-sm font-mono mb-3">${naoEncontrados.map(id => escapeHtml(id)).join('<br>')}</div>
          ` : ''}
          ${semData.length ? `
            <p class="text-sm text-gray-600 mb-2"><strong>${semData.length} linha(s)</strong> tinham data de I.A. ou previsão de parto que não consegui interpretar. Confira se o mapeamento das colunas de data está certo, e se as datas estão em formato dd/mm/aaaa.</p>
            <div class="max-h-48 overflow-y-auto border rounded-md p-2 text-sm font-mono mb-3">${semData.map(id => escapeHtml(id)).join('<br>')}</div>
          ` : ''}
          <div class="flex justify-end mt-3"><button type="button" id="btnFecharNaoEncontrados" class="px-4 py-2 text-sm rounded-md border">Fechar</button></div>
        `);
        document.getElementById('btnFecharNaoEncontrados').onclick = () => { closeModal(); if (!registros.length) pageReproducao(); };
      }
    },
  });
}

function formEventoReprodutivo() {
  showModal('Registrar evento reprodutivo', `
    <form id="formEvento" class="grid md:grid-cols-2 gap-x-3">
      ${fld('Animal (fêmea) *', sel('animal_id', femeasCache.map(f => ({ value: f.id, label: f.identificacao + (f.nome ? ' - ' + f.nome : '') })), '', 'required'))}
      ${fld('Tipo de evento *', sel('tipo_evento', [
        { value: 'inseminacao', label: 'Inseminação artificial' },
        { value: 'monta_natural', label: 'Monta natural' },
        { value: 'diagnostico_gestacao', label: 'Diagnóstico de gestação' },
        { value: 'parto', label: 'Parto' },
        { value: 'secagem', label: 'Secagem' },
        { value: 'descarte_reprodutivo', label: 'Descarte reprodutivo' },
        { value: 'aborto', label: 'Aborto' },
      ], '', 'required'))}
      ${fld('Data *', inp('data', todayISO(), 'date', 'required'))}
      ${fld('Protocolo reprodutivo', sel('protocolo_id', [{ value: '', label: '— nenhum —' }, ...protocolosReprodutivosCache.map(p => ({ value: p.id, label: p.nome }))], ''))}

      <div id="campoResultado" class="hidden col-span-2">${fld('Resultado', sel('resultado', [{ value: 'pendente', label: 'Pendente' }, { value: 'positivo', label: 'Positivo' }, { value: 'negativo', label: 'Negativo' }], 'pendente'))}</div>
      <div id="campoTouro" class="hidden col-span-2">${fld('Touro / sêmen utilizado', inp('touro_semen'))}</div>
      <div id="campoPrevisao" class="hidden col-span-2">${fld('Data prevista de parto (calculada automaticamente, ajustável)', inp('data_prevista_parto', '', 'date'))}</div>
      <div id="camposParto" class="hidden col-span-2 grid grid-cols-2 gap-x-3">
        ${fld('Peso do bezerro (kg)', inp('peso_bezerro', '', 'number', 'step="0.1"'))}
        ${fld('Sexo do bezerro', sel('sexo_bezerro', [{ value: '', label: '—' }, { value: 'M', label: 'Macho' }, { value: 'F', label: 'Fêmea' }], ''))}
        ${fld('Dificuldade de parto', sel('dificuldade_parto', [{ value: 'normal', label: 'Normal' }, { value: 'assistido', label: 'Assistido' }, { value: 'dificil', label: 'Difícil / cesária' }], 'normal'))}
        <label class="flex items-center gap-2 mt-6 text-sm"><input type="checkbox" name="cadastrar_bezerro" value="1" checked> Cadastrar bezerro automaticamente no rebanho</label>
      </div>

      ${fld('Observações', txt('observacoes'), 'col-span-2')}
      <div class="col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `, 'max-w-2xl');

  document.getElementById('btnCancelar').onclick = closeModal;
  const form = document.getElementById('formEvento');
  const tipoSelect = form.querySelector('[name=tipo_evento]');
  const dataInput = form.querySelector('[name=data]');

  function toggleCampos() {
    const tipo = tipoSelect.value;
    document.getElementById('campoResultado').classList.toggle('hidden', tipo !== 'diagnostico_gestacao');
    document.getElementById('campoTouro').classList.toggle('hidden', !(tipo === 'inseminacao' || tipo === 'monta_natural'));
    document.getElementById('campoPrevisao').classList.toggle('hidden', !(tipo === 'inseminacao' || tipo === 'monta_natural'));
    document.getElementById('camposParto').classList.toggle('hidden', tipo !== 'parto');
    if (tipo === 'inseminacao' || tipo === 'monta_natural') {
      form.querySelector('[name=data_prevista_parto]').value = addDaysISO(dataInput.value || todayISO(), GESTACAO_DIAS);
    }
  }
  tipoSelect.addEventListener('change', toggleCampos);
  dataInput.addEventListener('change', toggleCampos);
  toggleCampos();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(form);
    const cadastrarBezerro = obj.cadastrar_bezerro === '1';
    delete obj.cadastrar_bezerro;
    if (obj.peso_bezerro) obj.peso_bezerro = Number(obj.peso_bezerro);
    try {
      const evento = await dbInsert('eventos_reprodutivos', obj);
      if (obj.tipo_evento === 'parto' && cadastrarBezerro) {
        const mae = femeasCache.find(f => f.id === obj.animal_id);
        const maeCompleta = await dbSelectOne('animais', obj.animal_id, 'lote_id');
        const bezerro = await dbInsert('animais', {
          identificacao: (mae?.identificacao || 'MAE') + '-BZ-' + todayISO().slice(2, 10).replaceAll('-', ''),
          sexo: obj.sexo_bezerro || 'F',
          categoria: obj.sexo_bezerro === 'M' ? 'Bezerro' : 'Bezerra',
          data_nascimento: obj.data,
          peso_atual: obj.peso_bezerro || null,
          peso_atual_data: obj.peso_bezerro ? obj.data : null,
          mae_id: obj.animal_id,
          lote_id: maeCompleta?.lote_id || null,
          status: 'ativo',
        });
        await dbUpdate('eventos_reprodutivos', evento.id, { bezerro_id: bezerro.id });
        toast('Evento e bezerro cadastrados. Ajuste o brinco do bezerro se necessário.', 'success');
      } else {
        toast('Evento registrado', 'success');
      }
      closeModal();
      pageReproducao();
    } catch (err) {}
  });
}

async function renderReproProtocolos() {
  document.getElementById('reproContent').innerHTML = `
    <div class="flex justify-end mb-3"><button id="btnNovoProtocolo" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo protocolo</button></div>
    <div class="grid md:grid-cols-2 gap-4">
      ${protocolosReprodutivosCache.map(p => `
        <div class="bg-white border rounded-lg p-4">
          <div class="flex justify-between items-start">
            <div><h3 class="font-semibold">${escapeHtml(p.nome)}</h3><p class="text-xs text-gray-500">${escapeHtml(p.tipo || '')}</p></div>
            <button data-id="${p.id}" class="btnEditarProtocolo text-gray-400 hover:text-brand-700">✏️</button>
          </div>
          <p class="text-sm text-gray-600 mt-2">${escapeHtml(p.descricao || '')}</p>
          ${Array.isArray(p.etapas) && p.etapas.length ? `<ul class="text-sm mt-2 list-disc pl-5">${p.etapas.map(et => `<li>${escapeHtml(et)}</li>`).join('')}</ul>` : ''}
        </div>`).join('') || `<p class="text-gray-400 col-span-full text-center py-6">Nenhum protocolo cadastrado</p>`}
    </div>
  `;
  document.getElementById('btnNovoProtocolo').onclick = () => formProtocoloReprodutivo();
  document.querySelectorAll('.btnEditarProtocolo').forEach(b => {
    b.onclick = () => formProtocoloReprodutivo(protocolosReprodutivosCache.find(x => x.id === b.dataset.id));
  });
}

function formProtocoloReprodutivo(protocolo = null) {
  const isEdit = !!protocolo;
  showModal(isEdit ? 'Editar protocolo' : 'Novo protocolo reprodutivo', `
    <form id="formProtocolo">
      ${fld('Nome *', inp('nome', protocolo?.nome, 'text', 'required'))}
      ${fld('Tipo', inp('tipo', protocolo?.tipo, 'text', 'placeholder="IATF, monta natural, TE..."'))}
      ${fld('Descrição', txt('descricao', protocolo?.descricao))}
      ${fld('Etapas (uma por linha, ex: "Dia 0 - Implante + Benzoato")', txt('etapas_texto', Array.isArray(protocolo?.etapas) ? protocolo.etapas.join('\n') : ''))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formProtocolo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.etapas = (obj.etapas_texto || '').split('\n').map(s => s.trim()).filter(Boolean);
    delete obj.etapas_texto;
    try {
      if (isEdit) await dbUpdate('protocolos_reprodutivos', protocolo.id, obj);
      else await dbInsert('protocolos_reprodutivos', obj);
      toast('Protocolo salvo', 'success');
      closeModal();
      pageReproducao();
    } catch (err) {}
  });
}

async function renderReproPartos() {
  const eventos = await dbSelect('eventos_reprodutivos', { select: '*, animal:animal_id(identificacao,nome,lote:lotes(nome,pasto:pastos(nome)))' });
  const gestacoes = computeGestacoesAtivas(eventos);
  document.getElementById('reproContent').innerHTML = `
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Animal</th><th>Lote / Pasto</th><th>Data cobertura</th><th>Diagnóstico</th><th>Data prevista</th><th class="text-right">Dias restantes</th></tr></thead>
        <tbody>${gestacoes.map(g => {
          const a = g.evento.animal;
          return `<tr class="border-b last:border-0 ${g.dias_restantes < 0 ? 'bg-amber-50' : ''}">
            <td class="py-2 px-3"><a class="text-brand-700 hover:underline" href="#animal/${g.animal_id}">${escapeHtml(a?.identificacao || '')}</a></td>
            <td>${a?.lote ? escapeHtml(a.lote.nome) + (a.lote.pasto ? ' / ' + escapeHtml(a.lote.pasto.nome) : '') : '-'}</td>
            <td>${fmtDate(g.data_cobertura)}</td>
            <td>${g.diagnostico}</td>
            <td>${fmtDate(g.data_prevista_parto)}</td>
            <td class="text-right font-medium">${g.dias_restantes}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhuma gestação em andamento</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

async function renderReproTaxa() {
  const c = document.getElementById('reproContent');
  const inicio = addDaysISO(todayISO(), -90);
  c.innerHTML = `
    <div class="bg-white border rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs font-medium text-gray-500">De</label><input id="taxaInicio" type="date" value="${inicio}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <div><label class="text-xs font-medium text-gray-500">Até</label><input id="taxaFim" type="date" value="${todayISO()}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <button id="btnCalcularTaxa" class="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1.5 rounded-md">Calcular</button>
    </div>
    <div id="taxaResultado"></div>
  `;
  async function calcular() {
    const de = document.getElementById('taxaInicio').value;
    const ate = document.getElementById('taxaFim').value;
    const diagnosticos = await dbSelect('eventos_reprodutivos', {
      filters: [{ col: 'tipo_evento', val: 'diagnostico_gestacao' }, { col: 'data', op: 'gte', val: de }, { col: 'data', op: 'lte', val: ate }],
    });
    const t = taxaPrenhez(diagnosticos);
    document.getElementById('taxaResultado').innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${statCard('📈', t.pct.toFixed(1) + '%', 'Taxa de prenhez')}
        ${statCard('🔬', t.total, 'Diagnósticos no período')}
        ${statCard('✅', t.positivos, 'Positivos')}
        ${statCard('❌', t.negativos, 'Negativos')}
      </div>
    `;
  }
  document.getElementById('btnCalcularTaxa').onclick = calcular;
  calcular();
}

// ------------------------------------------------------------
// PÁGINA: ALIMENTAÇÃO
// ------------------------------------------------------------
let alimentacaoTab = 'protocolos';
let protocolosAlimentaresCache = [];

async function pageAlimentacao() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  protocolosAlimentaresCache = await dbSelect('protocolos_alimentares', { order: { col: 'nome' } });

  content.innerHTML = `<h1 class="text-xl font-bold mb-4">Alimentação</h1><div id="alimTabs"></div><div id="alimContent"></div>`;
  document.getElementById('alimTabs').innerHTML = tabsBar([
    { key: 'protocolos', label: 'Protocolos alimentares' },
    { key: 'aplicacoes', label: 'Aplicações por lote' },
  ], alimentacaoTab);
  document.querySelectorAll('#alimTabs .tabBtn').forEach(b => { b.onclick = () => { alimentacaoTab = b.dataset.tab; pageAlimentacao(); }; });

  if (alimentacaoTab === 'protocolos') renderAlimProtocolos();
  else await renderAlimAplicacoes();
}

function renderAlimProtocolos() {
  document.getElementById('alimContent').innerHTML = `
    <div class="flex justify-end mb-3"><button id="btnNovoProtAlim" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo protocolo</button></div>
    <div class="grid md:grid-cols-2 gap-4">
      ${protocolosAlimentaresCache.map(p => `
        <div class="bg-white border rounded-lg p-4">
          <div class="flex justify-between items-start">
            <div><h3 class="font-semibold">${escapeHtml(p.nome)}</h3><p class="text-xs text-gray-500">${escapeHtml(p.categoria_alvo || '')}</p></div>
            <button data-id="${p.id}" class="btnEditarProtAlim text-gray-400 hover:text-brand-700">✏️</button>
          </div>
          <p class="text-sm text-gray-600 mt-2">${escapeHtml(p.descricao || '')}</p>
          ${Array.isArray(p.composicao) && p.composicao.length ? `<ul class="text-sm mt-2 list-disc pl-5">${p.composicao.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
        </div>`).join('') || `<p class="text-gray-400 col-span-full text-center py-6">Nenhum protocolo alimentar cadastrado</p>`}
    </div>
  `;
  document.getElementById('btnNovoProtAlim').onclick = () => formProtocoloAlimentar();
  document.querySelectorAll('.btnEditarProtAlim').forEach(b => {
    b.onclick = () => formProtocoloAlimentar(protocolosAlimentaresCache.find(x => x.id === b.dataset.id));
  });
}

function formProtocoloAlimentar(protocolo = null) {
  const isEdit = !!protocolo;
  showModal(isEdit ? 'Editar protocolo alimentar' : 'Novo protocolo alimentar', `
    <form id="formProtAlim">
      ${fld('Nome *', inp('nome', protocolo?.nome, 'text', 'required'))}
      ${fld('Categoria alvo', inp('categoria_alvo', protocolo?.categoria_alvo, 'text', 'placeholder="bezerros, recria, engorda, vacas em lactação..."'))}
      ${fld('Descrição', txt('descricao', protocolo?.descricao))}
      ${fld('Composição (um item por linha, ex: "Silagem de milho - 20kg/animal/dia")', txt('composicao_texto', Array.isArray(protocolo?.composicao) ? protocolo.composicao.join('\n') : ''))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formProtAlim').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.composicao = (obj.composicao_texto || '').split('\n').map(s => s.trim()).filter(Boolean);
    delete obj.composicao_texto;
    try {
      if (isEdit) await dbUpdate('protocolos_alimentares', protocolo.id, obj);
      else await dbInsert('protocolos_alimentares', obj);
      toast('Protocolo salvo', 'success');
      closeModal();
      pageAlimentacao();
    } catch (err) {}
  });
}

async function renderAlimAplicacoes() {
  const aplicacoes = await dbSelect('aplicacoes_alimentares', {
    select: '*, protocolo:protocolo_id(nome), lote:lote_id(nome)',
    order: { col: 'data_inicio', asc: false },
  });
  document.getElementById('alimContent').innerHTML = `
    <div class="flex justify-end mb-3"><button id="btnNovaAplicacao" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Aplicar protocolo a um lote</button></div>
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Protocolo</th><th>Lote</th><th>Início</th><th>Fim</th></tr></thead>
        <tbody>${aplicacoes.map(a => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${escapeHtml(a.protocolo?.nome || '')}</td>
          <td>${escapeHtml(a.lote?.nome || '')}</td>
          <td>${fmtDate(a.data_inicio)}</td>
          <td>${a.data_fim ? fmtDate(a.data_fim) : '<span class="text-green-600">em curso</span>'}</td>
        </tr>`).join('') || `<tr><td colspan="4" class="text-center text-gray-400 py-6">Nenhuma aplicação registrada</td></tr>`}</tbody>
      </table>
    </div>
  `;
  document.getElementById('btnNovaAplicacao').onclick = () => formAplicacaoAlimentar();
}

function formAplicacaoAlimentar() {
  showModal('Aplicar protocolo alimentar a um lote', `
    <form id="formAplicacao">
      ${fld('Protocolo *', sel('protocolo_id', protocolosAlimentaresCache.map(p => ({ value: p.id, label: p.nome })), '', 'required'))}
      ${fld('Lote *', sel('lote_id', [], '', 'required').replace('<select', '<select id="selLoteAplic"'))}
      ${fld('Data de início', inp('data_inicio', todayISO(), 'date'))}
      ${fld('Data de fim (opcional)', inp('data_fim', '', 'date'))}
      ${fld('Observações', txt('observacoes'))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('selLoteAplic').innerHTML = loteOptions('', true);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formAplicacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    try {
      await dbInsert('aplicacoes_alimentares', obj);
      toast('Aplicação registrada', 'success');
      closeModal();
      pageAlimentacao();
    } catch (err) {}
  });
}

// ------------------------------------------------------------
// PÁGINA: SANIDADE
// ------------------------------------------------------------
let sanidadeTab = 'registros';

async function pageSanidade() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  content.innerHTML = `<h1 class="text-xl font-bold mb-4">Sanidade</h1><div id="sanTabs"></div><div id="sanContent"></div>`;
  document.getElementById('sanTabs').innerHTML = tabsBar([
    { key: 'registros', label: 'Doenças / Tratamentos' },
    { key: 'baixas', label: 'Mortes e baixas' },
  ], sanidadeTab);
  document.querySelectorAll('#sanTabs .tabBtn').forEach(b => { b.onclick = () => { sanidadeTab = b.dataset.tab; pageSanidade(); }; });

  if (sanidadeTab === 'registros') await renderSanRegistros();
  else await renderSanBaixas();
}

async function renderSanRegistros() {
  const registros = await dbSelect('registros_sanitarios', {
    select: '*, animal:animal_id(identificacao), lote:lote_id(nome)',
    order: { col: 'data', asc: false }, limit: 150,
  });
  document.getElementById('sanContent').innerHTML = `
    <div class="flex justify-end mb-3"><button id="btnNovoRegistroSan" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo registro</button></div>
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Animal/Lote</th><th>Tipo</th><th>Nome</th><th>Status</th><th class="text-right">Custo</th></tr></thead>
        <tbody>${registros.map(r => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(r.data)}</td>
          <td>${r.animal ? escapeHtml(r.animal.identificacao) : (r.lote ? 'Lote: ' + escapeHtml(r.lote.nome) : '-')}</td>
          <td>${r.tipo}</td>
          <td>${escapeHtml(r.nome)}</td>
          <td>${r.status || '-'}</td>
          <td class="text-right">${r.custo ? fmtMoney(r.custo) : '-'}</td>
        </tr>`).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhum registro sanitário</td></tr>`}</tbody>
      </table>
    </div>
  `;
  document.getElementById('btnNovoRegistroSan').onclick = () => formRegistroSanitario();
}

async function formRegistroSanitario() {
  const animais = await dbSelect('animais', { select: 'id,identificacao', filters: [{ col: 'status', val: 'ativo' }], order: { col: 'identificacao' } });
  showModal('Novo registro sanitário', `
    <form id="formSan" class="grid md:grid-cols-2 gap-x-3">
      ${fld('Animal (deixe em branco se for tratamento em grupo)', sel('animal_id', [{ value: '', label: '— nenhum —' }, ...animais.map(a => ({ value: a.id, label: a.identificacao }))], ''))}
      ${fld('OU Lote (tratamento em grupo)', sel('lote_id', [], '').replace('<select', '<select id="selLoteSan"'))}
      ${fld('Tipo *', sel('tipo', [{ value: 'doenca', label: 'Doença' }, { value: 'vacina', label: 'Vacina' }, { value: 'tratamento', label: 'Tratamento' }, { value: 'exame', label: 'Exame' }, { value: 'vermifugo', label: 'Vermífugo' }], 'doenca', 'required'))}
      ${fld('Nome da doença/vacina/procedimento *', inp('nome', '', 'text', 'required'))}
      ${fld('Data', inp('data', todayISO(), 'date'))}
      ${fld('Medicamento', inp('medicamento'))}
      ${fld('Dose', inp('dose'))}
      ${fld('Carência (dias)', inp('carencia_dias', '', 'number'))}
      ${fld('Custo (R$)', inp('custo', '', 'number', 'step="0.01"'))}
      ${fld('Veterinário', inp('veterinario'))}
      ${fld('Status', sel('status', [{ value: 'em_tratamento', label: 'Em tratamento' }, { value: 'curado', label: 'Curado' }, { value: 'obito', label: 'Óbito' }, { value: 'cronico', label: 'Crônico' }], 'em_tratamento'))}
      ${fld('Observações', txt('observacoes'), 'md:col-span-2')}
      <div class="md:col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `, 'max-w-2xl');
  document.getElementById('selLoteSan').innerHTML = loteOptions('', true);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formSan').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    if (obj.custo) obj.custo = Number(obj.custo);
    if (obj.carencia_dias) obj.carencia_dias = Number(obj.carencia_dias);
    try {
      await dbInsert('registros_sanitarios', obj);
      if (obj.status === 'obito' && obj.animal_id) {
        if (confirmAction('Este animal foi a óbito. Deseja registrar a baixa (morte) automaticamente?')) {
          await dbInsert('baixas', { animal_id: obj.animal_id, tipo: 'morte', data: obj.data, motivo: obj.nome });
          await dbUpdate('animais', obj.animal_id, { status: 'morto', data_saida: obj.data, motivo_saida: obj.nome });
        }
      }
      toast('Registro salvo', 'success');
      closeModal();
      pageSanidade();
    } catch (err) {}
  });
}

async function renderSanBaixas() {
  const baixasList = await dbSelect('baixas', { select: '*, animal:animal_id(identificacao)', order: { col: 'data', asc: false } });
  document.getElementById('sanContent').innerHTML = `
    <div class="flex justify-end mb-3"><button id="btnNovaBaixa" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Registrar baixa</button></div>
    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Animal</th><th>Tipo</th><th>Motivo</th><th class="text-right">Valor</th></tr></thead>
        <tbody>${baixasList.map(b => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(b.data)}</td>
          <td>${escapeHtml(b.animal?.identificacao || '')}</td>
          <td>${b.tipo}</td>
          <td>${escapeHtml(b.motivo || '-')}</td>
          <td class="text-right">${b.valor ? fmtMoney(b.valor) : '-'}</td>
        </tr>`).join('') || `<tr><td colspan="5" class="text-center text-gray-400 py-6">Nenhuma baixa registrada</td></tr>`}</tbody>
      </table>
    </div>
  `;
  document.getElementById('btnNovaBaixa').onclick = () => formBaixa();
}

async function formBaixa() {
  const animais = await dbSelect('animais', { select: 'id,identificacao', filters: [{ col: 'status', val: 'ativo' }], order: { col: 'identificacao' } });
  showModal('Registrar baixa (morte / venda / descarte)', `
    <form id="formBaixa">
      ${fld('Animal *', sel('animal_id', animais.map(a => ({ value: a.id, label: a.identificacao })), '', 'required'))}
      ${fld('Tipo *', sel('tipo', [{ value: 'morte', label: 'Morte' }, { value: 'venda', label: 'Venda' }, { value: 'descarte', label: 'Descarte' }], 'morte', 'required'))}
      ${fld('Data', inp('data', todayISO(), 'date'))}
      ${fld('Motivo', inp('motivo'))}
      ${fld('Valor (se venda)', inp('valor', '', 'number', 'step="0.01"'))}
      ${fld('Comprador (se venda)', inp('comprador'))}
      ${fld('Observações', txt('observacoes'))}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formBaixa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    if (obj.valor) obj.valor = Number(obj.valor);
    const statusMap = { morte: 'morto', venda: 'vendido', descarte: 'descartado' };
    try {
      await dbInsert('baixas', obj);
      await dbUpdate('animais', obj.animal_id, { status: statusMap[obj.tipo], data_saida: obj.data, motivo_saida: obj.motivo, valor_venda: obj.valor || null });
      toast('Baixa registrada', 'success');
      closeModal();
      pageSanidade();
    } catch (err) {}
  });
}

// ------------------------------------------------------------
// PÁGINA: VENDAS (seleção de animais em lote + baixa automática)
// ------------------------------------------------------------
let vendaFiltro = { busca: '', lote_id: '' };
let vendaSelecionados = new Set();
let vendaModo = 'total'; // 'total' (rateado igualmente) ou 'unitario' (valor por animal)
let vendaValorTotalInput = '';
let vendaValoresUnitarios = {}; // animal_id -> string digitado

function recalcularResumoVenda() {
  const qtd = vendaSelecionados.size;
  const qtdEl = document.getElementById('qtdSelecionadosLabel');
  if (qtdEl) qtdEl.textContent = qtd;
  let total = 0;
  if (vendaModo === 'total') {
    const totalInput = document.getElementById('inputValorTotal');
    total = totalInput ? (parseFloat(totalInput.value) || 0) : 0;
    const unit = qtd > 0 ? total / qtd : 0;
    const unitEl = document.getElementById('valorUnitCalculado');
    if (unitEl) unitEl.textContent = fmtMoney(unit);
  } else {
    vendaSelecionados.forEach(id => { total += parseFloat(vendaValoresUnitarios[id]) || 0; });
  }
  const totalEl = document.getElementById('totalVendaResumo');
  if (totalEl) totalEl.textContent = fmtMoney(total);
  const btn = document.getElementById('btnConfirmarVenda');
  if (btn) btn.disabled = qtd === 0;
}

async function pageVendas() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();

  const filters = [{ col: 'status', val: 'ativo' }];
  if (vendaFiltro.lote_id) filters.push({ col: 'lote_id', val: vendaFiltro.lote_id });
  let animais = await dbSelect('animais', {
    select: '*, lote:lotes(id,nome,pasto:pastos(id,nome))',
    filters,
    order: { col: 'identificacao' },
  });
  if (vendaFiltro.busca) {
    const b = vendaFiltro.busca.toLowerCase();
    animais = animais.filter(a => (a.identificacao || '').toLowerCase().includes(b) || (a.nome || '').toLowerCase().includes(b));
  }

  const historicoHtml = await renderHistoricoVendasHtml();

  content.innerHTML = `
    <h1 class="text-xl font-bold mb-1">Vendas de animais</h1>
    <p class="text-sm text-gray-600 mb-4">Selecione os animais vendidos, informe o valor (total do lote, dividido igualmente, ou um valor por animal) e confirme — o sistema dá baixa nos animais automaticamente.</p>

    <div class="grid lg:grid-cols-3 gap-4 items-start">
      <div class="lg:col-span-2">
        <div class="bg-white border rounded-lg p-3 mb-3 flex flex-wrap gap-3 items-end">
          <div>
            <label class="text-xs font-medium text-gray-500">Buscar (brinco/nome)</label>
            <input id="fBuscaVenda" value="${escapeHtml(vendaFiltro.busca)}" class="mt-1 border rounded-md px-3 py-1.5 text-sm">
          </div>
          <div>
            <label class="text-xs font-medium text-gray-500">Lote</label>
            <select id="fLoteVenda" class="mt-1 border rounded-md px-3 py-1.5 text-sm bg-white">${loteOptions(vendaFiltro.lote_id, false)}</select>
          </div>
          <button id="btnFiltrarVenda" class="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1.5 rounded-md">Filtrar</button>
          <span class="text-sm text-gray-400 ml-auto">${animais.length} animal(is) ativo(s)</span>
        </div>

        <div class="bg-white border rounded-lg overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-gray-500 border-b">
              <th class="py-2 px-3"><input type="checkbox" id="chkSelecionarTodos"></th>
              <th>Brinco</th><th>Nome</th><th>Categoria</th><th>Lote</th><th>Pasto</th>
              <th class="text-right pr-3">Valor unitário</th>
            </tr></thead>
            <tbody>
              ${animais.map(a => `
                <tr class="border-b last:border-0 hover:bg-gray-50">
                  <td class="py-2 px-3"><input type="checkbox" class="chkAnimalVenda" data-id="${a.id}" ${vendaSelecionados.has(a.id) ? 'checked' : ''}></td>
                  <td class="font-medium">${escapeHtml(a.identificacao)}</td>
                  <td>${escapeHtml(a.nome || '-')}</td>
                  <td>${escapeHtml(a.categoria)}</td>
                  <td>${a.lote ? escapeHtml(a.lote.nome) : '-'}</td>
                  <td>${a.lote && a.lote.pasto ? escapeHtml(a.lote.pasto.nome) : '-'}</td>
                  <td class="text-right pr-3">
                    <input type="number" step="0.01" min="0" class="valorUnitInput w-24 text-right border rounded px-2 py-1 text-xs" data-id="${a.id}"
                      value="${vendaValoresUnitarios[a.id] ?? ''}" placeholder="0,00" ${vendaModo !== 'unitario' || !vendaSelecionados.has(a.id) ? 'disabled' : ''}>
                  </td>
                </tr>`).join('') || `<tr><td colspan="7" class="text-center text-gray-400 py-6">Nenhum animal ativo encontrado</td></tr>`}
            </tbody>
          </table>
        </div>

        ${historicoHtml}
      </div>

      <div class="bg-white border rounded-lg p-4 lg:sticky lg:top-4">
        <h2 class="font-semibold mb-3">Fechar venda</h2>
        <div class="text-sm mb-3"><strong id="qtdSelecionadosLabel">${vendaSelecionados.size}</strong> animal(is) selecionado(s)</div>

        <div class="flex gap-2 mb-3 text-sm">
          <button type="button" id="btnModoTotal" class="flex-1 px-2 py-1.5 rounded-md border ${vendaModo === 'total' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white'}">Valor total do lote</button>
          <button type="button" id="btnModoUnit" class="flex-1 px-2 py-1.5 rounded-md border ${vendaModo === 'unitario' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white'}">Valor por animal</button>
        </div>

        <div id="painelModoTotal" class="${vendaModo === 'total' ? '' : 'hidden'}">
          ${fld('Valor total da venda (R$)', `<input id="inputValorTotal" type="number" step="0.01" min="0" value="${escapeHtml(vendaValorTotalInput)}" class="mt-1 w-full border rounded-md px-3 py-2 text-sm">`)}
          <p class="text-xs text-gray-500 -mt-2 mb-2">Valor unitário calculado: <strong id="valorUnitCalculado">R$ 0,00</strong> (dividido igualmente entre os selecionados)</p>
        </div>
        <div id="painelModoUnit" class="text-xs text-gray-500 mb-2 ${vendaModo === 'unitario' ? '' : 'hidden'}">
          Preencha o valor de cada animal selecionado na tabela ao lado.
        </div>

        <div class="border-t pt-3 mt-1 text-sm flex justify-between font-semibold">
          <span>Valor total da venda:</span><span id="totalVendaResumo">R$ 0,00</span>
        </div>

        <div class="mt-3">
          ${fld('Data da venda *', inp('dataVenda', todayISO(), 'date', 'required id="inputDataVenda"'))}
          ${fld('Comprador', inp('compradorVenda', '', 'text', 'id="inputCompradorVenda"'))}
          ${fld('Observações', txt('observacoesVenda').replace('<textarea', '<textarea id="inputObsVenda"'))}
        </div>
        <button id="btnConfirmarVenda" ${vendaSelecionados.size === 0 ? 'disabled' : ''} class="w-full mt-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md text-sm">Confirmar venda</button>
      </div>
    </div>
  `;

  document.getElementById('btnFiltrarVenda').onclick = () => {
    vendaFiltro.busca = document.getElementById('fBuscaVenda').value;
    vendaFiltro.lote_id = document.getElementById('fLoteVenda').value;
    pageVendas();
  };

  document.getElementById('chkSelecionarTodos').onchange = (e) => {
    animais.forEach(a => {
      if (e.target.checked) vendaSelecionados.add(a.id); else vendaSelecionados.delete(a.id);
    });
    pageVendas();
  };

  document.querySelectorAll('.chkAnimalVenda').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) vendaSelecionados.add(chk.dataset.id); else vendaSelecionados.delete(chk.dataset.id);
      const unitInput = document.querySelector(`.valorUnitInput[data-id="${chk.dataset.id}"]`);
      if (unitInput) unitInput.disabled = vendaModo !== 'unitario' || !chk.checked;
      recalcularResumoVenda();
    });
  });

  document.querySelectorAll('.valorUnitInput').forEach(inputEl => {
    inputEl.addEventListener('input', () => {
      vendaValoresUnitarios[inputEl.dataset.id] = inputEl.value;
      recalcularResumoVenda();
    });
  });

  document.getElementById('btnModoTotal').onclick = () => { vendaModo = 'total'; pageVendas(); };
  document.getElementById('btnModoUnit').onclick = () => { vendaModo = 'unitario'; pageVendas(); };

  document.getElementById('inputValorTotal')?.addEventListener('input', (e) => {
    vendaValorTotalInput = e.target.value;
    recalcularResumoVenda();
  });

  document.getElementById('btnConfirmarVenda').onclick = () => confirmarVenda();

  recalcularResumoVenda();
}

async function confirmarVenda() {
  const ids = Array.from(vendaSelecionados);
  if (ids.length === 0) { toast('Selecione ao menos um animal', 'error'); return; }
  const data = document.getElementById('inputDataVenda').value || todayISO();
  const comprador = document.getElementById('inputCompradorVenda').value || null;
  const observacoes = document.getElementById('inputObsVenda').value || null;

  const valoresPorAnimal = {};
  if (vendaModo === 'total') {
    const total = parseFloat(document.getElementById('inputValorTotal').value) || 0;
    if (total <= 0) { toast('Informe o valor total da venda', 'error'); return; }
    const n = ids.length;
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / n);
    const restoCents = totalCents - baseCents * n;
    ids.forEach((id, i) => {
      valoresPorAnimal[id] = (baseCents + (i < restoCents ? 1 : 0)) / 100;
    });
  } else {
    const faltando = [];
    ids.forEach(id => {
      const v = parseFloat(vendaValoresUnitarios[id]);
      if (!v || v <= 0) faltando.push(id);
      valoresPorAnimal[id] = v || 0;
    });
    if (faltando.length > 0) {
      if (!confirmAction(`${faltando.length} animal(is) selecionado(s) está(ão) sem valor unitário preenchido (será salvo como R$ 0,00). Deseja continuar mesmo assim?`)) return;
    }
  }

  const btn = document.getElementById('btnConfirmarVenda');
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  const vendaRef = 'V' + Date.now().toString(36).toUpperCase();
  try {
    const registrosBaixa = ids.map(id => ({
      animal_id: id,
      tipo: 'venda',
      data,
      motivo: 'Venda em lote',
      valor: valoresPorAnimal[id],
      comprador,
      observacoes,
      venda_ref: vendaRef,
    }));
    await inserirEmLotes('baixas', registrosBaixa);
    const atualizacoesAnimais = ids.map(id => ({
      id, status: 'vendido', data_saida: data, motivo_saida: 'Venda', valor_venda: valoresPorAnimal[id],
    }));
    await dbUpdateEmLote('animais', atualizacoesAnimais);
    const totalVendido = Object.values(valoresPorAnimal).reduce((s, v) => s + v, 0);
    toast(`Venda registrada: ${ids.length} animal(is), total ${fmtMoney(totalVendido)}`, 'success');
    vendaSelecionados.clear();
    vendaValoresUnitarios = {};
    vendaValorTotalInput = '';
    await refreshCaches();
    pageVendas();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Confirmar venda';
  }
}

async function renderHistoricoVendasHtml() {
  const vendas = await dbSelect('baixas', {
    select: '*, animal:animal_id(identificacao)',
    filters: [{ col: 'tipo', val: 'venda' }],
    order: { col: 'data', asc: false },
    limit: 500,
  });
  const grupos = {};
  vendas.forEach(v => {
    const chave = v.venda_ref || v.id;
    if (!grupos[chave]) grupos[chave] = { data: v.data, comprador: v.comprador, itens: [], total: 0 };
    grupos[chave].itens.push(v);
    grupos[chave].total += Number(v.valor || 0);
  });
  const listaGrupos = Object.values(grupos).sort((a, b) => (a.data < b.data ? 1 : (a.data > b.data ? -1 : 0)));
  return `
    <div class="bg-white border rounded-lg overflow-x-auto mt-4">
      <h2 class="font-semibold px-4 pt-4">Vendas realizadas</h2>
      <table class="w-full text-sm mt-2">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Comprador</th><th class="text-right">Qtd. animais</th><th class="text-right pr-3">Valor total</th></tr></thead>
        <tbody>${listaGrupos.map(g => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(g.data)}</td>
          <td>${escapeHtml(g.comprador || '-')}</td>
          <td class="text-right">${g.itens.length}</td>
          <td class="text-right pr-3 font-medium">${fmtMoney(g.total)}</td>
        </tr>`).join('') || `<tr><td colspan="4" class="text-center text-gray-400 py-6">Nenhuma venda registrada ainda</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ------------------------------------------------------------
// PÁGINA: CUSTOS
// ------------------------------------------------------------
const CATEGORIAS_CUSTO = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'sanidade', label: 'Sanidade' },
  { value: 'mao_de_obra', label: 'Mão de obra / Salários' },
  { value: 'infraestrutura', label: 'Infraestrutura' },
  { value: 'reproducao', label: 'Reprodução' },
  { value: 'combustivel', label: 'Combustível' },
  { value: 'assinaturas', label: 'Assinaturas' },
  { value: 'investimentos', label: 'Investimentos' },
  { value: 'impostos_taxas', label: 'Impostos e taxas' },
  { value: 'outros', label: 'Outros' },
];
let custosFiltro = { de: addDaysISO(todayISO(), -30), ate: todayISO(), categoria: '' };
let custosTab = 'lancamentos';

const CATEGORIAS_RECEITA = [
  { value: 'venda_insumos', label: 'Venda de insumos/produtos (leite, feno, esterco...)' },
  { value: 'arrendamento', label: 'Aluguel / arrendamento de pasto ou área' },
  { value: 'prestacao_servico', label: 'Prestação de serviços' },
  { value: 'subsidio', label: 'Subsídio / incentivo agrícola' },
  { value: 'rendimento_financeiro', label: 'Rendimento financeiro' },
  { value: 'outros', label: 'Outras receitas' },
];
let receitasFiltro = { de: addDaysISO(todayISO(), -30), ate: todayISO(), categoria: '' };

async function pageCustos() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();

  content.innerHTML = `<h1 class="text-xl font-bold mb-4">Financeiro</h1><div id="custosTabs"></div><div id="custosContent"></div>`;
  document.getElementById('custosTabs').innerHTML = tabsBar([
    { key: 'lancamentos', label: 'Custos' },
    { key: 'combustivel', label: '⛽ Combustível' },
    { key: 'entradas', label: '💵 Entradas' },
  ], custosTab);
  document.querySelectorAll('#custosTabs .tabBtn').forEach(b => { b.onclick = () => { custosTab = b.dataset.tab; pageCustos(); }; });

  if (custosTab === 'combustivel') await renderCustosCombustivel();
  else if (custosTab === 'entradas') await renderReceitas();
  else await renderCustosLancamentos();
}

async function renderCustosLancamentos() {
  const content = document.getElementById('custosContent');
  content.innerHTML = loading();
  const filters = [{ col: 'data', op: 'gte', val: custosFiltro.de }, { col: 'data', op: 'lte', val: custosFiltro.ate }];
  if (custosFiltro.categoria) filters.push({ col: 'categoria', val: custosFiltro.categoria });
  const custos = await dbSelect('custos', { select: '*, lote:lote_id(nome), pasto:pasto_id(nome)', filters, order: { col: 'data', asc: false } });
  const total = custos.reduce((s, c) => s + Number(c.valor || 0), 0);
  const porCategoria = {};
  custos.forEach(c => { porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + Number(c.valor || 0); });

  content.innerHTML = `
    <div class="flex flex-wrap justify-end items-center gap-2 mb-4">
      <div class="flex flex-wrap gap-2">
        <button id="btnImportarLancamentos" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📥 Importar planilha (Excel/CSV)</button>
        <button id="btnImportarNF" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📄 Importar nota fiscal (XML)</button>
        <button id="btnNovoCusto" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo lançamento</button>
      </div>
    </div>

    <div class="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs font-medium text-gray-500">De</label><input id="cDe" type="date" value="${custosFiltro.de}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <div><label class="text-xs font-medium text-gray-500">Até</label><input id="cAte" type="date" value="${custosFiltro.ate}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <div><label class="text-xs font-medium text-gray-500">Categoria</label><select id="cCategoria" class="mt-1 border rounded-md px-3 py-1.5 text-sm bg-white block">${sel('_', [{ value: '', label: 'Todas' }, ...CATEGORIAS_CUSTO], custosFiltro.categoria).replace(/<\/?select[^>]*>/g, '')}</select></div>
      <button id="btnFiltrarCusto" class="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1.5 rounded-md">Filtrar</button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('💰', fmtMoney(total), 'Total no período')}
      ${CATEGORIAS_CUSTO.filter(c => porCategoria[c.value]).slice(0, 3).map(c => statCard('▫️', fmtMoney(porCategoria[c.value]), c.label)).join('')}
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Categoria</th><th>Descrição</th><th>Lote/Pasto</th><th class="text-right">Valor</th><th></th><th></th></tr></thead>
        <tbody>${custos.map(c => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(c.data)}</td>
          <td>${CATEGORIAS_CUSTO.find(x => x.value === c.categoria)?.label || c.categoria}</td>
          <td>${escapeHtml(c.descricao)}${c.nf_numero ? ` <span class="text-xs text-gray-400">(NF ${escapeHtml(c.nf_numero)})</span>` : ''}</td>
          <td>${c.lote ? escapeHtml(c.lote.nome) : (c.pasto ? escapeHtml(c.pasto.nome) : '-')}</td>
          <td class="text-right">${fmtMoney(c.valor)}</td>
          <td class="text-center px-1">${c.anexo_path ? `<a href="${anexoUrl(c.anexo_path)}" target="_blank" rel="noopener" title="Ver anexo">📎</a>` : ''}</td>
          <td class="text-right px-3"><button data-id="${c.id}" class="btnExcluirCusto text-gray-400 hover:text-red-600">🗑️</button></td>
        </tr>`).join('') || `<tr><td colspan="7" class="text-center text-gray-400 py-6">Nenhum custo lançado no período</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovoCusto').onclick = () => formCusto();
  document.getElementById('btnImportarNF').onclick = () => formImportarNotaFiscal();
  document.getElementById('btnImportarLancamentos').onclick = () => importarLancamentosCSV();
  document.getElementById('btnFiltrarCusto').onclick = () => {
    custosFiltro.de = document.getElementById('cDe').value;
    custosFiltro.ate = document.getElementById('cAte').value;
    custosFiltro.categoria = document.getElementById('cCategoria').value;
    pageCustos();
  };
  document.querySelectorAll('.btnExcluirCusto').forEach(b => {
    b.onclick = async () => {
      if (!confirmAction('Excluir este lançamento de custo?')) return;
      await dbDelete('custos', b.dataset.id);
      toast('Lançamento excluído', 'success');
      pageCustos();
    };
  });
}

function formCusto() {
  showModal('Novo lançamento de custo', `
    <form id="formCusto">
      ${fld('Categoria *', sel('categoria', CATEGORIAS_CUSTO, 'outros', 'required'))}
      ${fld('Descrição *', inp('descricao', '', 'text', 'required'))}
      ${fld('Valor (R$) *', inp('valor', '', 'number', 'step="0.01" required'))}
      ${fld('Data', inp('data', todayISO(), 'date'))}
      ${fld('Lote (opcional)', sel('lote_id', [], '').replace('<select', '<select id="selLoteCusto"'))}
      ${fld('Pasto (opcional)', sel('pasto_id', [], '').replace('<select', '<select id="selPastoCusto"'))}
      ${fld('Observações', txt('observacoes'))}
      ${fld('Anexar foto ou PDF da nota (opcional)', '<input type="file" name="anexo_file" accept="image/*,.pdf" capture="environment" class="mt-1 w-full text-sm">', '')}
      <p class="text-xs text-gray-400 -mt-2 mb-2">Dica: se você recebeu a nota fotografada pelo WhatsApp, salve a foto na galeria do celular e selecione ela aqui.</p>
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" id="btnSalvarCusto" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('selLoteCusto').innerHTML = loteOptions('', false);
  document.getElementById('selPastoCusto').innerHTML = pastoOptions('');
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formCusto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fileInput = form.querySelector('[name=anexo_file]');
    const arquivo = fileInput?.files?.[0] || null;
    const obj = formToObject(form);
    delete obj.anexo_file;
    obj.valor = Number(obj.valor);
    const btn = document.getElementById('btnSalvarCusto');
    btn.disabled = true;
    try {
      if (arquivo) {
        btn.textContent = 'Enviando anexo...';
        obj.anexo_path = await uploadAnexo(arquivo);
      }
      await dbInsert('custos', obj);
      toast('Custo lançado', 'success');
      closeModal();
      pageCustos();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  });
}

// ------------------------------------------------------------
// FINANCEIRO: ENTRADAS (receitas que não são venda de gado —
// essas ficam registradas em "Vendas", como baixa dos animais)
// ------------------------------------------------------------
async function renderReceitas() {
  const content = document.getElementById('custosContent');
  content.innerHTML = loading();
  const filters = [{ col: 'data', op: 'gte', val: receitasFiltro.de }, { col: 'data', op: 'lte', val: receitasFiltro.ate }];
  if (receitasFiltro.categoria) filters.push({ col: 'categoria', val: receitasFiltro.categoria });
  const receitas = await dbSelect('receitas', { filters, order: { col: 'data', asc: false } });
  const total = receitas.reduce((s, r) => s + Number(r.valor || 0), 0);

  content.innerHTML = `
    <div class="flex flex-wrap justify-end items-center gap-2 mb-4">
      <button id="btnImportarReceitas" class="bg-white border text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50">📥 Importar planilha (Excel/CSV)</button>
      <button id="btnNovaReceita" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Nova entrada</button>
    </div>

    <div class="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-end">
      <div><label class="text-xs font-medium text-gray-500">De</label><input id="rDe" type="date" value="${receitasFiltro.de}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <div><label class="text-xs font-medium text-gray-500">Até</label><input id="rAte" type="date" value="${receitasFiltro.ate}" class="mt-1 border rounded-md px-3 py-1.5 text-sm block"></div>
      <div><label class="text-xs font-medium text-gray-500">Categoria</label><select id="rCategoria" class="mt-1 border rounded-md px-3 py-1.5 text-sm bg-white block">${sel('_', [{ value: '', label: 'Todas' }, ...CATEGORIAS_RECEITA], receitasFiltro.categoria).replace(/<\/?select[^>]*>/g, '')}</select></div>
      <button id="btnFiltrarReceita" class="bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1.5 rounded-md">Filtrar</button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('💵', fmtMoney(total), 'Total de entradas no período')}
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Categoria</th><th>Descrição</th><th class="text-right">Valor</th><th></th><th></th></tr></thead>
        <tbody>${receitas.map(r => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(r.data)}</td>
          <td>${CATEGORIAS_RECEITA.find(x => x.value === r.categoria)?.label || r.categoria}</td>
          <td>${escapeHtml(r.descricao)}</td>
          <td class="text-right">${fmtMoney(r.valor)}</td>
          <td class="text-center px-1">${r.anexo_path ? `<a href="${anexoUrl(r.anexo_path)}" target="_blank" rel="noopener" title="Ver anexo">📎</a>` : ''}</td>
          <td class="text-right px-3"><button data-id="${r.id}" class="btnExcluirReceita text-gray-400 hover:text-red-600">🗑️</button></td>
        </tr>`).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhuma entrada lançada no período</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovaReceita').onclick = () => formReceita();
  document.getElementById('btnImportarReceitas').onclick = () => importarReceitasCSV();
  document.getElementById('btnFiltrarReceita').onclick = () => {
    receitasFiltro.de = document.getElementById('rDe').value;
    receitasFiltro.ate = document.getElementById('rAte').value;
    receitasFiltro.categoria = document.getElementById('rCategoria').value;
    renderReceitas();
  };
  document.querySelectorAll('.btnExcluirReceita').forEach(b => {
    b.onclick = async () => {
      if (!confirmAction('Excluir esta entrada financeira?')) return;
      await dbDelete('receitas', b.dataset.id);
      toast('Entrada excluída', 'success');
      renderReceitas();
    };
  });
}

function formReceita() {
  showModal('Nova entrada financeira', `
    <form id="formReceita">
      ${fld('Categoria *', sel('categoria', CATEGORIAS_RECEITA, 'outros', 'required'))}
      ${fld('Descrição *', inp('descricao', '', 'text', 'required'))}
      ${fld('Valor (R$) *', inp('valor', '', 'number', 'step="0.01" required'))}
      ${fld('Data', inp('data', todayISO(), 'date'))}
      ${fld('Observações', txt('observacoes'))}
      ${fld('Anexar comprovante (opcional)', '<input type="file" name="anexo_file" accept="image/*,.pdf" capture="environment" class="mt-1 w-full text-sm">', '')}
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" id="btnSalvarReceita" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formReceita').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fileInput = form.querySelector('[name=anexo_file]');
    const arquivo = fileInput?.files?.[0] || null;
    const obj = formToObject(form);
    delete obj.anexo_file;
    obj.valor = Number(obj.valor);
    const btn = document.getElementById('btnSalvarReceita');
    btn.disabled = true;
    try {
      if (arquivo) {
        btn.textContent = 'Enviando anexo...';
        obj.anexo_path = await uploadAnexo(arquivo, 'receitas');
      }
      await dbInsert('receitas', obj);
      toast('Entrada lançada', 'success');
      closeModal();
      renderReceitas();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  });
}

// ------------------------------------------------------------
// CUSTOS: CONTROLE DE COMBUSTÍVEL (horímetro do trator + bomba)
// O equipamento sempre "dorme" abastecido, então a diferença de
// horímetro/contador da bomba entre dois abastecimentos indica os
// litros realmente consumidos — conferida com a quantidade informada.
// ------------------------------------------------------------
async function renderCustosCombustivel() {
  const content = document.getElementById('custosContent');
  content.innerHTML = loading();
  const registros = await dbSelect('abastecimentos', { order: { col: 'data', asc: false }, limit: 200 });
  const equipamentosConhecidos = [...new Set(registros.map(r => r.equipamento).filter(Boolean))];

  const totalLitros = registros.reduce((s, r) => s + Number(r.litros_calculados || 0), 0);
  const totalHoras = registros.reduce((s, r) => s + Number(r.horas_trabalhadas || 0), 0);
  const consumoMedio = totalHoras ? (totalLitros / totalHoras) : 0;

  content.innerHTML = `
    <p class="text-sm text-gray-600 mb-4">Como o equipamento sempre "dorme" abastecido, a diferença entre o contador final e inicial da bomba mostra os litros realmente usados desde o último abastecimento — e você confere isso com a quantidade abastecida informada (leitura da bomba/nota).</p>
    <div class="flex justify-end mb-3"><button id="btnNovoAbastecimento" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo abastecimento</button></div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('⛽', totalLitros.toFixed(0) + ' L', 'Litros calculados (histórico)')}
      ${statCard('⏱️', totalHoras.toFixed(1) + ' h', 'Horas trabalhadas (histórico)')}
      ${statCard('📊', consumoMedio.toFixed(2) + ' L/h', 'Consumo médio geral')}
      ${statCard('🚜', equipamentosConhecidos.length, 'Equipamento(s) registrado(s)')}
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b">
          <th class="py-2 px-3">Data</th><th>Equipamento</th><th class="text-right">Horas trab.</th>
          <th class="text-right">Litros (bomba)</th><th class="text-right">Informado</th><th class="text-right">Diferença</th>
          <th class="text-right">L/h</th><th class="text-right">Valor</th><th></th>
        </tr></thead>
        <tbody>${registros.map(r => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(r.data)}</td>
          <td>${escapeHtml(r.equipamento)}</td>
          <td class="text-right">${r.horas_trabalhadas ?? '-'}</td>
          <td class="text-right">${r.litros_calculados ?? '-'}</td>
          <td class="text-right">${r.quantidade_abastecida ?? '-'}</td>
          <td class="text-right ${Math.abs(r.diferenca_litros || 0) > 2 ? 'text-red-600 font-medium' : 'text-green-700'}">${r.diferenca_litros ?? '-'}</td>
          <td class="text-right">${r.consumo_l_h ?? '-'}</td>
          <td class="text-right">${r.valor ? fmtMoney(r.valor) : '-'}</td>
          <td class="text-right px-3"><button data-id="${r.id}" class="btnExcluirAbastecimento text-gray-400 hover:text-red-600">🗑️</button></td>
        </tr>`).join('') || `<tr><td colspan="9" class="text-center text-gray-400 py-6">Nenhum abastecimento registrado</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovoAbastecimento').onclick = () => formAbastecimento(equipamentosConhecidos);
  document.querySelectorAll('.btnExcluirAbastecimento').forEach(b => {
    b.onclick = async () => {
      if (!confirmAction('Excluir este registro de abastecimento? (Um lançamento de custo vinculado, se houver, não é excluído automaticamente.)')) return;
      await dbDelete('abastecimentos', b.dataset.id);
      toast('Registro excluído', 'success');
      pageCustos();
    };
  });
}

function formAbastecimento(equipamentosConhecidos = []) {
  showModal('Novo abastecimento (por horímetro)', `
    <form id="formAbastecimento" class="grid md:grid-cols-2 gap-x-3">
      <datalist id="listaEquipamentos">${equipamentosConhecidos.map(e => `<option value="${escapeHtml(e)}">`).join('')}</datalist>
      ${fld('Equipamento *', `<input name="equipamento" list="listaEquipamentos" required class="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" placeholder="ex.: Trator Massey 275">`)}
      ${fld('Data', inp('data', todayISO(), 'date'))}
      <div class="col-span-2 border-t pt-2 mt-1 mb-1"><p class="text-xs font-semibold text-gray-500 uppercase">Horímetro do trator</p></div>
      ${fld('Horímetro inicial *', inp('horimetro_trator_inicial', '', 'number', 'step="0.1" required'))}
      ${fld('Horímetro final *', inp('horimetro_trator_final', '', 'number', 'step="0.1" required'))}
      <div class="col-span-2 border-t pt-2 mt-1 mb-1"><p class="text-xs font-semibold text-gray-500 uppercase">Contador da bomba de combustível</p></div>
      ${fld('Contador inicial *', inp('horimetro_bomba_inicial', '', 'number', 'step="0.01" required'))}
      ${fld('Contador final *', inp('horimetro_bomba_final', '', 'number', 'step="0.01" required'))}
      <div class="col-span-2 bg-gray-50 border rounded-md p-3 text-sm my-2">
        <div class="flex justify-between"><span>Horas trabalhadas:</span><strong id="calcHoras">0</strong></div>
        <div class="flex justify-between"><span>Litros calculados (bomba):</span><strong id="calcLitros">0</strong></div>
        <div class="flex justify-between"><span>Consumo:</span><strong id="calcConsumo">0 L/h</strong></div>
      </div>
      ${fld('Quantidade abastecida informada (L) *', inp('quantidade_abastecida', '', 'number', 'step="0.01" required'), 'col-span-2')}
      <div class="col-span-2 text-sm -mt-2 mb-2">Diferença (informado − calculado pela bomba): <strong id="calcDiferenca">0</strong> L</div>
      ${fld('Valor pago (R$, opcional — gera lançamento em Custos)', inp('valor', '', 'number', 'step="0.01"'), 'col-span-2')}
      ${fld('Observações', txt('observacoes'), 'col-span-2')}
      <div class="col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" id="btnSalvarAbastecimento" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `, 'max-w-2xl');

  const form = document.getElementById('formAbastecimento');
  function recalcular() {
    const hi = parseFloat(form.horimetro_trator_inicial.value) || 0;
    const hf = parseFloat(form.horimetro_trator_final.value) || 0;
    const bi = parseFloat(form.horimetro_bomba_inicial.value) || 0;
    const bf = parseFloat(form.horimetro_bomba_final.value) || 0;
    const informado = parseFloat(form.quantidade_abastecida.value) || 0;
    const horas = hf - hi;
    const litros = bf - bi;
    const consumo = horas > 0 ? litros / horas : 0;
    const diferenca = informado - litros;
    document.getElementById('calcHoras').textContent = horas.toFixed(2);
    document.getElementById('calcLitros').textContent = litros.toFixed(2);
    document.getElementById('calcConsumo').textContent = consumo.toFixed(2) + ' L/h';
    const difEl = document.getElementById('calcDiferenca');
    difEl.textContent = diferenca.toFixed(2);
    difEl.className = Math.abs(diferenca) > 2 ? 'text-red-600' : 'text-green-700';
  }
  ['horimetro_trator_inicial', 'horimetro_trator_final', 'horimetro_bomba_inicial', 'horimetro_bomba_final', 'quantidade_abastecida'].forEach(n => {
    form[n].addEventListener('input', recalcular);
  });

  document.getElementById('btnCancelar').onclick = closeModal;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(form);
    const hi = Number(obj.horimetro_trator_inicial), hf = Number(obj.horimetro_trator_final);
    const bi = Number(obj.horimetro_bomba_inicial), bf = Number(obj.horimetro_bomba_final);
    const informado = Number(obj.quantidade_abastecida);
    if (hf < hi) { toast('O horímetro final do trator não pode ser menor que o inicial', 'error'); return; }
    if (bf < bi) { toast('O contador final da bomba não pode ser menor que o inicial', 'error'); return; }
    const horas = Number((hf - hi).toFixed(2));
    const litros = Number((bf - bi).toFixed(2));
    const consumo = horas > 0 ? Number((litros / horas).toFixed(3)) : null;
    const diferenca = Number((informado - litros).toFixed(2));
    const valor = obj.valor ? Number(obj.valor) : null;

    const btn = document.getElementById('btnSalvarAbastecimento');
    btn.disabled = true;
    try {
      let custoId = null;
      if (valor) {
        const custo = await dbInsert('custos', {
          categoria: 'combustivel',
          descricao: `Abastecimento - ${obj.equipamento}`,
          valor,
          data: obj.data,
          observacoes: `Gerado automaticamente pelo controle de combustível (${litros.toFixed(2)} L calculados na bomba / ${informado} L informados).`,
        });
        custoId = custo.id;
      }
      await dbInsert('abastecimentos', {
        equipamento: obj.equipamento,
        data: obj.data,
        horimetro_trator_inicial: hi,
        horimetro_trator_final: hf,
        horas_trabalhadas: horas,
        horimetro_bomba_inicial: bi,
        horimetro_bomba_final: bf,
        litros_calculados: litros,
        quantidade_abastecida: informado,
        diferenca_litros: diferenca,
        consumo_l_h: consumo,
        valor,
        custo_id: custoId,
        observacoes: obj.observacoes || null,
      });
      toast('Abastecimento registrado' + (custoId ? ' e custo lançado' : ''), 'success');
      closeModal();
      pageCustos();
    } catch (err) {
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------
// PÁGINA: ORÇAMENTOS (plano de contas: orçado x realizado)
// ------------------------------------------------------------
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let orcamentoAno = new Date().getFullYear();

function fmtMoneyCompact(v) {
  if (!v) return 'R$ 0';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

async function pageOrcamentos() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();

  const inicioAno = `${orcamentoAno}-01-01`;
  const fimAno = `${orcamentoAno}-12-31`;
  const [orcamentos, custosDoAno] = await Promise.all([
    dbSelect('orcamentos', { filters: [{ col: 'ano', val: orcamentoAno }] }),
    dbSelect('custos', { select: 'categoria,valor,data', filters: [{ col: 'data', op: 'gte', val: inicioAno }, { col: 'data', op: 'lte', val: fimAno }] }),
  ]);

  const orcadoMap = {};
  orcamentos.forEach(o => {
    orcadoMap[o.categoria] = orcadoMap[o.categoria] || {};
    orcadoMap[o.categoria][o.mes] = Number(o.valor_orcado) || 0;
  });
  const realizadoMap = {};
  custosDoAno.forEach(c => {
    const mes = Number((c.data || '').slice(5, 7));
    if (!mes) return;
    realizadoMap[c.categoria] = realizadoMap[c.categoria] || {};
    realizadoMap[c.categoria][mes] = (realizadoMap[c.categoria][mes] || 0) + Number(c.valor || 0);
  });

  const categorias = CATEGORIAS_CUSTO.filter(c => c.value !== 'outros');
  const totalCategoriaOrcado = (cat) => Object.values(orcadoMap[cat] || {}).reduce((s, v) => s + v, 0);
  const totalCategoriaRealizado = (cat) => Object.values(realizadoMap[cat] || {}).reduce((s, v) => s + v, 0);
  const totalMesOrcado = (mes) => categorias.reduce((s, c) => s + ((orcadoMap[c.value] || {})[mes] || 0), 0);
  const totalMesRealizado = (mes) => categorias.reduce((s, c) => s + ((realizadoMap[c.value] || {})[mes] || 0), 0);
  const totalAnoOrcado = categorias.reduce((s, c) => s + totalCategoriaOrcado(c.value), 0);
  const totalAnoRealizado = categorias.reduce((s, c) => s + totalCategoriaRealizado(c.value), 0);
  const pctExecutado = totalAnoOrcado ? (totalAnoRealizado / totalAnoOrcado * 100) : 0;

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Orçamentos</h1>
      <div class="flex items-center gap-2">
        <button id="btnAnoAnterior" class="px-2 py-1.5 rounded-md border bg-white text-sm">◀</button>
        <span class="font-medium text-sm">${orcamentoAno}</span>
        <button id="btnAnoProximo" class="px-2 py-1.5 rounded-md border bg-white text-sm">▶</button>
      </div>
    </div>

    <p class="text-sm text-gray-600 mb-4">Defina o valor orçado por categoria (plano de contas) e mês — clique em um valor para editar. O "realizado" (linha menor, embaixo) é calculado automaticamente a partir dos lançamentos em Custos.</p>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      ${statCard('📐', fmtMoney(totalAnoOrcado), 'Total orçado no ano')}
      ${statCard('💸', fmtMoney(totalAnoRealizado), 'Total realizado no ano')}
      ${statCard(pctExecutado > 100 ? '⚠️' : '✅', pctExecutado.toFixed(0) + '%', 'Executado do orçamento')}
      ${statCard('➖', fmtMoney(totalAnoOrcado - totalAnoRealizado), 'Saldo (orçado − realizado)')}
    </div>

    <div class="bg-white border rounded-lg overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 px-3 sticky left-0 bg-white">Categoria</th>
            ${MESES_ABREV.map(m => `<th class="text-center px-1 py-2">${m}</th>`).join('')}
            <th class="text-center px-2 py-2 border-l">Total</th>
          </tr>
        </thead>
        <tbody>
          ${categorias.map(c => `
            <tr class="border-b last:border-0 align-top">
              <td class="py-2 px-3 sticky left-0 bg-white font-medium whitespace-nowrap">${c.label}</td>
              ${MESES_ABREV.map((m, i) => {
                const mes = i + 1;
                const orc = (orcadoMap[c.value] || {})[mes] || 0;
                const rea = (realizadoMap[c.value] || {})[mes] || 0;
                const over = rea > orc && orc > 0;
                return `<td class="text-center px-1 py-1.5">
                  <input type="number" step="0.01" data-cat="${c.value}" data-mes="${mes}" value="${orc || ''}" placeholder="0" class="orcadoInput w-16 text-center border rounded px-1 py-0.5 text-xs">
                  <div class="text-[10px] mt-0.5 ${over ? 'text-red-600 font-semibold' : 'text-gray-400'}">${rea ? fmtMoneyCompact(rea) : '—'}</div>
                </td>`;
              }).join('')}
              <td class="text-center px-2 py-1.5 border-l">
                <div class="font-semibold">${fmtMoneyCompact(totalCategoriaOrcado(c.value))}</div>
                <div class="text-[10px] ${totalCategoriaRealizado(c.value) > totalCategoriaOrcado(c.value) && totalCategoriaOrcado(c.value) > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}">${fmtMoneyCompact(totalCategoriaRealizado(c.value))}</div>
              </td>
            </tr>
          `).join('')}
          <tr class="font-semibold border-t-2 bg-gray-50">
            <td class="py-2 px-3 sticky left-0 bg-gray-50">Total</td>
            ${MESES_ABREV.map((m, i) => {
              const mes = i + 1;
              return `<td class="text-center px-1 py-1.5">
                <div>${fmtMoneyCompact(totalMesOrcado(mes))}</div>
                <div class="text-[10px] font-normal ${totalMesRealizado(mes) > totalMesOrcado(mes) && totalMesOrcado(mes) > 0 ? 'text-red-600' : 'text-gray-400'}">${fmtMoneyCompact(totalMesRealizado(mes))}</div>
              </td>`;
            }).join('')}
            <td class="text-center px-2 py-1.5 border-l">
              <div>${fmtMoneyCompact(totalAnoOrcado)}</div>
              <div class="text-[10px] font-normal ${totalAnoRealizado > totalAnoOrcado ? 'text-red-600' : 'text-gray-400'}">${fmtMoneyCompact(totalAnoRealizado)}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-gray-400 mt-2">Em cada mês: valor de cima é o orçado (editável); valor de baixo é o realizado (somado dos lançamentos de Custos daquele mês/categoria).</p>
  `;

  document.getElementById('btnAnoAnterior').onclick = () => { orcamentoAno--; pageOrcamentos(); };
  document.getElementById('btnAnoProximo').onclick = () => { orcamentoAno++; pageOrcamentos(); };

  document.querySelectorAll('.orcadoInput').forEach(inputEl => {
    inputEl.addEventListener('change', async () => {
      const categoria = inputEl.dataset.cat;
      const mes = Number(inputEl.dataset.mes);
      const valor = Number(inputEl.value) || 0;
      inputEl.disabled = true;
      try {
        await dbUpsert('orcamentos', { categoria, ano: orcamentoAno, mes, valor_orcado: valor }, 'categoria,ano,mes');
      } catch (err) { /* erro já mostrado */ }
      pageOrcamentos();
    });
  });
}

// ------------------------------------------------------------
// PÁGINA: RELATÓRIOS
// ------------------------------------------------------------
async function pageRelatorios() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();

  const animaisAtivos = await dbSelect('animais', { select: 'id,categoria,sexo,lote_id,identificacao', filters: [{ col: 'status', val: 'ativo' }] });
  const porLote = {};
  animaisAtivos.forEach(a => { if (a.lote_id) { (porLote[a.lote_id] = porLote[a.lote_id] || []).push(a); } });
  const totalAtivos = animaisAtivos.length;

  const linhas = lotesCache.map(l => {
    const animaisDoLote = porLote[l.id] || [];
    return {
      pasto: l.pasto ? l.pasto.nome : '— sem pasto —',
      lote: l.nome,
      finalidade: l.finalidade || '-',
      qtd: animaisDoLote.length,
      pct: totalAtivos ? (animaisDoLote.length / totalAtivos * 100).toFixed(1) : '0.0',
    };
  }).sort((a, b) => b.qtd - a.qtd);

  const semLote = animaisAtivos.filter(a => !a.lote_id).length;

  content.innerHTML = `
    <h1 class="text-xl font-bold mb-4">Relatórios</h1>

    <div class="bg-white border rounded-lg p-4 mb-6">
      <div class="flex justify-between items-center mb-3">
        <h2 class="font-semibold">Rebanho atual — quantidade e pasto por lote</h2>
        <button id="btnExportRebanho" class="text-sm px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200">Exportar CSV</button>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Pasto</th><th>Lote</th><th>Finalidade</th><th class="text-right">Qtd. animais</th><th class="text-right">% do rebanho</th></tr></thead>
        <tbody>
          ${linhas.map(l => `<tr class="border-b last:border-0"><td class="py-1">${escapeHtml(l.pasto)}</td><td>${escapeHtml(l.lote)}</td><td>${escapeHtml(l.finalidade)}</td><td class="text-right font-medium">${l.qtd}</td><td class="text-right">${l.pct}%</td></tr>`).join('')}
          <tr class="font-semibold border-t-2"><td class="py-1" colspan="3">Total (rebanho ativo)</td><td class="text-right">${totalAtivos}</td><td class="text-right">100%</td></tr>
          ${semLote ? `<tr class="text-amber-600"><td class="py-1" colspan="3">Sem lote definido</td><td class="text-right">${semLote}</td><td></td></tr>` : ''}
        </tbody>
      </table>
    </div>

    <div class="bg-white border rounded-lg p-4 mb-6">
      <h2 class="font-semibold mb-1">📊 Exportar dados para Power BI / Excel</h2>
      <p class="text-sm text-gray-500 mb-3">Cada botão baixa um arquivo .csv detalhado (uma linha por registro), pronto para importar no Power BI (<em>Obter Dados → Texto/CSV</em>) ou no Excel. Para um painel que atualiza sozinho sem precisar exportar toda vez, veja a dica de conexão direta ao banco de dados logo abaixo.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <button id="btnExpAnimaisLocalizacao" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">🐄 Animais e localização (pasto/lote)</button>
        <button id="btnExpMovimentacoes" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">🚚 Movimentações entre pastos</button>
        <button id="btnExpVendas" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">💵 Vendas de animais</button>
        <button id="btnExpCustos" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">💰 Custos</button>
        <button id="btnExpReceitas" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">💵 Entradas financeiras</button>
        <button id="btnExpReproducao" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">🍼 Eventos reprodutivos</button>
        <button id="btnExpSanidade" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">💉 Registros sanitários</button>
        <button id="btnExpPesagens" class="text-sm px-3 py-2 rounded-md border bg-gray-50 hover:bg-gray-100 text-left">⚖️ Pesagens (histórico e GMD)</button>
      </div>
      <p class="text-xs text-gray-400 mt-3">💡 Dica: no Power BI Desktop, use <em>Obter Dados → Banco de Dados PostgreSQL</em> com os dados de conexão do seu projeto Supabase (Configurações → Database) para montar um painel que atualiza sozinho, sem precisar exportar CSV toda vez. Peça pra mim se quiser o passo a passo.</p>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Rebanho por categoria</h2>
        <table class="w-full text-sm">
          <thead><tr class="text-left text-gray-500 border-b"><th class="py-1">Categoria</th><th class="text-right">Qtd.</th></tr></thead>
          <tbody>${Object.entries(animaisAtivos.reduce((acc, a) => { acc[a.categoria] = (acc[a.categoria] || 0) + 1; return acc; }, {})).map(([cat, qtd]) => `<tr class="border-b last:border-0"><td class="py-1">${escapeHtml(cat)}</td><td class="text-right">${qtd}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="bg-white border rounded-lg p-4">
        <h2 class="font-semibold mb-3">Reprodução</h2>
        <div id="repRelatorio" class="text-sm text-gray-500">Calculando...</div>
      </div>
    </div>

    <div class="bg-white border rounded-lg p-4 mt-6">
      <h2 class="font-semibold mb-3">Sanidade — últimos 90 dias</h2>
      <div id="sanRelatorio" class="text-sm text-gray-500">Calculando...</div>
    </div>

    <div class="bg-white border rounded-lg p-4 mt-6">
      <h2 class="font-semibold mb-3">Custos — últimos 90 dias</h2>
      <div id="custoRelatorio" class="text-sm text-gray-500">Calculando...</div>
    </div>
  `;

  document.getElementById('btnExportRebanho').onclick = () => {
    const headers = ['Pasto', 'Lote', 'Finalidade', 'Qtd. animais', '% do rebanho'];
    const rows = linhas.map(l => [l.pasto, l.lote, l.finalidade, l.qtd, l.pct + '%']);
    downloadCSV('rebanho_por_lote_pasto.csv', headers, rows);
  };

  document.getElementById('btnExpAnimaisLocalizacao').onclick = async () => {
    const todos = await dbSelect('animais', { select: '*, lote:lotes(id,nome,pasto:pastos(id,nome))', order: { col: 'identificacao' } });
    const headers = ['Brinco', 'Nome', 'Sexo', 'Categoria', 'Raça', 'Data Nascimento', 'Peso Atual', 'Status', 'Lote', 'Pasto', 'Data Saída', 'Motivo Saída', 'Valor Venda'];
    const rows = todos.map(a => [
      a.identificacao, a.nome || '', a.sexo, a.categoria, a.raca || '',
      a.data_nascimento || '', a.peso_atual ?? '', a.status,
      a.lote ? a.lote.nome : '', a.lote && a.lote.pasto ? a.lote.pasto.nome : '',
      a.data_saida || '', a.motivo_saida || '', a.valor_venda ?? '',
    ]);
    downloadCSV('animais_localizacao.csv', headers, rows);
  };

  document.getElementById('btnExpMovimentacoes').onclick = async () => {
    const dados = await dbSelect('movimentacoes', { select: '*, lote:lotes(nome), origem:pasto_origem_id(nome), destino:pasto_destino_id(nome)', order: { col: 'data', asc: false } });
    const headers = ['Data', 'Lote', 'Pasto Origem', 'Pasto Destino', 'Qtd Animais', 'Responsável', 'Motivo'];
    const rows = dados.map(m => [m.data, m.lote ? m.lote.nome : '', m.origem ? m.origem.nome : '', m.destino ? m.destino.nome : '', m.quantidade_animais ?? '', m.responsavel || '', m.motivo || '']);
    downloadCSV('movimentacoes.csv', headers, rows);
  };

  document.getElementById('btnExpVendas').onclick = async () => {
    const dados = await dbSelect('baixas', { select: '*, animal:animal_id(identificacao,categoria)', filters: [{ col: 'tipo', val: 'venda' }], order: { col: 'data', asc: false } });
    const headers = ['Data', 'Referência da Venda', 'Brinco', 'Categoria', 'Comprador', 'Valor'];
    const rows = dados.map(b => [b.data, b.venda_ref || '', b.animal ? b.animal.identificacao : '', b.animal ? b.animal.categoria : '', b.comprador || '', b.valor ?? '']);
    downloadCSV('vendas.csv', headers, rows);
  };

  document.getElementById('btnExpCustos').onclick = async () => {
    const dados = await dbSelect('custos', { select: '*, lote:lote_id(nome), pasto:pasto_id(nome)', order: { col: 'data', asc: false } });
    const headers = ['Data', 'Categoria', 'Descrição', 'Valor', 'Lote', 'Pasto', 'NF Número', 'NF Fornecedor'];
    const rows = dados.map(c => [c.data, CATEGORIAS_CUSTO.find(x => x.value === c.categoria)?.label || c.categoria, c.descricao, c.valor, c.lote ? c.lote.nome : '', c.pasto ? c.pasto.nome : '', c.nf_numero || '', c.nf_fornecedor || '']);
    downloadCSV('custos.csv', headers, rows);
  };

  document.getElementById('btnExpReceitas').onclick = async () => {
    const dados = await dbSelect('receitas', { order: { col: 'data', asc: false } });
    const headers = ['Data', 'Categoria', 'Descrição', 'Valor'];
    const rows = dados.map(r => [r.data, CATEGORIAS_RECEITA.find(x => x.value === r.categoria)?.label || r.categoria, r.descricao, r.valor]);
    downloadCSV('entradas_financeiras.csv', headers, rows);
  };

  document.getElementById('btnExpReproducao').onclick = async () => {
    const dados = await dbSelect('eventos_reprodutivos', { select: '*, animal:animal_id(identificacao)', order: { col: 'data', asc: false } });
    const headers = ['Data', 'Brinco', 'Tipo Evento', 'Resultado', 'Data Prevista Parto', 'Touro/Sêmen', 'Peso Bezerro', 'Sexo Bezerro'];
    const rows = dados.map(e => [e.data, e.animal ? e.animal.identificacao : '', e.tipo_evento, e.resultado || '', e.data_prevista_parto || '', e.touro_semen || '', e.peso_bezerro ?? '', e.sexo_bezerro || '']);
    downloadCSV('eventos_reprodutivos.csv', headers, rows);
  };

  document.getElementById('btnExpSanidade').onclick = async () => {
    const dados = await dbSelect('registros_sanitarios', { select: '*, animal:animal_id(identificacao), lote:lote_id(nome)', order: { col: 'data', asc: false } });
    const headers = ['Data', 'Brinco', 'Lote', 'Tipo', 'Nome', 'Medicamento', 'Custo', 'Status'];
    const rows = dados.map(r => [r.data, r.animal ? r.animal.identificacao : '', r.lote ? r.lote.nome : '', r.tipo, r.nome, r.medicamento || '', r.custo ?? '', r.status || '']);
    downloadCSV('registros_sanitarios.csv', headers, rows);
  };

  document.getElementById('btnExpPesagens').onclick = async () => {
    const dados = await dbSelect('pesagens', { select: '*, animal:animal_id(identificacao)', order: { col: 'animal_id' } });
    const porAnimalExp = {};
    dados.forEach(p => { (porAnimalExp[p.animal_id] = porAnimalExp[p.animal_id] || []).push(p); });
    const headers = ['Brinco', 'Data', 'Peso (kg)', 'Variação (kg)', 'Dias desde pesagem anterior', 'GMD (kg/dia)', 'Observações'];
    const rows = [];
    Object.values(porAnimalExp).forEach(lista => {
      const ordenadas = [...lista].sort((a, b) => (a.data < b.data ? -1 : (a.data > b.data ? 1 : 0)));
      ordenadas.forEach((p, i) => {
        const c = comparativoPeso(ordenadas.slice(0, i + 1).reverse());
        rows.push([
          p.animal ? p.animal.identificacao : '', p.data, p.peso,
          c && c.anterior ? c.diferenca : '', c && c.anterior ? c.dias : '', c && c.anterior ? c.gmd : '',
          p.observacoes || '',
        ]);
      });
    });
    downloadCSV('pesagens_gmd.csv', headers, rows);
  };

  // reprodução
  const eventos = await dbSelect('eventos_reprodutivos');
  const gestacoes = computeGestacoesAtivas(eventos);
  const dataLimite90 = addDaysISO(todayISO(), -90);
  const diag90 = eventos.filter(e => e.tipo_evento === 'diagnostico_gestacao' && e.data >= dataLimite90);
  const t = taxaPrenhez(diag90);
  document.getElementById('repRelatorio').innerHTML = `
    <p>Taxa de prenhez (90 dias): <strong>${t.pct.toFixed(1)}%</strong> (${t.positivos}/${t.total})</p>
    <p>Gestações em andamento: <strong>${gestacoes.length}</strong></p>
    <p>Partos previstos nos próximos 30 dias: <strong>${gestacoes.filter(g => g.dias_restantes <= 30 && g.dias_restantes >= 0).length}</strong></p>
  `;

  // sanidade
  const registrosSan = await dbSelect('registros_sanitarios', { filters: [{ col: 'data', op: 'gte', val: dataLimite90 }] });
  const baixas90 = await dbSelect('baixas', { filters: [{ col: 'data', op: 'gte', val: dataLimite90 }] });
  const doencas90 = registrosSan.filter(r => r.tipo === 'doenca').length;
  const mortes90 = baixas90.filter(b => b.tipo === 'morte').length;
  const custoSanitario90 = registrosSan.reduce((s, r) => s + Number(r.custo || 0), 0);
  document.getElementById('sanRelatorio').innerHTML = `
    <p>Registros de doença: <strong>${doencas90}</strong> · Mortes: <strong>${mortes90}</strong> · Vendas: <strong>${baixas90.filter(b => b.tipo === 'venda').length}</strong></p>
    <p>Custo sanitário no período: <strong>${fmtMoney(custoSanitario90)}</strong></p>
  `;

  // custos
  const custos90 = await dbSelect('custos', { filters: [{ col: 'data', op: 'gte', val: dataLimite90 }] });
  const totalCustos90 = custos90.reduce((s, c) => s + Number(c.valor || 0), 0);
  const custoPorAnimal = totalAtivos ? totalCustos90 / totalAtivos : 0;
  const breakdown = {};
  custos90.forEach(c => { breakdown[c.categoria] = (breakdown[c.categoria] || 0) + Number(c.valor || 0); });
  document.getElementById('custoRelatorio').innerHTML = `
    <p>Total de custos (90 dias): <strong>${fmtMoney(totalCustos90)}</strong> · Custo médio por animal ativo: <strong>${fmtMoney(custoPorAnimal)}</strong></p>
    <ul class="mt-2 list-disc pl-5">${Object.entries(breakdown).map(([cat, v]) => `<li>${CATEGORIAS_CUSTO.find(c => c.value === cat)?.label || cat}: ${fmtMoney(v)}</li>`).join('') || '<li>Nenhum custo no período</li>'}</ul>
  `;
}

function downloadCSV(filename, headers, rows) {
  const escapeCsv = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const csv = [headers.map(escapeCsv).join(';'), ...rows.map(r => r.map(escapeCsv).join(';'))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
