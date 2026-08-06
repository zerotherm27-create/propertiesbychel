# 002 — Guard funnel step transitions against rapid re-entry

- **Status**: DONE
- **Commit**: 7e5023c
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 1 file (js/funnel.js), 1 function

## Problem

`js/funnel.js` drives the multi-step inquiry funnel on `presentation.html`.
`setStep()` updates `current` synchronously but defers the actual DOM
class swap (removing `is-active` from the old step, adding it to the new
one) inside a 220ms `window.setTimeout`. The entering step then gets
`@keyframes funnel-in` (a real keyframe animation, not a transition — see
`css/site.css:374`), which restarts from `opacity: 0` every time the
`is-active` class is (re-)added.

There is no guard preventing `setStep` from being called again before
that 220ms timeout resolves. Sequence if a user double-clicks "Next"
quickly:

1. Click 1 calls `setStep(current + 1)`. `current` is bumped
   synchronously to `n`. `prev` (still showing `is-active`) gets
   `is-leaving` and a 220ms timeout is scheduled to do the actual swap.
2. Click 2 (before the timeout fires) calls `setStep(current + 1)` again
   — but `current` was already bumped by click 1, so this targets `n + 1`,
   silently skipping the step the user thought they were advancing to.
   `prev` is re-queried and is *still the original element* (the class
   swap from click 1 hasn't happened yet), so click 2 schedules a second
   timeout touching the same `prev`/a different `next`.
3. Both timeouts now fire in sequence, each mutating `classList` on
   elements the other timeout also touched, and the keyframe entrance can
   restart mid-flight on whichever step ends up visible. The visible
   result is either a skipped step or a visibly broken transition.

Current code (`js/funnel.js:22-42`):

```js
function setStep(n, backwards) {
  var prev = form.querySelector('.funnel-step.is-active');
  var next = form.querySelector('.funnel-step[data-step="' + n + '"]');
  if (!next || next === prev) return;
  current = n;

  if (prev && !reduceMotion) {
    prev.classList.add(backwards ? "is-leaving-back" : "is-leaving");
    window.setTimeout(function () {
      prev.classList.remove("is-active", "is-leaving", "is-leaving-back");
      next.classList.add("is-active", backwards ? "is-entering-back" : "is-entering");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          next.classList.remove("is-entering", "is-entering-back");
        });
      });
    }, 220);
  } else {
    if (prev) prev.classList.remove("is-active");
    next.classList.add("is-active");
  }
  ...
```

And the three call sites that can trigger it in quick succession
(`js/funnel.js:60-71`):

```js
form.querySelectorAll('.funnel-choice input[type="radio"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    window.setTimeout(function () { setStep(2); }, reduceMotion ? 0 : 260);
  });
});

form.querySelectorAll("[data-funnel-next]").forEach(function (btn) {
  btn.addEventListener("click", function () { setStep(current + 1); });
});
form.querySelectorAll("[data-funnel-back]").forEach(function (btn) {
  btn.addEventListener("click", function () { setStep(current - 1, true); });
});
```

## Target

Add a module-level `transitioning` flag. `setStep` bails out immediately
if a transition is already in flight, and clears the flag once the
deferred class swap completes (or immediately, in the `reduceMotion`
branch which has no deferred work).

```js
// js/funnel.js — target
var current = 1;
var transitioning = false;

function setStep(n, backwards) {
  if (transitioning) return;
  var prev = form.querySelector('.funnel-step.is-active');
  var next = form.querySelector('.funnel-step[data-step="' + n + '"]');
  if (!next || next === prev) return;
  current = n;

  if (prev && !reduceMotion) {
    transitioning = true;
    prev.classList.add(backwards ? "is-leaving-back" : "is-leaving");
    window.setTimeout(function () {
      prev.classList.remove("is-active", "is-leaving", "is-leaving-back");
      next.classList.add("is-active", backwards ? "is-entering-back" : "is-entering");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          next.classList.remove("is-entering", "is-entering-back");
        });
      });
      transitioning = false;
    }, 220);
  } else {
    if (prev) prev.classList.remove("is-active");
    next.classList.add("is-active");
  }
  ...
```

(everything after the `if/else` block — the progress-dot update and the
focus-management `window.setTimeout` — is unchanged; it is omitted here
only for brevity, do not delete it.)

## Repo conventions to follow

- This file already uses a plain top-of-closure `var` for shared mutable
  state (`var current = 1;` at `js/funnel.js:13`) — add `transitioning`
  the same way, immediately after it.
- The existing `reduceMotion` branch (the `else` in `setStep`) has no
  deferred timeout, so it needs no `transitioning` bookkeeping — it
  completes synchronously within the same call. Do not add a guard
  release inside that branch; there is nothing to guard against there.

## Steps

1. In `js/funnel.js`, immediately after the `var current = 1;` line
   (currently line 13), add `var transitioning = false;`.
2. At the top of `setStep(n, backwards)` (currently line 22), add
   `if (transitioning) return;` as the very first line of the function
   body, before `var prev = ...`.
3. Inside the `if (prev && !reduceMotion)` branch, immediately before the
   `prev.classList.add(...)` call, add `transitioning = true;`.
4. Inside that same branch's `window.setTimeout` callback, add
   `transitioning = false;` as the last statement, after the
   `requestAnimationFrame` block (i.e., after the closing `});` of the
   outer `requestAnimationFrame`, still inside the `setTimeout` callback).

## Boundaries

- Do NOT change the 220ms timeout value, the keyframe names, or any CSS.
- Do NOT add the guard to the `reduceMotion` `else` branch — it resolves
  synchronously and has nothing to guard.
- Do NOT touch the progress-dot update logic or the focus-management
  timeout later in `setStep` — only the four edits listed in Steps.
- Do NOT add debouncing/throttling to the click handlers themselves
  (`[data-funnel-next]`, `[data-funnel-back]`, the radio `change`
  listener) — the fix belongs inside `setStep`, which all three call
  sites already funnel through.
- If `setStep`'s current code does not match the excerpt in Problem
  (e.g. line numbers have drifted, the timeout duration differs), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: none (no build/typecheck for this static site). Open
  `js/funnel.js` afterward and confirm the function is still valid
  JavaScript (balanced braces, `transitioning` declared once).
- **Feel check**: serve the site locally
  (`python3 -m http.server 8080`), open `presentation.html`, and:
  - Click "Next" as fast as possible, repeatedly (5-10 rapid clicks).
    Confirm the funnel advances at most one step per click-plus-220ms
    window — it should never skip a step or show a visibly torn/restarted
    entrance animation.
  - Rapidly alternate Next/Back clicks. Confirm the funnel never gets
    stuck with two steps simultaneously visible or with an un-cleared
    `is-leaving`/`is-entering` class (`document.querySelectorAll('.funnel-step.is-leaving, .funnel-step.is-entering')` in the console should return
    an empty list a moment after clicking stops).
  - Select a radio option on step 1 twice in a row quickly (change
    selection, then immediately change it again) — confirm it still
    auto-advances to step 2 exactly once, not skipping to a
    nonexistent step 3.
  - With `prefers-reduced-motion` enabled (DevTools Rendering panel),
    confirm step navigation still works instantly (this path is
    untouched by the fix, but re-confirm no regression).
- **Done when**: rapid repeated clicking on Next/Back never skips a step,
  never leaves stray transition classes on the DOM, and single clicks at
  a normal pace behave exactly as before this plan.
