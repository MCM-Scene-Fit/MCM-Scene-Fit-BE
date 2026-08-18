import { serve } from '@hono/node-server'
import { app } from './app'
import { isPersistent } from './db'

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, () => {
  console.log(`MCM SCENE FIT API  http://localhost:${port}`)
  console.log(`저장소: ${isPersistent ? 'Postgres' : '메모리 (프로세스 종료 시 사라짐)'}`)
  console.log(`AI 설명: ${process.env.GEMINI_API_KEY ? '켜짐' : '꺼짐 (규칙 엔진 문장 사용)'}`)
})
