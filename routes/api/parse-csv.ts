import { defineHandler } from 'void';
import { parseCsv, rowsToQuestions } from '../../src/csv';

export const POST = defineHandler(async (c) => {
  const body = await c.req.json<{ csv?: string }>();
  return c.json({ questions: rowsToQuestions(parseCsv(String(body.csv ?? ''))) });
});
