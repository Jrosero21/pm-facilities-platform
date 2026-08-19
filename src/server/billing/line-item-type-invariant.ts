// PURE shared module — NO "server-only", NO DB/env/IO.
// Used to detect tenant vocabulary drift between a shared enum and tenant stored rows.

export type VocabularyDrift = {
  missingRows: string[];
  customKeys: string[];
};

export function findVocabularyDrift(
  enumValues: readonly string[],
  rowKeys: readonly string[],
): VocabularyDrift {
  const enumSet = new Set(enumValues);
  const rowSet = new Set(rowKeys);

  const missingRows: string[] = [];
  for (const v of enumSet) {
    if (!rowSet.has(v)) missingRows.push(v);
  }

  const customKeys: string[] = [];
  for (const k of rowSet) {
    if (!enumSet.has(k)) customKeys.push(k);
  }

  missingRows.sort();
  customKeys.sort();

  return { missingRows, customKeys };
}
