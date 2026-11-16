# FTune Mobile — Analysis & Fix Plan (`PLAN.md`)

> **Scope:** `FTune-mobile` only (`Ftune-pc` will NOT be touched).

---

## 1. Root-Cause Analysis of Current Issues

### A. Google Sign-In Blocked (`Error 403: access_denied`)
- **What happens:** Tapping **Continue with Google** opens `accounts.google.com` via `jbctywgcnhryyqgkssme.supabase.co`, which immediately fails with:
  `Access blocked: jbctywgcnhryyqgkssme.supabase.co has not completed the Google verification process (Error 403: access_denied)`.
- **Why:** The Google Cloud OAuth client attached to that backend project is in **Testing mode** (unverified by Google) and requests sensitive Google Drive scopes (`drive.appdata`, `drive.file`). Google blocks every email that is not manually added to the developer's Test Users list.
- **Alternative that works 100% on every phone without Google verification or a custom server:**
  - Use **FTune Cloud Account (Username + Password)** backed by the existing FTune cloud (`jbctywgcnhryyqgkssme.supabase.co`), where `email` signup is enabled and `mailer_autoconfirm: true` (verified live — no email confirmation required).
  - Uses the exact same `user_data` cloud table as FTune PC: each person creates a username + password once, and logging into any other phone immediately restores their playlists, borrowed Spotify playlists, and liked songs.
  - Also includes a local **Backup / Restore** option if offline.

### B. Spotify & Library UI Text / Clutter
1. **Library Fetch Drawer Labels** (`FTune-mobile/App.tsx`):
   - `"Borrow Playlists / Liked"` → rename to **`"Fetch Spotify Playlist"`**
   - `"Import Spotify Link"` → rename to **`"Import Spotify Playlist"`**
2. **Playlist Subtitle** (`FTune-mobile/App.tsx`):
   - Currently shows `Borrowed • <Owner> • <N> songs`.
   - Change to just **`<N> songs`** (e.g., `24 songs`).
3. **Home Screen Top Mode Banner** (`FTune-mobile/App.tsx`):
   - Currently shows `📱 Solo Phone Mode: Playing directly through your phone` / `💻 Remote Mode: Playing on ...`.
   - Remove this banner completely.
4. **Account / Profile Modal Too Wordy** (`FTune-mobile/src/components/GoogleAccountModal.tsx` → `AccountModal.tsx`):
   - Currently has long paragraphs, 3-item feature bullet list, stats grid, and info boxes.
   - Strip all unnecessary text:
     - **Signed out:** Clean title, Username + Password fields (with Sign In / Create Account toggle), and one primary button.
     - **Signed in:** Profile name, **Sync Now** button, and **Sign Out** button.

### C. Mobile UI vs. PC UI Mismatch
- **PC Design Language (`Ftune-pc/src/index.css`, `HomeView.tsx`):**
  - Pure black `#000000` canvas, `#0D0D0F` surface, translucent subtle cards (`rgba(255, 255, 255, 0.04)`–`0.06`), `0.5px` hairlines (`rgba(255, 255, 255, 0.10)`), monochrome white primary pills (`#FFFFFF` / `#000000`), tight typography, and clean flat-glass MiniPlayer & BottomNavBar without heavy Android elevation shadows.
- **Current Mobile UI:**
  - Uses heavier opaque `#1C1C1E` boxes, thick borders, oversized round white play badges on every QuickTile, heavy drop shadows (`elevation: 10` / `16`), and mismatched spacing.

### D. Animation Delay, Scroll Lag & Bloat (Performance Optimization)
| Source of Lag / Bloat | File | Why It Causes Delay / Lag | Fix / Removal |
| :--- | :--- | :--- | :--- |
| **`SpringTouchable` on every button/card** | `AnimatedComponents.tsx`, `QuickTile.tsx`, `ShelfCard.tsx`, `MiniPlayer.tsx`, `FullPlayer.tsx`, `SpotifyLoginModal.tsx` | Runs `Animated.spring` on `onPressIn` + `onPressOut` with `activeOpacity={1}`, adding visible tap delay before action/feedback. | Replace with crisp `TouchableOpacity` (`activeOpacity={0.7}`) so taps feel instant. |
| **Async `FileSystem.getInfoAsync` per `SongRow`** | `SongRow.tsx`, `downloadManager.ts` | Every row fires an async native bridge call on mount/scroll to check download status. | Maintain an in-memory `Set<string>` in `downloadManager.ts` + synchronous `isTrackDownloadedSync(id)` check. |
| **Heavy Android `shadow*` & `elevation`** | `MiniPlayer.tsx`, `ShelfCard.tsx`, `FullPlayer.tsx` | Large `elevation` + `shadowRadius` forces expensive Android shadow overdraw on every frame. | Replace with clean `0.5px`–`1px` hairlines matching PC glass surfaces. |
| **Continuous `EqBars` `Animated.loop` everywhere** | `AnimatedComponents.tsx`, `QuickTile.tsx` | 3 infinite `Animated.loop` sequences running per active component. | Keep `EqBars` only on the active MiniPlayer / playing row with lightweight timing, or static indicator on tiles. |
| **`AmbientGlow` extra wrapper views** | `AnimatedComponents.tsx`, `PlaylistDetailView.tsx` | Extra nested absolute overlay `View`s with no real blur. | Remove `AmbientGlow` wrappers for flatter view hierarchy. |
| **Unoptimized `FlatList`s** | `App.tsx`, `PlaylistDetailView.tsx` | Default batch/window rendering renders too many offscreen rows at once. | Add `initialNumToRender={12}`, `maxToRenderPerBatch={10}`, `windowSize={5}`, `removeClippedSubviews={true}`. |
| **Unused / Dead Components** | `YouTubeAudioBridge.tsx`, `SpotifyMatchedView.tsx` | Leftover components no longer rendered in `App.tsx` (replaced by `nativeAudio` + `PlaylistDetailView`). | Remove dead files to keep codebase lean and clean. |

---

## 2. Step-by-Step Execution Plan

1. **Account & Cloud Sync Fix (`src/services/cloudAccount.ts`, `src/components/AccountModal.tsx`):**
   - Replace the blocked Google OAuth WebView flow with clean **FTune Cloud Account (Username + Password)** authentication against `jbctywgcnhryyqgkssme.supabase.co` (matching `Ftune-pc`'s `syntheticEmail` + `user_data` schema).
   - Keep automatic two-way cloud sync for all playlists (borrowed Spotify playlists + imported playlists), liked songs, and recent tracks across multiple phones, plus account isolation on sign-out/switch.
   - Make `AccountModal.tsx` minimal and clutter-free (no unnecessary paragraphs or feature lists).

2. **UI Text & Layout Cleanup (`App.tsx`, `SpotifyLoginModal.tsx`):**
   - Rename `"Borrow Playlists / Liked"` → **`"Fetch Spotify Playlist"`**.
   - Rename `"Import Spotify Link"` → **`"Import Spotify Playlist"`**.
   - Change borrowed playlist subtitle to **`<count> songs`** only.
   - Remove the Home screen top mode banner (`Solo Phone Mode` / `Remote Mode`).

3. **PC-Matched Visual Polish & Performance Overhaul (`App.tsx`, `QuickTile.tsx`, `ShelfCard.tsx`, `MiniPlayer.tsx`, `BottomNavBar.tsx`, `SongRow.tsx`, `FullPlayer.tsx`, `PlaylistDetailView.tsx`, `downloadManager.ts`):**
   - Match `Ftune-pc` dark monochrome aesthetic: `#000000` base, `rgba(255,255,255,0.04)` translucent tiles, crisp `0.5px` hairlines (`rgba(255,255,255,0.10)`), cleaner spacing, and flat glass MiniPlayer/BottomNavBar.
   - Remove `SpringTouchable` tap-delay wrappers and `AmbientGlow` wrappers.
   - Add synchronous `isTrackDownloadedSync` in `downloadManager.ts` so `SongRow` scrolling is zero-lag.
   - Tune `FlatList` rendering props across Library, Search, and PlaylistDetailView.
   - Delete dead files (`YouTubeAudioBridge.tsx`, `SpotifyMatchedView.tsx`, `GoogleAccountModal.tsx`, `googleAccount.ts` once replaced).

4. **Verification:**
   - Run `npx tsc --noEmit` in `FTune-mobile` to verify zero TypeScript errors.
   - Test cloud sign-up / sign-in / sync round-trip against `jbctywgcnhryyqgkssme.supabase.co` via Node script to confirm zero errors before finishing.
