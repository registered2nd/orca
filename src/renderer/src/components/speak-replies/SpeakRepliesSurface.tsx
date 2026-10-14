import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { RecoverableRenderErrorBoundary } from '../error-boundaries/RecoverableRenderErrorBoundary'

const SpeakRepliesController = lazy(() =>
  import('./SpeakRepliesController').then((module) => ({
    default: module.SpeakRepliesController
  }))
)

/** App-root mount for read-aloud, loaded off the startup path. */
export function SpeakRepliesSurface(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RecoverableRenderErrorBoundary surface="overlay" compact boundaryId="overlay.speak-replies">
        <SpeakRepliesController />
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}
