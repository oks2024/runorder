import { useEffect } from 'react'
import { StudioApp } from '@/components/studio/StudioApp'
import { useAuthStore } from '@/store/authStore'
import { useCloudStore } from '@/store/cloudStore'

function App() {
  const user = useAuthStore((s) => s.user)

  // Resolve the session once on mount; failure lands signed-out (never blocks the app).
  useEffect(() => {
    void useAuthStore.getState().fetchMe()
  }, [])

  // When a user lands (initial fetch or sign-in), load their cloud list once. Explicit, not
  // auto-sync — this is the only place the list is pulled without a user action.
  useEffect(() => {
    if (user) void useCloudStore.getState().refresh()
  }, [user])

  return <StudioApp />
}

export default App
