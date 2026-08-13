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
        <div class="text-4xl mb-3">🐄⚙️</div>
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
          <div class="text-4xl mb-2">🐄</div>
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
  { route: 'custos', label: 'Custos', icon: '💰' },
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
          <div class="font-bold text-lg">🐄 Manejo de Gado</div>
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
          <span class="font-bold">🐄 Manejo de Gado</span>
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
  custos: pageCustos,
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

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Rebanho</h1>
      <button id="btnNovoAnimal" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo animal</button>
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
          <th class="py-2 px-3">Brinco</th><th>Nome</th><th>Sexo</th><th>Categoria</th><th>Lote</th><th>Pasto</th><th>Status</th><th></th>
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
              <td><span class="px-2 py-0.5 rounded-full text-xs ${statusBadge(a.status)}">${a.status}</span></td>
              <td class="text-right px-3"><button data-id="${a.id}" class="btnEditarAnimal text-gray-400 hover:text-brand-700">✏️</button></td>
            </tr>`).join('') || `<tr><td colspan="8" class="text-center text-gray-400 py-6">Nenhum animal encontrado</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovoAnimal').onclick = () => formAnimal();
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

  const [animal, eventos, sanitarios, baixasList] = await Promise.all([
    dbSelectOne('animais', id, '*, lote:lotes(id,nome,pasto:pastos(id,nome)), mae:mae_id(id,identificacao)'),
    dbSelect('eventos_reprodutivos', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
    dbSelect('registros_sanitarios', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
    dbSelect('baixas', { filters: [{ col: 'animal_id', val: id }], order: { col: 'data', asc: false } }),
  ]);

  if (!animal) {
    content.innerHTML = `<p class="text-gray-500">Animal não encontrado.</p><a href="#animais" class="text-brand-700 hover:underline">Voltar</a>`;
    return;
  }

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
        <div class="font-medium">${animal.peso_atual ? animal.peso_atual + ' kg' : '—'} ${animal.peso_atual_data ? '(' + fmtDate(animal.peso_atual_data) + ')' : ''}</div>
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

    ${baixasList.length ? `
    <div class="bg-white border rounded-lg p-4 mt-6">
      <h2 class="font-semibold mb-3">Baixa registrada</h2>
      ${baixasList.map(b => `<p class="text-sm">${b.tipo} em ${fmtDate(b.data)} — ${escapeHtml(b.motivo || '')} ${b.valor ? '· ' + fmtMoney(b.valor) : ''}</p>`).join('')}
    </div>` : ''}
  `;
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
      <button id="btnNovoPasto" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo pasto</button>
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
    <div class="flex justify-end mb-3"><button id="btnNovoEvento" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Registrar evento</button></div>
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
// PÁGINA: CUSTOS
// ------------------------------------------------------------
const CATEGORIAS_CUSTO = [
  { value: 'alimentacao', label: 'Alimentação' },
  { value: 'sanidade', label: 'Sanidade' },
  { value: 'mao_de_obra', label: 'Mão de obra' },
  { value: 'infraestrutura', label: 'Infraestrutura' },
  { value: 'reproducao', label: 'Reprodução' },
  { value: 'impostos_taxas', label: 'Impostos e taxas' },
  { value: 'outros', label: 'Outros' },
];
let custosFiltro = { de: addDaysISO(todayISO(), -30), ate: todayISO(), categoria: '' };

async function pageCustos() {
  const content = document.getElementById('page-content');
  content.innerHTML = loading();
  await refreshCaches();
  const filters = [{ col: 'data', op: 'gte', val: custosFiltro.de }, { col: 'data', op: 'lte', val: custosFiltro.ate }];
  if (custosFiltro.categoria) filters.push({ col: 'categoria', val: custosFiltro.categoria });
  const custos = await dbSelect('custos', { select: '*, lote:lote_id(nome), pasto:pasto_id(nome)', filters, order: { col: 'data', asc: false } });
  const total = custos.reduce((s, c) => s + Number(c.valor || 0), 0);
  const porCategoria = {};
  custos.forEach(c => { porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + Number(c.valor || 0); });

  content.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
      <h1 class="text-xl font-bold">Custos</h1>
      <button id="btnNovoCusto" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md">+ Novo lançamento</button>
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
        <thead><tr class="text-left text-gray-500 border-b"><th class="py-2 px-3">Data</th><th>Categoria</th><th>Descrição</th><th>Lote/Pasto</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>${custos.map(c => `<tr class="border-b last:border-0">
          <td class="py-2 px-3">${fmtDate(c.data)}</td>
          <td>${CATEGORIAS_CUSTO.find(x => x.value === c.categoria)?.label || c.categoria}</td>
          <td>${escapeHtml(c.descricao)}</td>
          <td>${c.lote ? escapeHtml(c.lote.nome) : (c.pasto ? escapeHtml(c.pasto.nome) : '-')}</td>
          <td class="text-right">${fmtMoney(c.valor)}</td>
          <td class="text-right px-3"><button data-id="${c.id}" class="btnExcluirCusto text-gray-400 hover:text-red-600">🗑️</button></td>
        </tr>`).join('') || `<tr><td colspan="6" class="text-center text-gray-400 py-6">Nenhum custo lançado no período</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btnNovoCusto').onclick = () => formCusto();
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
      <div class="flex justify-end gap-2 mt-2">
        <button type="button" id="btnCancelar" class="px-4 py-2 text-sm rounded-md border">Cancelar</button>
        <button type="submit" class="px-4 py-2 text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('selLoteCusto').innerHTML = loteOptions('', false);
  document.getElementById('selPastoCusto').innerHTML = pastoOptions('');
  document.getElementById('btnCancelar').onclick = closeModal;
  document.getElementById('formCusto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = formToObject(e.target);
    obj.valor = Number(obj.valor);
    try {
      await dbInsert('custos', obj);
      toast('Custo lançado', 'success');
      closeModal();
      pageCustos();
    } catch (err) {}
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