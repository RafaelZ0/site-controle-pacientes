-- =========================================================
-- Criar e editar dentista passam a exigir a senha de administrador
-- (mesmo mecanismo de excluir_paciente_admin: verificação no banco,
-- nunca no front-end). As policies de INSERT/UPDATE diretas da
-- migration 0011 são bloqueadas; só as funções abaixo (security
-- definer) conseguem gravar.
-- =========================================================

create policy "bloquear insert direto de dentistas"
on dentistas as restrictive for insert
with check (false);

create policy "bloquear update direto de dentistas"
on dentistas as restrictive for update
using (false);

create or replace function criar_dentista_admin(p_nome text, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from admin_config where senha_hash = crypt(p_senha, senha_hash)
  ) then
    raise exception 'Senha de administrador incorreta';
  end if;

  insert into dentistas (nome) values (p_nome);
end;
$$;

create or replace function editar_dentista_admin(
  p_id uuid,
  p_nome text,
  p_ativo boolean,
  p_senha text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from admin_config where senha_hash = crypt(p_senha, senha_hash)
  ) then
    raise exception 'Senha de administrador incorreta';
  end if;

  update dentistas set nome = p_nome, ativo = p_ativo where id = p_id;
end;
$$;
