// Drive: pastas automáticas por cliente e lixeira de 20 dias.
// Portado de produtiva-gestao/packages/core/src/drive.ts.

export const TRASH_RETENTION_DAYS = 20;
const DAY_MS = 86_400_000;

export function isTrashExpired(deletedAt, now, days = TRASH_RETENTION_DAYS) {
  return now.getTime() - new Date(deletedAt).getTime() >= days * DAY_MS;
}

export function trashDaysLeft(deletedAt, now, days = TRASH_RETENTION_DAYS) {
  const elapsed = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / DAY_MS);
  return Math.max(0, days - elapsed);
}

// Pastas criadas quando o Drive do cliente é aberto pela primeira vez.
export const DEFAULT_CLIENT_FOLDERS = [
  { name: "Societário", shared: true, kind: "PADRAO" }, // contrato social, cartão CNPJ, alvará
  { name: "Fiscal", shared: false, kind: "PADRAO" },
  { name: "Pessoal", shared: false, kind: "PADRAO" },
  { name: "Contábil", shared: false, kind: "PADRAO" },
  { name: "WhatsApp", shared: false, kind: "SISTEMA" },
];

// Nome de arquivo seguro para o caminho no Storage.
export function safeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

// Pasta e todas as subpastas (para mandar à lixeira ou restaurar juntas).
export function descendantFolderIds(folders, rootId) {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}
