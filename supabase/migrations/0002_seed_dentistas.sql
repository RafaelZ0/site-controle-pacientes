-- Dentistas (protesistas) cadastrados atualmente na planilha.
insert into dentistas (nome) values
  ('Debora N.'),
  ('Francys F.'),
  ('Isabela L.'),
  ('Isadora B.'),
  ('Luís G.'),
  ('Mariana Grilo'),
  ('Mariana Neves'),
  ('Mateus M.'),
  ('Melissa C.'),
  ('Mylena B.'),
  ('Pablo S.'),
  ('Sérgio F.')
on conflict (nome) do nothing;
