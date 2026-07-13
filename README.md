# Controle de Pacientes — Instituto Dr. Pablo Santos

Substitui a planilha Excel de controle de tratamentos. Stack: Supabase
(Postgres + Auth) + front-end estático em Vite/React, sem servidor próprio.

## 1. Configurar o Supabase

1. No painel do seu projeto Supabase, abra o **SQL Editor** e rode, nesta
   ordem, o conteúdo de cada arquivo em `supabase/migrations/`:
   1. `0001_schema.sql` — tabelas (`dentistas`, `pacientes`, `consultas`,
      `parcelas`) e RLS
   2. `0002_seed_dentistas.sql` — os 12 dentistas
   3. `0003_functions.sql` — geração automática de consultas/parcelas
   4. `0004_views.sql` — views de status (`consultas_status`,
      `pacientes_status`)
2. Em **Project Settings → API**, copie a **Project URL** e a chave
   **anon/public** (aqui chamada de "publishable key").
3. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_PUBLISHABLE_KEY=...
   ```
   O `.env` já está no `.gitignore` — nunca commitar.

### Criar 1 login por dentista

Isso precisa ser feito manualmente pelo painel (criação de conta não é algo
automatizável com segurança). Em **Authentication → Users → Add user**,
crie um usuário (e-mail + senha) para cada um dos 12 dentistas. Eles usam
esse e-mail/senha na tela de login do sistema.

## 2. Rodar localmente

Requer [Node.js](https://nodejs.org) (LTS). Para instalação permanente no
Windows, baixe o instalador `.msi` no site oficial e rode-o (isso não foi
feito automaticamente aqui porque alterar configurações do sistema/PATH é
uma ação que cabe a você).

Como atalho para já poder rodar o projeto agora, uma cópia portátil do
Node.js v24.18.0 LTS foi baixada em `.tools/node-v24.18.0-win-x64/` (fora do
git — pasta local, não é parte do projeto). `npm install` e `npm run build`
já foram testados com ela e funcionam. Para usá-la temporariamente no
PowerShell:

```powershell
$env:PATH = "C:\controle-pacientes-instituto\.tools\node-v24.18.0-win-x64;$env:PATH"
npm install
npm run dev
```

Depois de instalar o Node.js "de verdade" no sistema, pode apagar a pasta
`.tools/` e usar `node`/`npm` normalmente em qualquer terminal.

## 3. Deploy (Vercel ou Netlify)

Build estático padrão do Vite:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Configure as variáveis de ambiente `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` no painel do Vercel/Netlify (mesmas do
`.env` local). Sem domínio próprio por enquanto — o domínio `*.vercel.app`
ou `*.netlify.app` gerado automaticamente serve.

## Decisões e suposições assumidas neste projeto

- **consultas_feitas**: não é campo manual — é sempre calculado a partir de
  `consultas.realizada = true` (view `pacientes_status`), pra não
  dessincronizar.
- **Sem auditoria** (quem alterou o quê) por enquanto — pode ser adicionado
  depois sem redesenhar o schema.
- **Parcelas vencem mensalmente a partir de `data_inicio`** (parcela 1 =
  `data_inicio`, parcela 2 = +1 mês, ...), confirmado.
- **O gap de 6 meses do implante desloca as consultas, mas não o vencimento
  das parcelas** — só a "data de finalização prevista" (view
  `pacientes_status.data_fim_prevista`) soma os 6 meses por cima da última
  parcela quando há implante no plano. **Conferido célula a célula contra a
  fórmula original da aba "Modelo"** (`M4`, `N4`, ..., `AD4`, `L4`) do
  arquivo `PLANILHAS CONTROLE DE PACIENTES ... (2).xlsx` — a lógica de
  `ROUND((i-1)*(num_parcelas-1)/(num_consultas-1))` + gap de 6 meses quando
  `i >= consulta_implante_numero` bate exatamente com a função
  `gerar_plano_paciente`.
- **Editar um paciente não regenera automaticamente consultas/parcelas**
  (evita apagar `realizada`/`paga` já registrados). A tela de edição tem um
  botão "Regenerar plano" pra recalcular do zero quando necessário.
- **RLS**: qualquer dentista autenticado vê e edita todos os pacientes (não
  só os seus), replicando a aba de busca da planilha que já cruzava todas
  as abas. Dá pra restringir por dentista depois, se quiserem.

## Perguntas ainda em aberto

- Onde exatamente exibir o status ADIMPLENTE/INADIMPLENTE além da tela de
  busca (ex: também no formulário de paciente?) — confirmar com o Pablo.
