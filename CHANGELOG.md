# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release also has a matching entry in the
test log in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

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

[Unreleased]: https://github.com/jonathan-annett/companion-module-digico-recall/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jonathan-annett/companion-module-digico-recall/releases/tag/v0.1.0
