import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TavernThemeDefs } from './components/theme/TavernThemeDefs'
import { TooltipProvider } from './components/ui/tooltip'
import { I18nProvider } from './lib/i18n'
import { queryClient } from './lib/query-client'
import { installGlobalRuntimeLogHandlers } from './lib/runtime-log'

installGlobalRuntimeLogHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <TavernThemeDefs />
            <App />
            <Toaster
              position="top-right"
              richColors
              theme="dark"
              toastOptions={{
                classNames: {
                  actionButton: 'ref-toast-action',
                  cancelButton: 'ref-toast-cancel',
                  closeButton: 'ref-toast-close',
                  description: 'ref-toast-description',
                  error: 'ref-toast-error',
                  info: 'ref-toast-info',
                  loading: 'ref-toast-loading',
                  success: 'ref-toast-success',
                  title: 'ref-toast-title',
                  toast: 'ref-toast',
                  warning: 'ref-toast-warning',
                },
              }}
            />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)
