import { defineHandler } from 'void';
import { env } from 'void/env';
import { parseCsv, rowsToQuestions, sheetCsvUrl } from '../../src/csv';

export const POST = defineHandler(async (c) => {
  if (env.CONTROL_KEY && c.req.header('x-control-key') !== env.CONTROL_KEY) return c.json({ error: 'Bad control key' }, 401);
  const body = await c.req.json<{ url?: string }>();
  const url = sheetCsvUrl(body.url);
  if (!url) return c.json({ error: 'Not a Google Sheets URL' }, 400);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) return c.json({ error: 'Sheet fetch failed (' + r.status + '). Is it shared as "anyone with the link"?' }, 502);
  return c.json({ questions: rowsToQuestions(parseCsv(await r.text())) });
});
