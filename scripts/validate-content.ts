// Checks the dictionary, puzzles and daily schedule. Exits with code 1 on any error.
// Run with: pnpm validate:content
import { auditContent, SOLUTION_CAP } from '../src/lib/audit.ts'

const report = auditContent()
const { summary } = report

console.log(`Word Bridge content: ${summary.links} links between ${summary.words} words; ` +
  `${summary.puzzles} puzzles (${summary.standard} standard, ${summary.easy} easy).`)

const counts = [...report.solutionCounts.entries()].sort((a, b) => a[1] - b[1])
const show = (entries: [string, number][]) => entries.map(([id, count]) => `${id} (${count >= SOLUTION_CAP ? `${SOLUTION_CAP}+` : count})`).join(', ')
console.log(`Fewest valid bridges: ${show(counts.slice(0, 5))}`)
console.log(`Most valid bridges:   ${show(counts.slice(-5).reverse())}`)

for (const warning of report.warnings) console.warn(`warning: ${warning}`)
for (const error of report.errors) console.error(`error: ${error}`)

if (report.errors.length > 0) {
  console.error(`\n${report.errors.length} content error(s).`)
  process.exit(1)
}
console.log('Content OK.')
