-- ============================================================
-- Sistema de Manejo de Gado - Schema do banco de dados
-- Para rodar no SQL Editor do Supabase (https://app.supabase.com)
-- ============================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PERFIS DE USUÁRIO (complementa auth.users do Supabase)
-- ------------------------------------------------------------
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null default 'peao' check (papel in ('admin','gerente','veterinario','peao')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PASTOS
-- ------------------------------------------------------------
create table if not exists pastos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  area_ha numeric,
  capacidade_ua numeric,
  tipo_pastagem text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LOTES (grupos de animais que se movem juntos entre pastos)
-- ------------------------------------------------------------
create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  finalidade text, -- cria, recria, engorda, leite, reprodutores...
  pasto_id uuid references pastos(id) on delete set null,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ANIMAIS
-- ------------------------------------------------------------
create table if not exists animais (
  id uuid primary key default gen_random_uuid(),
  identificacao text not null, -- numero do brinco
  nome text,
  sexo text not null check (sexo in ('M','F')),
  categoria text not null, -- bezerro, bezerra, novilha, novilho, vaca, touro, boi, garrote...
  raca text,
  data_nascimento date,
  peso_atual numeric,
  peso_atual_data date,
  lote_id uuid references lotes(id) on delete set null,
  mae_id uuid references animais(id) on delete set null,
  pai_id uuid references animais(id) on delete set null,
  status text not null default 'ativo' check (status in ('ativo','vendido','morto','descartado')),
  data_saida date,
  motivo_saida text,
  valor_venda numeric,
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_animais_lote on animais(lote_id);
create index if not exists idx_animais_status on animais(status);

-- ------------------------------------------------------------
-- MOVIMENTAÇÕES (histórico de mudança de pasto)
-- ------------------------------------------------------------
create table if not exists movimentacoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references lotes(id) on delete set null,
  animal_id uuid references animais(id) on delete set null, -- opcional, movimentação individual
  pasto_origem_id uuid references pastos(id) on delete set null,
  pasto_destino_id uuid references pastos(id) on delete set null,
  data date not null default current_date,
  quantidade_animais integer,
  responsavel text,
  motivo text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PROTOCOLOS REPRODUTIVOS
-- ------------------------------------------------------------
create table if not exists protocolos_reprodutivos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text, -- IATF, monta natural, TE, etc
  descricao text,
  etapas jsonb, -- [{ "dia": 0, "procedimento": "Implante + BE" }, ...]
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- EVENTOS REPRODUTIVOS (inseminação, diagnóstico, parto, secagem, descarte)
-- ------------------------------------------------------------
create table if not exists eventos_reprodutivos (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references animais(id) on delete cascade,
  protocolo_id uuid references protocolos_reprodutivos(id) on delete set null,
  tipo_evento text not null check (tipo_evento in ('inseminacao','monta_natural','diagnostico_gestacao','parto','secagem','descarte_reprodutivo','aborto')),
  data date not null,
  resultado text, -- positivo / negativo / pendente (para diagnostico)
  data_prevista_parto date, -- calculado automaticamente na inseminação/monta
  touro_semen text,
  peso_bezerro numeric,
  sexo_bezerro text,
  bezerro_id uuid references animais(id) on delete set null,
  dificuldade_parto text,
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_eventos_animal on eventos_reprodutivos(animal_id);
create index if not exists idx_eventos_tipo on eventos_reprodutivos(tipo_evento);
create index if not exists idx_eventos_data_prevista on eventos_reprodutivos(data_prevista_parto);

-- ------------------------------------------------------------
-- PROTOCOLOS ALIMENTARES
-- ------------------------------------------------------------
create table if not exists protocolos_alimentares (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria_alvo text, -- bezerro, recria, engorda, vaca lactante...
  descricao text,
  composicao jsonb, -- [{ "ingrediente": "Silagem de milho", "quantidade": "20kg/animal/dia" }]
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- APLICAÇÕES DE PROTOCOLO ALIMENTAR EM LOTES
-- ------------------------------------------------------------
create table if not exists aplicacoes_alimentares (
  id uuid primary key default gen_random_uuid(),
  protocolo_id uuid not null references protocolos_alimentares(id) on delete cascade,
  lote_id uuid references lotes(id) on delete cascade,
  data_inicio date not null default current_date,
  data_fim date,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- REGISTROS SANITÁRIOS (doenças, vacinas, tratamentos)
-- ------------------------------------------------------------
create table if not exists registros_sanitarios (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid references animais(id) on delete cascade,
  lote_id uuid references lotes(id) on delete set null, -- para tratamento em grupo
  tipo text not null check (tipo in ('doenca','vacina','tratamento','exame','vermifugo')),
  nome text not null, -- nome da doença/vacina/procedimento
  data date not null default current_date,
  medicamento text,
  dose text,
  carencia_dias integer,
  custo numeric,
  veterinario text,
  status text default 'em_tratamento' check (status in ('em_tratamento','curado','obito','cronico')),
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sanitarios_animal on registros_sanitarios(animal_id);

-- ------------------------------------------------------------
-- BAIXAS (mortes, vendas, descartes)
-- ------------------------------------------------------------
create table if not exists baixas (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references animais(id) on delete cascade,
  tipo text not null check (tipo in ('morte','venda','descarte')),
  data date not null default current_date,
  motivo text,
  valor numeric,
  comprador text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CUSTOS
-- ------------------------------------------------------------
create table if not exists custos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('alimentacao','sanidade','mao_de_obra','infraestrutura','reproducao','impostos_taxas','outros')),
  descricao text not null,
  valor numeric not null,
  data date not null default current_date,
  lote_id uuid references lotes(id) on delete set null,
  pasto_id uuid references pastos(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Qualquer usuário autenticado (login criado por você no Supabase)
-- pode ler e escrever em todas as tabelas. Isso é adequado para
-- uma equipe fechada de uma fazenda (não é um sistema público).
-- ============================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'perfis','pastos','lotes','animais','movimentacoes',
    'protocolos_reprodutivos','eventos_reprodutivos',
    'protocolos_alimentares','aplicacoes_alimentares',
    'registros_sanitarios','baixas','custos'
  ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "acesso_equipe_%1$s" on %1$I;', t);
    execute format(
      'create policy "acesso_equipe_%1$s" on %1$I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- Cria perfil automaticamente quando um novo usuário é criado no Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfis (id, nome, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'peao')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
