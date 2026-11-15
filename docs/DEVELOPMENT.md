# TuxScale developer guide

TuxScale is a native Rust application. GPUI builds and paints the desktop interface. Rust manages preferences, files, preview decoding, and processing jobs. The PyTorch backend still runs Python workers; NCNN runs the bundled executable.

## Source map

| File | Responsibility |
| --- | --- |
| `app/src/main.rs` | Application state, startup, file pickers, job requests and job event handling |
| `app/src/ui.rs` | Root view, sidebar/workspace composition, navigation, keyboard handling and transient UI state |
| `app/src/ui/components.rs` | Shared buttons, tabs, toggles, captions, panels, icons and logical dimensions |
| `app/src/ui/theme.rs` | Shared UI colors |
| `app/src/ui/inputs.rs` | Dropdown and slider controls bound to application settings |
| `app/src/ui/upscale.rs` | Four-step upscale panel |
| `app/src/ui/settings.rs` | Appearance, backend, export and inference settings panel |
| `app/src/ui/empty_state.rs` | Import instructions for images, videos and folders |
| `app/src/layout.rs` | Responsive layout dimensions |
| `app/src/preview.rs` | Image comparison state and clipped reveal element |
| `app/src/video_preview.rs` | Video playback UI and decoder event handling |
| `app/src/video_decode.rs` | Cancellable FFmpeg decoding and paired comparison frames |
| `app/src/engine/mod.rs` | Job contract, validation and dispatch |
| `app/src/engine/runtime.rs` | Resource paths, models, Python discovery and readiness |
| `app/src/engine/process.rs` | Host environment restoration, child processes, cancellation and logs |
| `app/src/engine/media.rs` | File discovery and collision-safe output naming |
| `app/src/engine/images.rs` | Image job iteration and backend dispatch |
| `app/src/engine/videos.rs` | Video job iteration and audio export |
| `app/src/engine/ncnn.rs` | NCNN commands and video frame batching |
| `app/src/engine/pytorch.rs` | Python worker commands and video conversion |
| `app/src/engine/installer.rs` | CUDA environment installer |
| `app/src/engine/events.rs` | Shared progress and log reporting |
| `app/src/preferences.rs` | Saved preferences |
| `app/src/assets.rs` | Embedded assets provided to GPUI |

## How the UI works

GPUI calls `Render::render` on the `TuxScale` entity. That method builds an element tree using Rust builders such as `div().child(...)`. Containers control layout; child elements provide text, images, controls and event handlers. There is no HTML, CSS, JavaScript frontend or Electron process.

The root view composes the sidebar and workspace. It selects `settings_controls` or `upscale_controls` for the sidebar, and import instructions, image preview, video preview or batch controls for the workspace.

Reusable controls in `components.rs` receive values and callbacks. For example, `button(label, primary, disabled, callback)` shares styling and disabled behavior across panels. These are lightweight element factories. They do not own separate copies of application settings.

Larger panels are methods on `TuxScale`, organized into child modules. This keeps the existing state owner while allowing a panel to be edited separately. Child modules use `pub(super)` for entry points needed by the root view; their implementation stays inside the UI module.

### State and events

`TuxScale` holds processing settings, selected paths, progress, logs and completed output. `UiState` holds temporary presentation state: focus, open dropdown, log visibility, responsive dimensions and preview state. Preferences persist selected settings, not decoder sessions or GPU images.

A typical event follows this path:

1. A control receives a click, key press or drag.
2. `cx.listener` gives its callback access to the owning `TuxScale` entity.
3. The callback updates state and calls `persist()` when the setting should survive restart.
4. `cx.notify()` requests a new render using the updated state.

Dropdown selection is represented by `Field`. `select_option` applies the selected value, saves preferences and closes the menu. The root keyboard handler navigates the active menu. The dropdown component handles its popup, opening and outside-click dismissal.

### Layout and scaling

The root sets GPUI's rem size from Interface Scale. Shared `logical()` dimensions use that same rem basis, keeping text and controls proportional. `Layout::new` derives sidebar width, padding, popup dimensions and log height from the viewport and scale.

Compact windows switch between Controls and Preview. Scrollable containers use bounded heights and shrinking constraints. Instruction rows and sidebar cards avoid growing to fill the available vertical space. When adding a control, prefer shared logical dimensions and respect the parent's available width.

## Preview and comparison

Image previews draw both images in the same viewport with aspect-preserving sizing. `Reveal` applies a paint mask to the before layer. Moving the divider changes the mask width, not the image size. Root mouse handlers continue dragging and release the divider.

Video import starts a background decoder for the initial frame. Playback and seeking restart a cancellable decoder session at the requested position. FFprobe reads metadata; FFmpeg outputs BGRA frames. The preview is muted and decoded at 960×540 per view.

When completed output is available, FFmpeg decodes source and result using a shared filter pipeline and stacks them into a single output frame. Rust splits that frame into matching before/after buffers. Both views therefore update together. The same reveal element clips the before view over the result.

A bounded channel prevents unlimited queued frames. Generation checks discard events from replaced sessions. Dropping a session closes delivery, terminates the child and joins the worker. Replaced GPUI images are released to avoid accumulating GPU textures. Preview resolution is independent of exported resolution.

## Processing and Python

The Upscale button builds a `JobRequest` from current settings. `launch_task` starts work on a background thread and receives `JobEvent` messages asynchronously. Log, progress, done, failure and cancellation events update the entity and notify GPUI. Long processing commands should remain outside rendering and input callbacks.

The `engine/` modules choose the backend and construct commands. NCNN uses the bundled `upscayl-bin`; PyTorch uses the existing Python image or video worker in `resources/python`. FFmpeg handles video operations and audio handling. Python is required for PyTorch inference, but not for the GPUI interface.

Python discovery supports a custom executable, environment configuration and existing TuxScale environments. Reuse a working environment through Settings. Runtime resources under `resources/models`, `resources/linux/bin` and `resources/python` must remain available in packages.

The AppImage launcher saves the host library path before adding bundled GUI libraries. `host_command` restores that environment for Python, FFmpeg and FFprobe, preventing bundled GUI libraries from breaking host tools.

## Adding or changing a component

- Change shared colors in `ui/theme.rs`.
- Put reusable stateless controls in `ui/components.rs`; pass state and callbacks as arguments.
- Put setting-specific input behavior in `ui/inputs.rs`.
- Compose controls in the relevant panel module. Use stable, distinct element IDs for controls that coexist.
- Keep saved values in application preferences and transient interaction state in `UiState`.
- Call `cx.notify()` after state changes; persist only settings that should survive restart.
- Keep blocking work in workers and deliver results through events.
- Use an independent GPUI entity when a component needs its own lifetime or asynchronous state. Small stateless elements do not need one.

## Running and checking

Run commands from the repository root:

```sh
cargo run --manifest-path app/Cargo.toml
cargo fmt --manifest-path app/Cargo.toml
cargo check --locked --manifest-path app/Cargo.toml
cargo test --locked --manifest-path app/Cargo.toml
```

The ignored decoder integration test requires FFmpeg and FFprobe:

```sh
cargo test --locked --manifest-path app/Cargo.toml video_decode::tests::decodes_seeks_and_cancels_with_a_full_queue -- --ignored
```

Native fixture tests require a display and their documented environment variables. A compile check cannot confirm visual layout; manually inspect small and large windows, interface scale, dropdown navigation, image comparison and video seeking after UI changes.

## Packaging

`app/scripts/package-linux.sh` creates the AppDir and optionally AppImage. `app/scripts/package-formats.sh` builds the Linux distribution formats. The GitHub workflow compiles, checks and packages the application; manual runs on main or version tags can publish a release. Keep `app/Cargo.lock` committed and retain bundled licenses. Do not commit build outputs, virtual environments or caches.


## Engine module boundaries and debugging

The rest of the app calls the stable `engine` facade: `JobRequest`, `JobEvent`, `run`, `models_for`, `runtime_summary`, and `host_command`. Re-exports in `engine/mod.rs` preserve these paths. Shared implementation functions use `pub(super)`, making them reusable by engine siblings without exposing backend internals to the UI. Imports explicitly show dependencies.

For a missing executable or model, start in `runtime.rs`. For wrong output naming or folder contents, use `media.rs`. For missing worker diagnostics, cancellation or AppImage library conflicts, use `process.rs`; its regression tests live alongside those functions. For wrong Python worker arguments, use `pytorch.rs`; for NCNN frame batching, use `ncnn.rs`. Image/video job ordering and backend selection calls live in `images.rs` and `videos.rs`. Installer failures start in `installer.rs`.

Keep backend-specific command construction in its adapter. Reuse `process::run_command` for cancellable workers, `process::host_command` for host tools, and `events::{log, progress}` for reporting. New UI callers should use the facade rather than importing backend implementation modules.
