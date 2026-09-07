# Handover Documentation: yacd Dual-Backend Dashboard

This document provides a cold-start context for a fresh agent running under Paseo.
Repository and Git state are authoritative.

---

## 1. Current Objective & Intended End State
- **Objective**: Develop and maintain a dual-backend dashboard based on yacd supporting both the Clash REST API and the sing-box native gRPC-Web Service API (`StartedService`).
- **Intended End State**:
  - Independent or concurrent configuration and operation of Clash and sing-box native backends.
  - Pristine yacd UI/UX preserved across Overview, Proxies, Rules, Logs, and Connections views.
  - Robust mobile and browser lifecycle resilience (graceful suspend/resume, silent stall detection, zero leaks).
  - No synthetic chart padding; faithful rate and memory telemetry presentation matching native sing-box dashboard semantics.

---

## 2. Repository & Branch State
- **Working Branch**: `master`
- **HEAD Commit**: `d0f8ade` (`fix(telemetry): harden native stream suspend and reconnect lifecycle`)
- **Remote Tracking**: `origin/master` at `https://github.com/MidoriKSU/yacd` (cleanly synced, 0 commits ahead/behind)
- **Remotes Configured**:
  - `origin`: `https://github.com/MidoriKSU/yacd`
  - `upstream`: `https://github.com/haishanh/yacd.git`
  - `chizhi`: `https://github.com/CHIZI-0618/yacd.git`
- **Working Tree**: Clean prior to creating `HANDOVER.md`.

---

## 3. Completed Work & Checkpoints
1. **Native Transport Foundation (`9028000`)**:
   - Implemented gRPC-Web transport using `@connectrpc/connect` and `@connectrpc/connect-web`.
   - Generated Protobuf client schema under `src/api/gen/daemon/started_service_pb.js` matching sing-box `StartedService`.
2. **Dual-Backend Storage & Setup Gate (`be27084` -> `6d7cd27`)**:
   - Implemented dual-backend state management in `src/store/app.ts` (`clashAPIConfigs` and `nativeAPIConfigs`).
   - Added startup gate in `src/components/Root.tsx` to handle Clash-only, Native-only, or Dual-backend setups.
   - Built Native API configuration UI matching yacd backend pattern (`src/components/APIConfig.tsx`, `src/components/BackendForm.tsx`).
   - Added independent labels for Clash and Native backends (`d8c808a`).
3. **Autofill Form Submission Fix (`ea159e2`)**:
   - Solved browser autofill / virtual keyboard desync where live DOM had input values while React state remained `""`.
   - `BackendForm.tsx` extracts values via `new FormData(e.currentTarget)` as the source of truth before falling back to React state.
4. **Mobile & Browser Lifecycle Hardening (`d0f8ade`)**:
   - **Suspend** (`visibilitychange:hidden`, `freeze`, `pagehide`): Aborts active stream via `AbortController`, cancels timers, transitions to `'disconnected'`, and suppresses reconnect while hidden.
   - **Resume** (`visibilitychange:visible`, `resume`, `pageshow`, `online`): Throttles rapid duplicate events (<1000ms), re-establishes a fresh stream if disconnected or stale.
   - **Watchdog Guards**: 10s connecting timeout (detects DNS/handshake hangs) and 5s silent stall timeout (detects dropped packets/half-open sockets).
   - **Stream Generation Isolation**: `streamGeneration` counter prevents stale iterators or callbacks from mutating state or scheduling reconnections.
   - **History Preservation**: Same-endpoint reconnections preserve existing 150-slot telemetry history without injecting synthetic zeros.

---

## 4. Current Working-Tree State
- No modified tracked source files.
- `HANDOVER.md` created in repository root (untracked or staged per handover instruction).
- Scratch scripts used during verification reside in the agent scratch directory (`~/.gemini/.../scratch/`), not in the Git repository.

---

## 5. Test & Validation Results
- **TypeScript**: `pnpm exec tsc --noEmit` -> Passed with 0 errors.
- **ESLint**: `pnpm lint` -> Passed with 0 errors (2 preexisting warnings in `Config.tsx`).
- **Production Build**: `pnpm build` -> Passed with code 0 (Vite + Workbox PWA built successfully).
- **Automated Lifecycle Suite (15 Requirements)**:
  1. Single store startup ownership -> PASS
  2. Passive constructor -> PASS
  3. Suspend aborts stream -> PASS
  4. Hidden suppresses reconnect -> PASS
  5. Resume starts fresh stream -> PASS
  6. Rapid resume duplicate throttling -> PASS
  7. 10s connecting timeout recovery -> PASS
  8. 5s silent stall recovery -> PASS
  9. Stale generation cannot update state -> PASS
  10. Stale generation cannot schedule reconnect -> PASS
  11. Same-endpoint history preserved -> PASS
  12. Endpoint switch clears history -> PASS
  13. Exactly 150 history slots maintained -> PASS
  14. No synthetic samples during suspension -> PASS
  15. No extra telemetry polling timers -> PASS

---

## 6. Blockers, Unresolved Questions & Known Failures
- **Blockers**: None.
- **Known Failures**: None.
- **Runtime Confirmation**: Verified on Android Chrome (screen sleep, app switching, and network re-association recover automatically without manual page reloads).

---

## 7. Architectural Decisions & Invariants
1. **Single Connection Ownership**: `SingBoxClient` constructor must remain passive. Initial connection is owned exclusively by `store/app.ts` (`setCustomConfig`).
2. **Strict Single-Stream Guarantee**: At most one active gRPC-Web status stream at any time. Old streams must be aborted via `AbortController` and guarded by `this.streamGeneration`.
3. **Form Submission Source of Truth**: Always extract form fields from `new FormData(e.currentTarget)` to prevent mobile autofill desync.
4. **No Synthetic Padding**: Do not insert synthetic `0` or fake samples into charts during disconnection or suspension.
5. **History Buffer Size**: Maintained at exactly 150 slots (`CHART_SIZE = 150`) matching Clash traffic history (`Size = 150` in `src/api/traffic.ts`).
6. **Telemetry Push-Only**: No periodic polling timers for telemetry; rely solely on the server push status stream.
7. **Clean Production Code**: Zero debug console logging (`[NATIVE ...]`, `[LIFECYCLE ...]`) and no global diagnostic hooks (`window.__SINGBOX_STREAM_DIAG__`).

---

## 8. Rejected / Superseded Approaches
- **DO NOT** add speculative connection calls in `SingBoxClient` constructor (causes duplicate stream race conditions with store initialization).
- **DO NOT** rely solely on React state in form submit handlers without reading `FormData` (breaks browser autofill and virtual keyboards in Incognito).
- **DO NOT** fill disconnected gaps with synthetic zeros in chart arrays.
- **DO NOT** poll native status with `setInterval`.
- **DO NOT** leave streams running when the document is hidden or frozen (leads to half-open dead sockets on mobile).

---

## 9. Relevant Files & Components
- `src/api/singbox.ts`: Native sing-box client, gRPC-Web transport, lifecycle handling, chart sources.
- `src/api/traffic.ts`: Clash traffic API, chart history buffer.
- `src/components/TrafficNow.tsx`: Overview metric cards (Upload, Download, Memory, Connections).
- `src/components/TrafficChart.tsx`: ChartJS rendering for traffic and memory.
- `src/components/BackendForm.tsx`: Form inputs with `FormData` extraction.
- `src/components/APIConfig.tsx`: Dual-backend management interface.
- `src/store/app.ts`: Redux store managing Clash and Native configs.

---

## 10. Next Steps
- **Next Task**: Verify chart history compatibility / synchronization across Clash and Native modes if any further chart enhancements are planned, or proceed with subsequent roadmap items.
- **Scope**: Keep changes minimal, preserve yacd chart styling, and ensure no regressions to lifecycle or form submission invariants.
- **Stopping Condition**: Verify all changes with `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` before committing.
