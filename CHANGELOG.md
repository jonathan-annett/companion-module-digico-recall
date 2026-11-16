# Changelog

All notable changes to this module are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Each release also has a matching entry in the
test log in [docs/TESTING.md](docs/TESTING.md) saying what was tested and on what.

## [Unreleased]

Nothing yet.

## [0.2.11] - unreleased

Test builds are numbered as they are handed over, because Companion will not replace an
imported module with another build of the same version. 0.1.1 and 0.2.0 to 0.2.10 were test
builds and were never published; this entry covers everything since 0.1.0.

Since test build 0.2.9:

- **Gain down and gain up keys**, labelled "⬇ GAIN ⬇ -1 dB" and "⬆ GAIN ⬆ +1 dB". For the
  last touched input, the analogue gain moves by
  1 dB and the digital trim moves 1 dB the other way: the preamp is driven less (or more)
  and the level after the trim, and so the whole mix, stays as it was. For an input that
  is clipping going in: tap the down key until the meter is safe, then UNITY for a working
  fader position. The quieter-making change is sent first. The gain is read back and the
  trim follows what the preamp actually took. Quick taps are carried out one after
  another. The action's step can be set from 0.5 to 3 dB.
- Other channels fed from the same preamp will change level; only the channel the key
  acts on is compensated.
- A small RESULT key shows what the last GAIN or UNITY press did.

Since test build 0.2.8:

- **UNITY key: fader to 0 dB, level kept.** For the last touched input, the fader goes to
  0 dB and the channel's digital trim moves the other way by the same amount, so the
  level in the mix is unchanged and the fader is back where small moves make small
  changes. Because the trim changes the level into the processing, the gate, compressor
  and dynamic EQ thresholds move with it, and sends to the auxes named as pre-fader in
  the settings are moved to keep monitor mixes as they were. The analogue gain is left
  alone.
- **The move is gradual.** The console cannot change two settings at once, so it is done
  in half-dB steps about 40 ms apart, quietest change first within each step; the level
  is never more than half a dB from where it started. A 12 dB move takes about a second.
- If a setting would run out of range the move stops there and the key says what stopped
  it. A threshold of a processor that is switched out does not limit the move.
- New setting: pre-fader auxes (for example `1-6, 9`). The console does not report which
  sends are pre-fader. With none named, sends are not adjusted and the key says so.
- Inputs only for now.

Since test build 0.2.7:

- **A slot shows what has changed on the console since it was captured.** Open a slot on
  the web page and it is compared with the console, live. Values that differ are marked
  and listed first, with the console's present value beside the captured one, and two
  buttons: ↺ puts the captured value back on the console, 💾 takes the console's value
  into the capture. The same pair is on each group (EQ, COMP, LEVEL and so on) and, for
  everything at once, at the top: "Undo changes made on the console" and "Update capture
  from the console". So a new gain can be kept while compressor and fader changes are
  ignored or undone.
- Watching costs no console traffic: a channel is read once when its slot is opened, and
  after that the comparison uses the changes the console announces by itself. ⟳ reads it
  all again.
- Putting a value back sends just that value, whatever scope keys are lit.

Since test build 0.2.6:

- **Live keys on the web page.** A new Keys tab shows the chosen keys and works them
  directly: tap to press, hold CAPTURE for two seconds to clear, colours and texts update
  as on a Stream Deck. A tablet, phone or laptop can run the module with no Stream Deck
  and no page set up in Companion. "Show only the keys" (the page address ending in
  `#keys`) hides everything else, for a tablet left at the desk. The keys are the presets
  themselves, drawn and pressed through the same code Companion uses, so they cannot
  behave differently. The choice of size and keys is made on the Buttons tab and is
  remembered by each browser.

Since test build 0.2.5:

- **A ready-made page of buttons.** The web page has a new Buttons tab. Choose the deck
  (Stream Deck XL 8 × 4, MK.2 5 × 3, + 4 × 2, Mini 3 × 2, a tablet or web-buttons grid,
  or any size), tick the keys you want, see where they land, and download a page file to
  import into Companion. Each size starts with a set of keys that suits it; a page can
  also hold keys only, or more slots starting where another page stopped. The file is
  made from the module's own presets, for this connection, and holds no console address
  and none of your captures. Its layout follows a page exported from Companion 5.1.1.

Since test build 0.2.4:

- **GEQ is its own recall scope.** EQ used to cover both the parametric EQ of a channel
  or bus and graphic EQs. They are now separate toggle keys: EQ is the parametric EQ and
  filters; GEQ is a graphic EQ's bands, in/out and trim. A capture holding a channel and
  the graphic inserted on it can be recalled as either or both. Both are lit when the
  module starts. **A graphic EQ recall now needs GEQ lit, not EQ.** There is a new GEQ
  key in the Recall scope presets to add to your page; scripts already recorded are not
  affected, since they hold the values they send.
- Setup advice: if the console is not answering, or after changing the connection's
  settings, set Enable External Control to No and back to Yes. The console can stop
  answering a device that has been away for a while; the maintainer has seen the same
  with the iPad app in the field.

Since test build 0.2.3: recalls to ganged channels, after the maintainer's test on the
Quantum 338 offline software.

- **A recall writes to one member of a gang, not all of them.** The console treats values
  written to one member as that member's controls being moved, and moves the others by
  the same amounts. Writing to a second member would have dragged the first away from the
  recalled values whenever the two sides differed. Now the touched side is set exactly and
  the other follows, keeping whatever difference it had. A capture holding both sides of a
  gang writes the first only. The log entry for the recall names the channels left to
  follow, and their following is not taken for someone touching them.

Since test build 0.2.2: the SD-range consoles, checked against their own command sets.

- **SD8, SD9, SD11 and SD12 busses are captured in full.** DiGiCo's iPad command sets for
  the SD range show two families. Quantum 338, SD5, SD7 and SD10 have an eight-band EQ on
  groups, auxes and matrices; SD8, SD9, SD11 and SD12 have a four-band EQ plus high and
  low pass filters there, and those bus filters were not being captured. Inputs, graphic
  EQs and control groups are the same on all of them.
- **No console-type setting.** The module asks for both families' settings, and after two
  captures stops asking for the ones the connected console never answers (25 per bus on
  the smaller consoles, 4 on the larger). The first two bus captures after connecting take
  about a second longer; the audit log notes when the list is trimmed.
- `tools/check-dosc.mjs` reads the older command sets as well as the "V2" ones and says
  which family a file belongs to.

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

- **Ganged channels are recognised.** The console doesn't say which channels are ganged,
  but ganged channels report every change on both members at the same instant, moving by
  the same amount (they need not hold the same values). The module spots that, shows the
  pair on the GRAB and TO buttons ("GEQ 9+10 PC 1 L") and notes it in the log. The link
  is dropped if a member keeps moving on its own. Seen so far on graphic EQs on the
  Quantum 338 offline software. For what a recall does with a gang, see above.
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
- `tools/check-dosc.mjs`: compares the module's address list with any console's iPad command
  set file and reports the differences, so each console family can be checked.
- The web page's slot editor: reorder and remove steps, retarget a step, and choose
  whether it follows the scope keys or is sent in full.

### Fixed

- **Address list corrected against DiGiCo's own.** The parameter names were checked
  against the Quantum 338 iPad command set (`IPAD_Q3`, 815 commands). Every address the
  module uses is now in that list. Corrections: aux, group and matrix EQs are captured as
  eight bands plus the pre/post-insert switch (only four bands were captured before);
  busses have no separate high and low pass filters, so those are no longer asked for;
  the gate/ducker mode is captured on busses as well as inputs; the graphic EQ trim is
  captured.
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
