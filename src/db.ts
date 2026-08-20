import postgres from 'postgres'

// .env를 읽는다. 배포 환경에는 파일이 없고 플랫폼이 환경변수를 직접 넣어 주므로 없어도 넘어간다.
if (process.env.DATABASE_URL === undefined) {
  try {
    process.loadEnvFile()
  } catch {
    // .env 없음 — 무시
  }
}

/**
 * DATABASE_URL이 있으면 Postgres, 없으면 메모리에 담는다.
 * 메모리 모드는 프로세스가 죽으면 사라지므로 로컬 개발 전용이다.
 */
const url = process.env.DATABASE_URL
const sql = url
  ? postgres(url, {
      // Supabase 풀러(pgbouncer)는 prepared statement를 지원하지 않는다.
      prepare: false,
      ssl: url.includes('localhost') ? false : 'require',
    })
  : null

type Table = 'sessions' | 'fit_passes' | 'uploads'
type Row = { data: unknown; expiresAt?: Date }

const memory = new Map<string, Row>()

export const isPersistent = Boolean(sql)

/** sessions·uploads는 TTL이 있다. fit_passes는 없다. */
const HAS_TTL: Record<Table, boolean> = { sessions: true, fit_passes: false, uploads: true }

export async function put(table: Table, id: string, data: unknown, expiresAt?: Date) {
  if (!sql) {
    memory.set(`${table}:${id}`, { data, expiresAt })
    return
  }
  if (HAS_TTL[table]) {
    await sql`
      insert into ${sql(table)} (id, data, expires_at) values (${id}, ${sql.json(data as never)}, ${expiresAt!})
      on conflict (id) do update set data = excluded.data, expires_at = excluded.expires_at
    `
  } else {
    await sql`
      insert into ${sql(table)} (id, data) values (${id}, ${sql.json(data as never)})
      on conflict (id) do update set data = excluded.data
    `
  }
}

export async function get<T>(table: Table, id: string): Promise<T | null> {
  if (!sql) {
    const row = memory.get(`${table}:${id}`)
    if (!row) return null
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      memory.delete(`${table}:${id}`)
      return null
    }
    return row.data as T
  }
  const rows = HAS_TTL[table]
    ? await sql`select data from ${sql(table)} where id = ${id} and expires_at > now()`
    : await sql`select data from ${sql(table)} where id = ${id}`
  return (rows[0]?.data as T) ?? null
}

export async function remove(table: Table, id: string) {
  if (!sql) {
    memory.delete(`${table}:${id}`)
    return
  }
  await sql`delete from ${sql(table)} where id = ${id}`
}

/** ses_xxx / fp_xxx / upl_xxx 형태의 짧은 식별자. */
export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}
