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
      { path: 'overview', lazy: async () => ({ Component: (await import('./features/overview/Overview')).Overview }) },
      { path: 'users', lazy: async () => ({ Component: (await import('./features/users/Users')).Users }) },
      { path: 'users/:userId', lazy: async () => ({ Component: (await import('./features/users/UserDetail')).UserDetail }) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
