# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release also has a matching entry in the
test log in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

## [0.2.0] - unreleased

Reworked after the first sessions with Companion and the Quantum 338 offline software.
Buttons made with 0.1.0 for scripts, name sets and clearing need replacing with the new
presets; stored libraries are converted automatically.

### Changed

- **One kind of slot.** A slot can hold a capture, a script or a list of names, and is
  colour-coded by what it holds (green, purple, teal). The separate script buttons, name
  set buttons and their settings are gone. Internally everything is a list of steps.
- **Captures can hold several channels.** Press CAPTURE, touch as many channels as you
  like, then press a slot. Recalling sends the lit scopes to every channel in it.
- **Scripts can contain anything**, including other scripts and names. A script copies the
  values it sends at the moment it is recorded, so it cannot refer back to itself.
- **Names are saved by tapping.** Press SAVE NAMES, tap solo on each channel, press a slot.
  ALL NAMES adds every name. Recalling writes back only the names in the list.
- **Clearing.** Hold CAPTURE for two seconds, then press the slot to clear. Ends after one
  press, after ten seconds, or on CAPTURE or CANCEL. The rows of CLEAR buttons are gone.
- **The TO button names its target.** Set to the last touched channel, it reads "TO In 5
  Vox" so you can see where a recall will land. It only redirects a capture of a single
  channel.
- The last slot recalled is marked by yellow text, since colour now shows what a slot holds.
- Removed actions: script store/run, script clear, name set capture and restore.
  Removed settings: script slots, name sets.

### Added

- **Audit log.** Optional. Records every change the console reports with the time it
  arrived, the channel, the control and the value before and after; a fader move is one
  entry. Also records what the module does and connection changes. A LOG button switches
  it on and off; the web page's Log tab shows it live with a filter and CSV download; a
  folder can be set to keep one CSV file per day.
- **Meter capture (diagnostic).** A METER CAPTURE button, and a control in the Log tab,
  record ten seconds of everything meter-related the console sends, with timings and raw
  bytes, while asking for the known meter addresses. Read-only. The result downloads as a
  file. With a real iPad relayed through the module it records both directions in full
  instead and sends nothing itself, showing what the iPad app asks the console for. This is
  groundwork for level metering, which needs data from a console with audio.
- Setup help. The web page has a Setup tab built on a picture of the console's External
  Control page: type the console's own address into the box and it shows the device row to
  enter on the console, using this computer's address on that network, and saves the
  console address. The settings page shows the same row for the saved settings.
- Setup instructions now include loading the iPad command set with the console's "load"
  button, which the console needs before it will respond.
- A link to the web page at the top of the settings page.
- The web page's slot editor: reorder and remove steps, retarget a step, and choose
  whether it follows the scope keys or is sent in full.

### Fixed

- The module appeared in Companion's connection list as "DiGiCo: SD7; SD10; SD8; ..."
  instead of "DiGiCo: SD/Quantum Recall".
- Recall scope preset buttons wrapped their labels (COM/P, LEVE/L).
- The GRAB and TO buttons now show a touched channel's name even if it has never been
  captured.
- A query still waiting when the connection was stopped could raise an error.

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
