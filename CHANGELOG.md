# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release also has a matching entry in the
test log in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

## [0.1.1] - 2026-11-16

### Added

- The settings page now shows the console's External Devices row (Type, Name, IP Address,
  Send, Rcv, Enabled) filled in with the values to enter on the console, using this
  computer's address on the console's network and the saved ports.
- The web page has a Setup tab built on a picture of the console's External Control page.
  Type the console's own address (its "Local ... IP" line) into the box on the picture and
  the module finds which of this computer's addresses is on that network and shows the
  device row to enter on the console, with a flashing "set this on the console" pointer.
  A button saves the console address into the connection and reconnects. The page opens on
  this tab when the console isn't answering.

- Setup instructions (help, settings page and Setup tab) now include loading the iPad
  command set with the console's "load" button, which the console needs before it will
  respond.

### Changed

- A capture can now hold several channels. Press CAPTURE, touch as many channels as you
  like, then press a slot; recalling the slot sends the lit scopes to every channel in it.
  A multi-channel capture always returns to its own channels, whatever the recall target
  is set to. The web page lists and edits each channel in a capture. Libraries saved by
  0.1.0 (one channel per slot) are read and converted automatically.
- The TO button, when set to the last touched channel, now names that channel ("TO In 5
  Vox") instead of reading "TOUCHED", so you can see where a recall will land.
- Clearing: hold CAPTURE for two seconds and the next slot, script or name set button
  pressed is emptied. Clear mode ends after one press, after ten seconds, or when CAPTURE
  or CANCEL is tapped. The rows of "CLEAR n" preset buttons are gone; the clear actions
  remain for buttons made with 0.1.0.
- Saving names now works like capturing a channel. Press SAVE NAMES, tap solo on each
  channel whose name you want, then press a name set button to store the list. The same
  button restores it later, writing back only the names in the list. ALL NAMES adds every
  name to the list. The preset buttons "NAMES SAVE n" and "NAMES n" are replaced by
  SAVE NAMES, ALL NAMES and N1, N2... The 0.1.0 actions "capture every name" and "restore
  a name set" still exist, so buttons made with 0.1.0 keep working.

### Fixed

- Recall scope preset buttons wrapped their labels (COM/P, LEVE/L, DELA/Y, NAM/E, OTHE/R).
  The text size is now 14 so each label stays on one line.
- The module appeared in Companion's connection list as "DiGiCo: SD7; SD10; SD8; ..."
  instead of by name. Companion builds that title from the manifest's manufacturer and
  product list, which had been filled with console models. The product is now
  "SD/Quantum Recall", so it lists as "DiGiCo: SD/Quantum Recall". The console models moved
  to the search keywords.

## [0.1.0] - 2026-11-16

First test release. **Verified against a simulated console only.** It has not yet been run
inside Companion against DiGiCo software or a console; see the test log.

### Added

- Connection to DiGiCo SD and Quantum consoles over the iPad OSC link (console set up with
  this computer as a "DiGiCo Pad" external control device).
- Capture: arm, touch a channel (fader, mute or solo), and the whole channel is read;
  the next slot button pressed stores it. Also "capture last touched" and "capture a
  specific channel" actions. Works for inputs, groups, auxes, matrices, graphic EQs and
  control groups.
- Recall with scope toggles: EQ, COMP, GATE, LEVEL, AUX, GAIN, PAN, DELAY, NAME, OTHER.
- Recall target switch: back to the original channel, or onto the last touched channel.
- Scripts: record a sequence of recalls (each with its own scopes and target) and replay
  it from one button. Scripts keep their own copy of the values.
- Name sets: capture every channel, bus, graphic EQ and control group name; restore all or
  only chosen types.
- Web page served through Companion to browse and edit captures, scripts and names, send
  them to the console, and download or replace the whole library.
- Learn mode (off by default): parameters the console reports that are not in the module's
  list are added to future captures.
- iPad relay (off by default): pass a real iPad through the module, since the console
  accepts one iPad-type device.
- Library stored in the connection's configuration, with an optional copy in a file.
- Presets for every button, feedbacks for all states, and variables for button text.
- Tools: `tools/probe.mjs` to list what a console answers, `tools/preview.mjs` to try the
  web page with no console.
- 39 automated tests run against a simulated console (`yarn test`).

### Safety decisions

- Phantom power, main/alt input switching, the alt-input preamp and solo/listen states are
  never captured, so they can never be recalled.
- Values are sent back with the same OSC type and value the console reported.
- Recalls are paced (default 500 messages a second) rather than sent as one burst.
- A capture that gets no replies is reported and discarded, never stored empty.

### Known limitations

- Addresses come from an open-source table made by observing the iPad app. Any that differ
  on a given console or software version need correcting in `src/params.js`.
- Processing the iPad app cannot reach (Mustard, Spice Rack, Nodal processing, Waves,
  routing and insert assignment) is not available over this link.
- Requires Companion 4.3 or newer (module API 2.0).

[Unreleased]: https://github.com/jonathan-annett/companion-module-digico-recall/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/jonathan-annett/companion-module-digico-recall/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jonathan-annett/companion-module-digico-recall/releases/tag/v0.1.0
