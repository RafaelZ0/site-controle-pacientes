-- =========================================================
-- Permite cadastrar/editar dentistas pela interface (antes só dava
-- pra ler; inserir/atualizar exigia o SQL Editor ou o Table Editor).
-- =========================================================

create policy "authenticated_insert_dentistas" on dentistas
  for insert to authenticated with check (true);

create policy "authenticated_update_dentistas" on dentistas
  for update to authenticated using (true) with check (true);
