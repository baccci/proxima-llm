import React from 'react'

export function createContext<ContextValue>(useValue: () => ContextValue) {
  const Context = React.createContext<ContextValue | null>(null)

  function Provider({ children }: { children: React.ReactNode }) {
    const value = useValue()
    return <Context.Provider value={value}>{children}</Context.Provider>
  }

  function useContext() {
    const context = React.use(Context)

    if (!context) {
      throw new Error('useContext must be used within a Provider')
    }

    return context
  }

  return [Provider, useContext] as const
}

export function deprecated_createContext<ContextValue>(defaultValue?: ContextValue) {
  const Context = React.createContext<ContextValue | undefined>(defaultValue)

  const Provider = (props: { value: ContextValue; children: React.ReactNode }) => {
    const { children, ...context } = props

    const dependencyArray = Object.values(context)
    // biome-ignore lint/correctness/useExhaustiveDependencies: dynamic dep array is intentional here
    const { value } = React.useMemo(() => context, dependencyArray)

    return <Context.Provider value={value}>{children}</Context.Provider>
  }

  const useContext = () => {
    const context = React.use(Context)
    if (!context && !defaultValue) {
      throw new Error('useContext must be inside a Provider with a value')
    }
    if (context) return context
    return defaultValue as ContextValue
  }

  return [Provider, useContext] as const
}
