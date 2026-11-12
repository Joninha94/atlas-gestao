import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient.js";

const LS_KEY = "atlas_simples_empresa_id";

async function fetchEmpresaData(empresaId) {
  const [{ data: atv }, { data: hist }] = await Promise.all([
    supabase.from("simples_atividades").select("*").eq("empresa_id", empresaId)
      .order("principal", { ascending: false }).order("created_at"),
    supabase.from("simples_historico").select("*").eq("empresa_id", empresaId)
      .order("mes", { ascending: false }).limit(24),
  ]);
  return { atividades: atv || [], historico: hist || [] };
}

export function useSimplesData() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaAtivaId, setEmpresaAtivaIdRaw] = useState(
    () => localStorage.getItem(LS_KEY) || null
  );
  const [atividades, setAtividades] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);

  const empresa = empresas.find(e => e.id === empresaAtivaId) ?? null;

  function persistId(id) {
    setEmpresaAtivaIdRaw(id);
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("simples_empresas").select("*").order("created_at");
    const lista = data || [];
    setEmpresas(lista);

    const savedId = localStorage.getItem(LS_KEY);
    const activeId = lista.find(e => e.id === savedId)?.id ?? lista[0]?.id ?? null;
    persistId(activeId);

    if (activeId) {
      const { atividades: atv, historico: hist } = await fetchEmpresaData(activeId);
      setAtividades(atv);
      setHistorico(hist);
    } else {
      setAtividades([]);
      setHistorico([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Empresa ────────────────────────────────────────────────────────────────

  async function selectEmpresa(id) {
    persistId(id);
    if (!id) { setAtividades([]); setHistorico([]); return; }
    const { atividades: atv, historico: hist } = await fetchEmpresaData(id);
    setAtividades(atv);
    setHistorico(hist);
  }

  async function createEmpresa(data) {
    const { data: created } = await supabase.from("simples_empresas").insert(data).select().single();
    if (created) {
      setEmpresas(prev => [...prev, created]);
      persistId(created.id);
      setAtividades([]);
      setHistorico([]);
    }
    return created;
  }

  async function updateEmpresa(id, data) {
    const { data: updated } = await supabase.from("simples_empresas")
      .update(data).eq("id", id).select().single();
    if (updated) setEmpresas(prev => prev.map(e => e.id === updated.id ? updated : e));
    return updated;
  }

  async function saveEmpresa(data) {
    if (empresa) return updateEmpresa(empresa.id, data);
    return createEmpresa({ nome: "Minha Empresa", regime: "simples", folha_12: 0, ...data });
  }

  async function deleteEmpresa(id) {
    await supabase.from("simples_empresas").delete().eq("id", id);
    setEmpresas(prev => {
      const next = prev.filter(e => e.id !== id);
      if (empresaAtivaId === id) {
        const nextId = next[0]?.id ?? null;
        persistId(nextId);
        if (nextId) fetchEmpresaData(nextId).then(({ atividades: a, historico: h }) => { setAtividades(a); setHistorico(h); });
        else { setAtividades([]); setHistorico([]); }
      }
      return next;
    });
  }

  // ── Atividades ─────────────────────────────────────────────────────────────

  async function addAtividade(atividade, empresaIdOverride) {
    const empresaId = empresaIdOverride ?? empresa?.id;
    if (!empresaId) return;
    const { data } = await supabase.from("simples_atividades")
      .insert({ ...atividade, empresa_id: empresaId }).select().single();
    if (data) setAtividades(prev => [data, ...prev]);
  }

  async function removeAtividade(id) {
    await supabase.from("simples_atividades").delete().eq("id", id);
    setAtividades(prev => prev.filter(a => a.id !== id));
  }

  async function setPrincipal(id) {
    const updates = atividades.map(a => ({ id: a.id, principal: a.id === id }));
    await Promise.all(updates.map(u =>
      supabase.from("simples_atividades").update({ principal: u.principal }).eq("id", u.id)
    ));
    setAtividades(prev => prev.map(a => ({ ...a, principal: a.id === id })));
  }

  // ── Histórico ──────────────────────────────────────────────────────────────

  async function upsertHistorico(mes, faturamento, simplePago, observacao, folhaMensal) {
    const empresaId = empresa?.id;
    if (!empresaId) return;
    const payload = {
      empresa_id: empresaId,
      mes,
      faturamento: parseFloat(faturamento) || 0,
      simples_pago: simplePago != null ? parseFloat(simplePago) : null,
      observacao: observacao || null,
      folha_mensal: folhaMensal != null && folhaMensal !== "" ? parseFloat(folhaMensal) : null,
    };
    const { data } = await supabase.from("simples_historico")
      .upsert(payload, { onConflict: "user_id,empresa_id,mes" })
      .select().single();
    if (data) {
      setHistorico(prev => {
        const idx = prev.findIndex(h => h.mes === mes);
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [data, ...prev].sort((a, b) => b.mes.localeCompare(a.mes));
      });
    }
  }

  async function removeHistorico(id) {
    await supabase.from("simples_historico").delete().eq("id", id);
    setHistorico(prev => prev.filter(h => h.id !== id));
  }

  // ── Importação em lote ────────────────────────────────────────────────────
  // batch: [{ empresa: {nome,cnpj,folha12}, atividade: {cnae_code,cnae_nome,anexo,fator_r}|null, meses: [{mes:"YYYY-MM",faturamento}] }]
  // onProgress: ({ atual, total, nome }) => void
  // Retorna: [{ nome, sucesso, erro, id }]
  async function batchImport(batch, onProgress) {
    const resultados = [];
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      onProgress?.({ atual: i + 1, total: batch.length, nome: item.empresa.nome });
      try {
        const { data: emp } = await supabase.from("simples_empresas").insert({
          nome: item.empresa.nome,
          cnpj: item.empresa.cnpj || null,
          regime: "simples",
          folha_12: item.empresa.folha12 || 0,
        }).select().single();

        if (!emp) throw new Error("Falha ao criar empresa");

        if (item.atividade) {
          await supabase.from("simples_atividades").insert({
            empresa_id: emp.id,
            cnae_code: item.atividade.cnae_code || null,
            cnae_nome: item.atividade.cnae_nome || `Anexo ${item.atividade.anexo}`,
            anexo: item.atividade.anexo,
            fator_r: item.atividade.fator_r || false,
            principal: true,
          });
        }

        const mesesValidos = (item.meses || []).filter(m => m.faturamento > 0);
        if (mesesValidos.length > 0) {
          await supabase.from("simples_historico").insert(
            mesesValidos.map(m => ({
              empresa_id: emp.id,
              mes: m.mes,
              faturamento: m.faturamento,
              folha_mensal: m.folha_mensal || null,
            }))
          );
        }

        resultados.push({ nome: item.empresa.nome, sucesso: true, id: emp.id });
      } catch (e) {
        resultados.push({ nome: item.empresa.nome, sucesso: false, erro: e.message });
      }
    }
    await loadAll();
    return resultados;
  }

  return {
    empresas, empresa,
    selectEmpresa, createEmpresa, updateEmpresa, saveEmpresa, deleteEmpresa,
    atividades, addAtividade, removeAtividade, setPrincipal,
    historico, upsertHistorico, removeHistorico,
    batchImport,
    loading, reload: loadAll,
  };
}
