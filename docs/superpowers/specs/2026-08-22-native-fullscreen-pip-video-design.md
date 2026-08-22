# Video player: native fullscreen + PiP (Phase 1, no watermark)

## Background

The current `HlsVideoPlayer` fullscreen/PiP is entirely JS-simulated:
`Animated.View` + `PanResponder` change the container's size/position/opacity
to fake fullscreen and a draggable PiP box. It works (the single `<Video>`
never remounts, playback never resets), but the user correctly identified it
as hand-rolled rather than native: no native fullscreen transition, no
native window-manager-driven animation, no OS Picture-in-Picture window.

Investigation found `react-native-video` (already a dependency, v6.19.2)
ships genuine native support for both:

- **Fullscreen**: `videoRef.current.presentFullscreenPlayer()` /
  `dismissFullscreenPlayer()`, or the `fullscreen` prop. On Android this is
  backed by `FullScreenPlayerView.kt`, a `Dialog` that **reparents the
  existing `ExoPlayerView`** into its own container
  (`parent.removeView(exoPlayerView); containerView.addView(exoPlayerView)`)
  -- the same `ExoPlayer` instance, no new player, no decode restart, no
  remount. Events: `onFullscreenPlayerWillPresent/DidPresent/WillDismiss/DidDismiss`.
- **Picture-in-Picture**: `videoRef.current.enterPictureInPicture()` /
  `exitPictureInPicture()`, backed by Android's real system PiP API
  (`enterPictureInPictureMode()`), not an in-app draggable box. Event:
  `onPictureInPictureStatusChanged`.

## The constraint that shapes this plan

`FullScreenPlayerView`'s native `Dialog` only reparents the video surface
(and, if `controls={true}`, the library's own native `LegacyPlayerControlView`).
It does **not** carry over anything from the RN view tree -- our custom
overlays (watermark, subtitle rendering, download badge, the branded
play/pause/scrub UI) live in React and are simply not part of what gets
moved into that native `Dialog`. Native player-surface reparenting and a
fully custom RN control overlay are mutually exclusive *as shipped* by the
library; combining them would require patching `FullScreenPlayerView.kt` to
inject additional native views (a follow-up phase, out of scope here).

**Decision (confirmed with user):** ship native fullscreen/PiP with the
library's own `controls={true}` first, dropping the watermark and custom
control skin for now, to validate that the native transition is genuinely
smooth (no remount, no stutter) before investing in the native-patch phase
that would restore the watermark. This spec covers that first phase only.

## Goal (this phase)

- Pressing play opens the video and, on demand, uses
  `presentFullscreenPlayer()` for fullscreen and `enterPictureInPicture()`
  for PiP -- both backed by native Android mechanisms, not JS-simulated
  ones.
- The library's native controls (`controls={true}`) replace the custom
  play/pause/scrub/speed/subtitle-button UI while in this mode.
- Our own watch-progress tracking (`handleProgress`/`closeCurrentRange`,
  the "Mening video ko'rishim" segments, offline caching kickoff) keeps
  working unchanged -- none of that depends on the custom control UI, only
  on `onProgress`/`onLoad`/`onEnd`, which fire the same way regardless of
  which controls are visible.
- Explicitly **out of scope for this phase**: watermark, custom subtitle
  rendering, the download badge overlay, the branded scrub bar. These are
  acknowledged as a follow-up (native `FullScreenPlayerView` patch) once
  this phase is validated.

## Confirmed constraints

- This is an RN CLI (bare) project -- full access to `android/` native code
  and to patching `node_modules` (via `patch-package`, already listed as a
  precedent path the user is open to for the *next* phase). This phase,
  however, needs no native patching: `controls`, `fullscreen`,
  `presentFullscreenPlayer`, `enterPictureInPicture` are all public JS API
  already exposed by the installed `react-native-video` version.
- Portrait-only was a constraint in earlier (now-superseded) specs for the
  JS-simulated approach; native fullscreen's own orientation handling
  (`fullscreenAutorotate`, `fullscreenOrientation`) is available if wanted
  later, but this phase leaves it at the library default (no explicit
  orientation lock) since rotation was never the focus of the user's
  complaint -- the complaint was about remounting/stutter, not orientation.
- Single active video at a time -- unchanged.

## Components

### `HlsVideoPlayer.tsx` (rewritten)

- Remove: `mode` state, `pipPan`/`pipPanResponder`, `dismissDrag`/
  `dismissResponder`/`dismissOpacity`, the swipe-to-dismiss gesture, the
  custom fullscreen/PiP `Animated.View` wrapper, the entire custom control
  overlay JSX (scrim, top action bar, center transport, bottom timeline
  panel, PiP's compact transport) -- all of it was working around not
  having native fullscreen/PiP, which we no longer need to work around.
- Remove: watermark rendering, custom subtitle overlay, download badge
  overlay (moved to a documented follow-up -- see "Deferred" below).
- Add: `<Video controls fullscreen={...} onFullscreenPlayerDidDismiss={...}
  onPictureInPictureStatusChanged={...} enterPictureInPictureOnLeave />` (or
  drive fullscreen imperatively via `videoRef.current.presentFullscreenPlayer()`
  -- see Task 2 for the exact call site chosen).
- Keep unchanged: `loadPlayback` (manifest/offline resolution), `handleLoad`,
  `handleProgress`, `closeCurrentRange`, `apiSaveWatchProgress`/
  `apiGetWatchProgress` wiring, `startDownloadIfNeeded` (caching-follows-
  playback), `onClose` prop contract.
- The component still renders inline (in its normal document position, as
  `LazyVideoPlayer`/`CourseScreen` place it) rather than needing an absolute-
  positioned screen-level overlay -- native fullscreen/PiP are both driven
  by imperative calls on the mounted `<Video>`, not by us moving where the
  component renders. This likely lets `CourseScreen`'s `activeVideoStore`
  wiring (`activeBlockId`, `isFullscreen` mirroring) simplify too -- exact
  scope determined in the plan.

### Deferred (explicitly not in this phase)

- Watermark (video piracy deterrent) -- needs the native
  `FullScreenPlayerView` patch to reinject as a native overlay view, since
  it must survive into the native fullscreen `Dialog`.
- Custom subtitle rendering -- same constraint; native `controls={true}`
  does not render our VTT-parsed cues.
- Offline-download badge -- was rendered as a control-overlay element;
  needs either the same native-patch treatment or a decision to show it
  only in the non-fullscreen/non-PiP inline state.
- Swipe-to-dismiss gesture -- native fullscreen dismiss is via the
  library's own controls/back button; a custom swipe gesture on top of a
  native `Dialog` is not straightforwardly available without patching.

## Testing plan

Manual, on the Android emulator/device:

1. Play a video -- confirm playback starts (native `controls={true}` UI
   visible: the library's own play/pause/scrub/fullscreen-toggle bar).
2. Tap the native fullscreen control -- confirm: the screen fills
   edge-to-edge, the on-screen clock does not reset (compare the second
   just before/after the tap), no spinner/black-frame flash.
3. Tap native PiP (if exposed by the controls UI) or trigger
   `enterPictureInPicture()` -- confirm a real Android system PiP window
   appears (visible even if you switch away from the app entirely, unlike
   the old in-app draggable box), audio/video continues, clock keeps
   advancing.
4. Return from PiP / dismiss fullscreen -- confirm playback position is
   unchanged from immediately before the transition.
5. Confirm watch-progress still saves: play a few seconds, close, reopen
   -- resumes near the same position (existing `closeCurrentRange`/
   resume-time logic, untouched).
6. Confirm offline playback and caching-on-play still work (unchanged
   code paths) even though their UI surfacing (download badge) is
   temporarily gone.
