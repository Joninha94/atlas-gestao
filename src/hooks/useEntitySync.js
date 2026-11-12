import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";

// Sincroniza um array de entidades (estado React local, fonte da verdade pra
// renderização) com uma tabela do Supabase, mandando só o que de fato mudou
// desde a última sincronização — em vez de regravar tudo a cada alteração
// (como o app original fazia com window.storage). Cada item precisa de um
// `id` estável (gerado no cliente via uid(), que agora produz UUID v4 — ver
// src/utils/id.js).
export function useEntitySync({ table, rows, ready, toDb, onError }) {
  const prevRef = useRef(null);

  useEffect(() => {
    if (!ready) return;
    const prev = prevRef.current;
    prevRef.current = rows;
    if (prev === null) return; // primeira atribuição = veio do load(), nada novo pra sincronizar

    const prevById = new Map(prev.map((r) => [r.id, r]));
    const nextIds = new Set(rows.map((r) => r.id));

    const toUpsert = rows.filter((row) => {
      const old = prevById.get(row.id);
      return !old || JSON.stringify(old) !== JSON.stringify(row);
    });
    const toDelete = prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id);

    (async () => {
      try {
        if (toUpsert.length > 0) {
          const { error } = await supabase.from(table).upsert(toUpsert.map(toDb));
          if (error) throw error;
        }
        if (toDelete.length > 0) {
          const { error } = await supabase.from(table).delete().in("id", toDelete);
          if (error) throw error;
        }
      } catch (err) {
        console.error(`Falha ao sincronizar "${table}" com o Supabase:`, err);
        onError?.(err);
      }
    })();
  }, [rows, ready, table]);
}
