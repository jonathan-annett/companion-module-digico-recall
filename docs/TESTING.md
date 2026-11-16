# Testing

This file has three parts: the automated tests and what each proves, the manual test plan
for real DiGiCo software and consoles, and a dated log of every test run. The log is
append-only. A release is not tagged until its row is in the log.

## 1. Automated tests

```
yarn install
yarn test          # node --test test/*.test.mjs
```

The tests run the real module code over real UDP sockets against `test/sim-console.mjs`,
a stand-in console that answers `/?` queries, applies and echoes values written to it,
announces "surface" changes, and can be told to drop packets.

**What the simulator cannot prove.** It is built from the same address list as the module,
so it shows the logic is right, not that a real console uses those addresses, replies in
that form, or announces fader and solo changes to an iPad-type device. Those are covered
by the manual plan below.

### test/module.test.mjs: the operator's workflow, in order

| #   | Test                                                     | What it shows                                                                                                         |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | OSC codec round-trips floats, ints and strings           | Encoding and decoding agree, including the `/?` query form                                                            |
| 2   | connects and learns console name and channel counts      | Start-up queries work; counts drive later captures                                                                    |
| 3   | arm, touch a channel, press a slot                       | The full capture path. Every address on the channel is stored even though the simulator drops 1 in 17 replies         |
| 4   | library is saved into the Companion config               | Captures persist                                                                                                      |
| 5   | recall sends only the scopes that are switched on        | EQ and GAIN restored; COMP, GATE and fader left alone; no name or phantom sent                                        |
| 6   | the console echoing a recall is not mistaken for a touch | "Last touched" stays on the channel the operator touched                                                              |
| 7   | recall to the last touched channel                       | An input capture's compressor lands on a group; the original is unchanged                                             |
| 8   | graphic EQ capture and recall                            | All 32 bands plus in/out                                                                                              |
| 9   | record a script and run it from one button               | Two steps with different scopes; still works after the source slots are cleared                                       |
| 10  | capture all names to a set, then restore                 | Only the chosen types are written back                                                                                |
| 11  | NAME scope carries a channel name                        | Name restored with a preset                                                                                           |
| 12  | web page and API                                         | Page is served; edit a value, relabel, send, read and write names, edit a script; invalid input is refused or cleaned |
| 13  | library survives a restart and a config edit             | Including Companion's settings form, which doesn't carry the library                                                  |
| 14  | a silent console produces a warning                      | No empty capture is stored                                                                                            |

### test/behaviour.test.mjs: edge cases and safety

| #   | Test                                                            | What it shows                                                                                                             |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | parameter table                                                 | Every address maps to a scope; no phantom, solo, listen, meter or alt-input address is in any capture list; no duplicates |
| 2   | aux send capture follows the console's aux count                | 7 auxes gives 21 send values                                                                                              |
| 3   | OSC decoder tolerates bundles, address-only packets and garbage | Malformed input never throws                                                                                              |
| 4   | while armed, meters and console info do not trigger a capture   | Only a real control change does; the solo state is not stored                                                             |
| 5   | cancel                                                          | Arming twice cancels; cancel drops a waiting capture and a recording                                                      |
| 6   | slot buttons while busy or empty                                | Nothing is sent to the console                                                                                            |
| 7   | recall with no scopes on                                        | Nothing is sent                                                                                                           |
| 8   | GEQ and channel captures are not interchangeable                | Refused with a warning; GEQ to GEQ works                                                                                  |
| 9   | script recorded with "last touched" target                      | Replays to the channels it was aimed at, wherever the operator touches later                                              |
| 10  | empty script recording                                          | Discarded                                                                                                                 |
| 11  | learn mode                                                      | Unknown parameter learned, persisted and captured; solo, meters, phantom never learned                                    |
| 12  | learn mode off                                                  | Unknown parameters ignored                                                                                                |
| 13  | pacing                                                          | 33 values at 200 a second take at least 100 ms                                                                            |
| 14  | OSC types preserved                                             | An int read is an int sent                                                                                                |
| 15  | validation                                                      | Bad snapshots, scripts, names and libraries are dropped or repaired                                                       |
| 16  | connection status                                               | Connecting, OK, then failure when replies stop                                                                            |
| 17  | library file                                                    | Written on change, read on start                                                                                          |
| 18  | iPad relay                                                      | Passes both ways; iPad query replies are not touches; iPad writes are                                                     |

### test/sdk.test.mjs: against the Companion SDK

| #   | Test                                       | What it shows                                                                      |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | manifest passes the SDK validator          | `companion/manifest.json` is acceptable to Companion                               |
| 2   | manifest, package.json and changelog agree | Same name and version; changelog entry exists                                      |
| 3   | entry point shape                          | Default export extends `InstanceBase`; `UpgradeScripts` is exported                |
| 4   | settings                                   | Every field has a default; ids unique                                              |
| 5   | actions and feedbacks are well formed      | And every feedback is false while stopped                                          |
| 6   | actions while stopped                      | Do nothing, without throwing                                                       |
| 7   | presets                                    | Only use actions, feedbacks, options and variables that exist; each is listed once |

## 2. Manual test plan

Run these against the DiGiCo offline software and then each console. Record the result in
the log. "Console" below means the offline software or a desk.

**Setup.** Console: Setup > External Control, enable, add a "DiGiCo Pad" device with the
Companion computer's IP, send port 8000, receive port 8001, and switch it on. Companion:
add the connection with the console's IP and the same ports. Put the preset buttons on a
page. Start from a session you don't mind changing.

Before the numbered cases, run the probe with the Companion connection disabled and keep
its output with the log entry:

```
node tools/probe.mjs <console-ip> 8001 8000 Input_Channels 1
node tools/probe.mjs <console-ip> 8001 8000 Group_Outputs 1
node tools/probe.mjs <console-ip> 8001 8000 Graphic_EQ 1
```

| ID  | Steps                                                                                                                          | Expected                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| M1  | Enable the connection                                                                                                          | Status OK; `$(recall:console)` shows the console name                               |
| M2  | Run the probe for an input                                                                                                     | Counts are reported; note how many addresses are answered and list any that are not |
| M3  | Move an input fader on the console                                                                                             | `$(recall:touched)` shows that channel and its name                                 |
| M4  | Repeat M3 with mute, solo, an EQ knob, a group fader, a GEQ band                                                               | Each updates "touched". Note any that don't                                         |
| M5  | Press CAPTURE, move input 1's fader, press slot 1                                                                              | Button goes red, amber, then slot 1 turns green and shows the channel               |
| M6  | Open the web page, Captures, slot 1                                                                                            | Values match the console's screen for EQ, dynamics, gain, sends                     |
| M7  | Change input 1's EQ, comp and fader. Light only EQ. Press slot 1                                                               | EQ returns; comp and fader stay changed                                             |
| M8  | Light COMP only, press slot 1                                                                                                  | Comp returns                                                                        |
| M9  | Repeat with GATE, LEVEL, AUX, GAIN, PAN, DELAY one at a time                                                                   | Each restores only its own section. Note any value that lands wrong                 |
| M10 | Check phantom on input 1 before and after every recall above                                                                   | Never changes                                                                       |
| M11 | Set TO to TOUCHED, touch input 2, light EQ, press slot 1                                                                       | Input 2 gets input 1's EQ; input 1 unchanged                                        |
| M12 | With TOUCHED, touch a group, press slot 1 with EQ and COMP lit                                                                 | Group gets the EQ and comp                                                          |
| M13 | Capture a graphic EQ to slot 2, flatten it on the console, recall with EQ lit                                                  | Curve returns                                                                       |
| M14 | Record a script: EQ on slot 1, then COMP on slot 1 to another channel. Store to script 1. Change both channels. Press script 1 | Both restored                                                                       |
| M15 | NAMES SAVE 1. Rename three channels on the console. NAMES 1                                                                    | Names return                                                                        |
| M16 | Web page, Names: read, edit two names, send changed                                                                            | Console shows the new names                                                         |
| M17 | Web page: edit one EQ gain in slot 1, save, send to console                                                                    | Console shows the edited value                                                      |
| M18 | Restart Companion                                                                                                              | Slots, scripts and name sets are still there                                        |
| M19 | Recall a full channel (all scopes) ten times quickly                                                                           | No dropped values, console stays responsive                                         |
| M20 | Turn on Learn, move a control the probe didn't list, check Library tab                                                         | Address appears under "Learned"; next capture includes it                           |
| M21 | iPad relay on, iPad app pointed at Companion                                                                                   | iPad works as normal; captures and recalls still work                               |
| M22 | Pull the network cable for 30 s, reconnect                                                                                     | Status goes to failure and back to OK without restarting                            |

## 3. Test log

| Date       | Version | What was run                                                                                           | Environment                                                     | Result                                                           |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2026-11-16 | 0.1.0   | Automated suite, 39 tests                                                                              | Node 22.23.4, Linux, simulated console                          | 39 passed, 0 failed                                              |
| 2026-11-16 | 0.1.0   | Package build (`yarn package`)                                                                         | @companion-module/base 2.0.4, tools 3.2.1                       | Built `digico-recall-0.1.0.tgz`; manifest validated by the build |
| 2026-11-16 | 0.1.0   | Web page, all four tabs: open a capture, relabel and save, open a script step, read names, edit a name | Headless Chrome against `tools/preview.mjs` (simulated console) | Rendered correctly, no browser console errors                    |
| 2026-11-16 | 0.1.0   | Manual plan M1 to M22                                                                                  | DiGiCo offline software / consoles                              | **Not yet run**                                                  |

### Console coverage

| Console                        | Software version | Probe run | Manual plan | Notes |
| ------------------------------ | ---------------- | --------- | ----------- | ----- |
| Quantum 338 (offline software) |                  | No        | Not yet run |       |
| Quantum 338                    |                  | No        | Not yet run |       |
| SD10                           |                  | No        | Not yet run |       |
| SD11                           |                  | No        | Not yet run |       |
| SD9                            |                  | No        | Not yet run |       |
| SD8                            |                  | No        | Not yet run |       |

### Findings

Problems found during testing, and what was done about them.

| Date       | Found by                  | Finding                                                                                                                                                  | Resolution                                                                                             |
| ---------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 2026-11-16 | Automated test 3 (module) | With 1 in 17 replies dropped, one address was dropped on the first ask and again on the single retry, so a capture came back one value short             | Unanswered addresses are now asked for twice more instead of once. Test passes with the same loss rate |
| 2026-11-16 | Web page check            | The status API returned the list of scope definitions under the same key as the list of active scopes, so the header could not show which scopes were on | Definitions moved to their own key (`scopeDefs`) before first release                                  |
