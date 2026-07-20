import React from 'react'
import { rpcRequest } from '@/lib/rpc.client'

type ErrorBoundaryProps = {
  children: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    rpcRequest()
      .logClientError({ msg: error.message, stack: error.stack })
      ?.catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-muted text-sm">
          Something went wrong. Check logs for details.
        </div>
      )
    }
    return this.props.children
  }
}
