import { setupServer } from 'msw/node';

/** One MSW server for every test file (started in setup.ts); tests add handlers with server.use(...). */
export const server = setupServer();
