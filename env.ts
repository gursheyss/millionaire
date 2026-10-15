import { defineEnv, string } from 'void/env';

export default defineEnv({
  CONTROL_KEY: string().default(''),
});
