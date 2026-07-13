-- =========================================================
-- Novos campos em pacientes: nome_completo, telefone, cpf, updated_at
-- =========================================================

alter table pacientes rename column nome to nome_completo;

alter table pacientes add column telefone text;
alter table pacientes add column cpf text unique;
alter table pacientes add column updated_at timestamptz not null default now();

-- cpf é único mas opcional: unique constraint do Postgres permite múltiplos
-- NULLs (cada NULL é distinto dos demais), então "sem CPF" nunca colide.
-- O front-end deve enviar null (não string vazia) quando o campo estiver
-- em branco, senão duas strings vazias colidiriam no unique.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_pacientes_updated_at
before update on pacientes
for each row
execute function set_updated_at();
