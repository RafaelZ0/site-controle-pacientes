import { useEffect, useState } from "react";
import { Users, Clock, Wallet, CalendarDays } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ResumoCards() {
  const [stats, setStats] = useState({
    total: null,
    emAtraso: null,
    inadimplentes: null,
    proximas7dias: null,
  });

  useEffect(() => {
    async function carregar() {
      const hoje = new Date();
      const em7dias = new Date();
      em7dias.setDate(hoje.getDate() + 7);
      const hojeISO = hoje.toISOString().slice(0, 10);
      const em7ISO = em7dias.toISOString().slice(0, 10);

      const [totalRes, atrasoRes, inadimplentesRes, proximasRes] = await Promise.all([
        supabase.from("pacientes").select("id", { count: "exact", head: true }),
        supabase.from("consultas_status").select("paciente_id").eq("status", "EM ATRASO"),
        supabase
          .from("pacientes_status")
          .select("id", { count: "exact", head: true })
          .eq("status_pagamento", "INADIMPLENTE"),
        supabase
          .from("consultas")
          .select("id", { count: "exact", head: true })
          .eq("realizada", false)
          .gte("data_prevista", hojeISO)
          .lte("data_prevista", em7ISO),
      ]);

      const pacientesEmAtraso = new Set((atrasoRes.data ?? []).map((c) => c.paciente_id)).size;

      setStats({
        total: totalRes.count ?? 0,
        emAtraso: pacientesEmAtraso,
        inadimplentes: inadimplentesRes.count ?? 0,
        proximas7dias: proximasRes.count ?? 0,
      });
    }
    carregar();
  }, []);

  const cards = [
    { label: "Total de pacientes", valor: stats.total, Icon: Users, acento: "" },
    { label: "Em atraso", valor: stats.emAtraso, Icon: Clock, acento: "acento-alerta" },
    { label: "Inadimplentes", valor: stats.inadimplentes, Icon: Wallet, acento: "acento-alerta" },
    {
      label: "Consultas nos próximos 7 dias",
      valor: stats.proximas7dias,
      Icon: CalendarDays,
      acento: "acento-teal",
    },
  ];

  return (
    <div className="resumo-cards">
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-card-topo">
            <span className="stat-card-numero">{c.valor ?? "—"}</span>
            <c.Icon size={20} strokeWidth={1.75} className={`stat-card-icone ${c.acento}`} />
          </div>
          <span className="stat-card-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
