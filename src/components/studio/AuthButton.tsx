import { Menu } from '@base-ui/react/menu'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

/**
 * The sign-in / account control in the top bar, rendered right after `<LibraryMenu />`.
 *
 * Three states, driven entirely by `authStore` (a controlled projection — no local state):
 *  - `status === 'loading'` → render nothing, so the button doesn't flicker in then swap out on
 *    the first `/api/me` settle;
 *  - signed out → a ghost "Sign in with GitHub" button matching the TopBar's bordered-pill styling,
 *    carrying the GitHub mark (currentColor, so it tints with the button rather than reading as a
 *    pasted-in black logo) so the OAuth provider is obvious before the click, not a surprise after
 *    the redirect (GitHub OAuth on the backend);
 *  - signed in → a 24px avatar (or an initial fallback when `avatarUrl` is null) as a Base UI menu
 *    trigger; the menu shows the login handle and a "Sign out" action.
 */
export function AuthButton() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)

  if (status === 'loading') return null

  if (!user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className="inline-flex items-center gap-2 rounded-lg border border-rule px-3 py-1.5 font-mono text-[11px] text-ink-dim outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <GithubMark />
        Sign in with GitHub
      </button>
    )
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${user.login}`}
        className="rounded-full outline-none focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Avatar user={user} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-30">
          <Menu.Popup className="min-w-[180px] rounded-[10px] border border-rule bg-paper-2 p-1.5 font-mono text-[12px] text-ink shadow-[0_14px_32px_oklch(0_0_0/0.14)] outline-none">
            <div className="truncate px-2 py-1 text-[10px] tracking-[0.14em] text-ink-faint uppercase">
              {user.login}
            </div>
            <Menu.Separator className="my-1.5 h-px bg-rule-soft" />
            <Menu.Item
              onClick={() => void signOut()}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 data-highlighted:bg-paper-3"
            >
              <span className="text-ink-dim" aria-hidden>
                <LogOut size={13} />
              </span>
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/**
 * The GitHub Invertocat mark (the official 16px octicon path), 13px to sit on the type baseline.
 * `fill="currentColor"` so it inherits the button's ink-dim/ink and tints on hover with the label —
 * it reads as part of the paper theme, not a black brand sticker.
 */
function GithubMark() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/** 24px round avatar image, or an ink circle bearing the login's initial when no image is set. */
function Avatar({
  user,
}: {
  user: { login: string; avatarUrl: string | null }
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={24}
        height={24}
        className="size-6 rounded-full border border-rule object-cover"
      />
    )
  }
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full border border-rule bg-ink font-mono text-[11px] font-semibold text-paper">
      {user.login.charAt(0).toUpperCase()}
    </span>
  )
}
