import { NotFoundPage, RouteError } from '@gc/ui-kit';
import type { RouteObject } from 'react-router';
import { Home } from './Home';
import { Layout } from './Layout';

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
