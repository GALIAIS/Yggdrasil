import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircleIcon, RefreshCcwIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { logErrorBoundary } from '@/lib/runtime-log'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryLabels {
  title: string
  description: string
  reset: string
  reload: string
  unknownError: string
  genericError: string
}

interface ErrorBoundaryState {
  error: Error | null
}

interface InternalErrorBoundaryProps extends ErrorBoundaryProps {
  labels: ErrorBoundaryLabels
}

class InternalErrorBoundary extends Component<InternalErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error', error, info)
    logErrorBoundary(error, info.componentStack ?? undefined)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { children, fallback, labels } = this.props
    const { error } = this.state

    if (!error) {
      return children
    }

    if (fallback) {
      return fallback(error, this.reset)
    }

    return (
      <main className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{labels.title}</CardTitle>
            <CardDescription>{labels.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{error.name || labels.genericError}</AlertTitle>
              <AlertDescription>{error.message || labels.unknownError}</AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-2">
              <Button onClick={this.reset} type="button">
                <RefreshCcwIcon data-icon="inline-start" />
                {labels.reset}
              </Button>
              <Button
                onClick={() => window.location.reload()}
                type="button"
                variant="outline"
              >
                {labels.reload}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { t } = useI18n()

  return (
    <InternalErrorBoundary
      {...props}
      labels={{
        title: t('errorBoundary.title'),
        description: t('errorBoundary.description'),
        reset: t('errorBoundary.reset'),
        reload: t('errorBoundary.reload'),
        unknownError: t('errorBoundary.unknownError'),
        genericError: t('errorBoundary.genericError'),
      }}
    />
  )
}
