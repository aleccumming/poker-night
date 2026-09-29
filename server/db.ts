export type Row = Record<string, unknown>;
export type Stmt = [text: string, params?: unknown[]];

/** The one thing the server needs from a database: run statements together, all-or-nothing. */
export interface Db {
  /** Runs the statements in a single transaction and returns each statement's rows. */
  tx(stmts: Stmt[], opts?: { readOnly?: boolean }): Promise<Row[][]>;
}

export async function one<T = Row>(db: Db, text: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db.tx([[text, params]]);
  return rows as T[];
}
