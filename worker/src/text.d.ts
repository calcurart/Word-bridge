// Wrangler bundles .txt files as plain strings (see "rules" in wrangler.jsonc).
declare module '*.txt' {
  const text: string
  export default text
}
