import { useState } from 'react'
import { runNerSmokeTest } from '../debug/nerSmokeTest.ts'

// Debug tools. The NER smoke test runs on the fictional sample deck only.
export default function DebugPanel() {
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  async function handleNerSmokeTest() {
    setRunning(true)
    setSummary('Running the NER smoke test… (see the console)')
    try {
      const result = await runNerSmokeTest()
      setSummary(
        `NER smoke test: ${(result.downloadedBytes / 1e6).toFixed(1)} MB downloaded, ` +
          `load ${Math.round(result.loadMs)} ms, inference ${Math.round(result.inferenceMs)} ms. ` +
          `Details in the console.`,
      )
    } catch (err) {
      setSummary(`NER smoke test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <details className="debug">
      <summary>Debug</summary>
      <button type="button" onClick={handleNerSmokeTest} disabled={running}>
        Run NER smoke test
      </button>
      {summary && <p>{summary}</p>}
    </details>
  )
}
