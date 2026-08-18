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

type Row = { data: unknown; expiresAt?: Date }

const memory = new Map<string, Row>()

export const isPersistent = Boolean(sql)

export async function put(table: 'sessions' | 'fit_passes', id: string, data: unknown, expiresAt?: Date) {
  if (!sql) {
    memory.set(`${table}:${id}`, { data, expiresAt })
    return
  }
  if (table === 'sessions') {
    await sql`
      insert into sessions (id, data, expires_at) values (${id}, ${sql.json(data as never)}, ${expiresAt!})
      on conflict (id) do update set data = excluded.data, expires_at = excluded.expires_at
    `
  } else {
    await sql`
      insert into fit_passes (id, data) values (${id}, ${sql.json(data as never)})
      on conflict (id) do update set data = excluded.data
    `
  }
}

export async function get<T>(table: 'sessions' | 'fit_passes', id: string): Promise<T | null> {
  if (!sql) {
    const row = memory.get(`${table}:${id}`)
    if (!row) return null
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      memory.delete(`${table}:${id}`)
      return null
    }
    return row.data as T
  }
  const rows =
    table === 'sessions'
      ? await sql`select data from sessions where id = ${id} and expires_at > now()`
      : await sql`select data from fit_passes where id = ${id}`
  return (rows[0]?.data as T) ?? null
}

export async function remove(table: 'sessions' | 'fit_passes', id: string) {
  if (!sql) {
    memory.delete(`${table}:${id}`)
    return
  }
  if (table === 'sessions') await sql`delete from sessions where id = ${id}`
  else await sql`delete from fit_passes where id = ${id}`
}

/** ses_xxx / fp_xxx 형태의 짧은 식별자. */
export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}
