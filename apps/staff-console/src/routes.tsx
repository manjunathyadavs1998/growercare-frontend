import { NotFoundPage, RouteError } from '@gc/ui-kit';
import type { RouteObject } from 'react-router';
import { Layout } from './Layout';

// Screens are lazy route chunks; the shell stays small.
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./features/queue/Queue')).Queue }) },
      { path: 'cases/:caseId', lazy: async () => ({ Component: (await import('./features/case/StaffCase')).StaffCase }) },
      { path: 'growers', lazy: async () => ({ Component: (await import('./features/growers/GrowerLookup')).GrowerLookup }) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
