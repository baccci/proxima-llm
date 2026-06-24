export function shortModelName(name: string): string {
  let result = name
  const vendorSep = result.indexOf(': ')
  if (vendorSep !== -1) result = result.slice(vendorSep + 2)
  result = result.replace(/ \(free\)$/i, '')
  return result
}
