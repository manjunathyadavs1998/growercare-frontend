import { I18nProvider } from '@gc/i18n';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { messages } from './messages';
import { routes } from './routes';

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider catalogs={messages}>
        <RouterProvider router={createBrowserRouter(routes)} />
      </I18nProvider>
    </QueryClientProvider>
  );
}
