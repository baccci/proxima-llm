const VENDOR_SEP = ': '

export function shortModelName(name: string): string {
  let result = name

  const vendorSep = result.indexOf(VENDOR_SEP)
  if (vendorSep !== -1) {
    result = result.slice(vendorSep + VENDOR_SEP.length)
  }

  result = result.replace(/ \(free\)$/i, '')
  return result
}
