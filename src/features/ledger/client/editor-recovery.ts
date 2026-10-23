export type EditorValues = Record<string, string>;
/** Page-memory fallback only. Keys include database, owner, business, and editor. */
const recoveries = new Map<
  string,
  { generation: number; values: EditorValues }
>();
let generation = 0;
function scope(
  database: string,
  userId: string,
  businessId: string,
  key: string,
) {
  return JSON.stringify([database, userId, businessId, key]);
}
export function rememberEditor(
  database: string,
  userId: string,
  businessId: string,
  key: string,
  values: EditorValues,
) {
  const token = ++generation;
  recoveries.set(scope(database, userId, businessId, key), {
    generation: token,
    values: structuredClone(values),
  });
  return token;
}
export function recoveredEditor(
  database: string,
  userId: string,
  businessId: string,
  key: string,
): EditorValues | null {
  const saved = recoveries.get(scope(database, userId, businessId, key));
  return saved ? structuredClone(saved.values) : null;
}
export function acknowledgeEditor(
  database: string,
  userId: string,
  businessId: string,
  key: string,
  token: number,
) {
  const id = scope(database, userId, businessId, key);
  if (recoveries.get(id)?.generation === token) recoveries.delete(id);
}
export function forgetEditor(
  database: string,
  userId: string,
  businessId: string,
  key: string,
) {
  recoveries.delete(scope(database, userId, businessId, key));
}
export type EditorPersistenceHandle = { persist: () => Promise<boolean> };
/** A navigation flush also waits for edits queued while its first write was running. */
export async function settleEditorWrites(
  writer: { current: Promise<boolean> },
  first: Promise<boolean>,
) {
  let pending = first;
  let saved = await pending;
  while (writer.current !== pending) {
    pending = writer.current;
    saved = await pending;
  }
  return saved;
}
