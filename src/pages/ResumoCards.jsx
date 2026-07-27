import { useEffect, useState } from "react";
import { Users, Clock, Wallet, CalendarDays, Wrench } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ResumoCards({
  dentistaId,
  dentistaNome,
  statusFiltro,
  onToggleFiltro,
}) {
  const [stats, setStats] = useState({
    total: null,
    emAtraso: null,
    inadimplentes: null,
    proximas7dias: null,
    configPendente: null,
  });

  useEffect(() => {
    async function carregar() {
      const hoje = new Date();
      const em7dias = new Date();
      em7dias.setDate(hoje.getDate() + 7);
      const hojeISO = hoje.toISOString().slice(0, 10);
      const em7ISO = em7dias.toISOString().slice(0, 10);

      function base() {
        let q = supabase.from("pacientes_status").select("id", { count: "exact", head: true });
        if (dentistaId) q = q.eq("dentista_id", dentistaId);
        return q;
      }

      const [totalRes, atrasoRes, inadimplentesRes, proximasRes, configRes] = await Promise.all([
        base(),
        base().eq("tem_consulta_atrasada", true),
        base().eq("status_pagamento", "INADIMPLENTE"),
        base().gte("proxima_consulta", hojeISO).lte("proxima_consulta", em7ISO),
        base().eq("configuracao_pendente", true),
      ]);

      setStats({
        total: totalRes.count ?? 0,
        emAtraso: atrasoRes.count ?? 0,
        inadimplentes: inadimplentesRes.count ?? 0,
        proximas7dias: proximasRes.count ?? 0,
        configPendente: configRes.count ?? 0,
      });
    }
    carregar();
  }, [dentistaId]);

  const cards = [
    { label: "Total de pacientes", valor: stats.total, Icon: Users, acento: "", filtro: null },
    {
      label: "Em atraso",
      valor: stats.emAtraso,
      Icon: Clock,
      acento: "acento-alerta",
      filtro: "EM_ATRASO",
    },
    {
      label: "Inadimplentes",
      valor: stats.inadimplentes,
      Icon: Wallet,
      acento: "acento-alerta",
      filtro: "INADIMPLENTE",
    },
    {
      label: "Consultas nos próximos 7 dias",
      valor: stats.proximas7dias,
      Icon: CalendarDays,
      acento: "acento-teal",
      filtro: "PROX_7_DIAS",
    },
    {
      label: "Configuração pendente",
      valor: stats.configPendente,
      Icon: Wrench,
      acento: "acento-alerta",
      filtro: "CONFIG_PENDENTE",
    },
  ];

  return (
    <div className="resumo-cards-wrap">
      {dentistaId && dentistaNome && (
        <p className="resumo-cards-subtitulo">Resumo de {dentistaNome}</p>
      )}
      <div className="resumo-cards">
        {cards.map((c) => {
          const ativo = c.filtro !== null && statusFiltro === c.filtro;
          return (
            <button
              type="button"
              className={`stat-card${ativo ? " stat-card-ativo" : ""}`}
              key={c.label}
              onClick={() => onToggleFiltro?.(c.filtro)}
            >
              <div className="stat-card-topo">
                <span className="stat-card-numero">{c.valor ?? "—"}</span>
                <c.Icon size={20} strokeWidth={1.75} className={`stat-card-icone ${c.acento}`} />
              </div>
              <span className="stat-card-label">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
