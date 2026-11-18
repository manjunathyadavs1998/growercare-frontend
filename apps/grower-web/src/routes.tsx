import { NotFoundPage, RouteError } from '@gc/ui-kit';
import type { RouteObject } from 'react-router';
import { Layout } from './Layout';

// Screens are lazy route chunks (FE-01 budget: the shell alone is ~150 KB of the 170 KB initial JS).
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./features/cases/MyCases')).MyCases }) },
      { path: 'cases/new', lazy: async () => ({ Component: (await import('./features/cases/RaiseCase')).RaiseCase }) },
      { path: 'cases/:caseId', lazy: async () => ({ Component: (await import('./features/cases/CaseDetail')).CaseDetail }) },
      { path: 'profile', lazy: async () => ({ Component: (await import('./features/profile/Profile')).Profile }) },
      { path: 'farms', lazy: async () => ({ Component: (await import('./features/farms/Farms')).Farms }) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
