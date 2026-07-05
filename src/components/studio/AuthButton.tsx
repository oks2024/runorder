import { Menu } from '@base-ui/react/menu'
import { LogIn, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

/**
 * The sign-in / account control in the top bar, rendered right after `<LibraryMenu />`.
 *
 * Three states, driven entirely by `authStore` (a controlled projection — no local state):
 *  - `status === 'loading'` → render nothing, so the button doesn't flicker in then swap out on
 *    the first `/api/me` settle;
 *  - signed out → a ghost "Sign in" button matching the TopBar's bordered-pill styling, with a
 *    small sign-in glyph; click starts the OAuth redirect (GitHub OAuth on the backend);
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
        className="inline-flex items-center gap-2 rounded-lg border border-rule px-3 py-1.5 font-mono text-[11px] text-ink-dim outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <LogIn size={13} aria-hidden />
        Sign in
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
