
  // Keeps only digits, at most one dot, at most 2 decimals.
  export const sanitizeAmount = (next: string): string => {
    let cleaned = next.replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')

  if(dot !== -1){
    const head = cleaned.slice(0, dot +1)
    const tail = cleaned.slice(dot +1 ).replace(/\./g, '').slice(0, 2);
    cleaned = head + tail
  }
  
  return cleaned
  }
// TODO(Milestone 4): 100 is hardcoded. Not every currency has 2 decimal pl
export const toMinorBDT = (input:string) : number | null => {
  const value = Number(input.trim())
  if (!Number.isFinite(value) || value <= 0) return null

return Math.round(value * 100)
}