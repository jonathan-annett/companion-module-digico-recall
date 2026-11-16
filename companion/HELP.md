# DiGiCo Recall

Capture whole channels from a DiGiCo SD or Quantum console at the press of a button, and
put back just the parts you choose (EQ, COMP, GATE, LEVEL, AUX, GAIN, PAN, DELAY, NAME).
Chain recalls into scripts, save and restore channel names, and browse or edit everything
in a web page.

It talks to the console the same way the DiGiCo iPad app does.

## Console setup

1. On the console: **Setup > External Control**, set **Enable External Control** to Yes.
2. Add a device, type **DiGiCo Pad**. Enter the IP address of the computer running
   Companion, a **send port** (default here: 8000) and a **receive port** (default 8001).
3. Switch the device on in the list (green tick).
4. Press **load** next to "commands allowed" at the bottom of that page and choose the iPad
   command set. The name depends on the console; on a Quantum 338 it is `ipad_q3`. Until a
   command set is loaded the console ignores the module.
5. In this connection's settings enter the console's IP address and the same two ports.

The easiest way to get the values right is the web page's **Setup** tab (address under
"Web page" below). It shows the console's External Control page: type the IP from the
console's "Local ... IP" line into the box, and it shows exactly what to enter in the
console's device row and saves the console address for you. The settings page lists the
same row for the saved settings.

Leave "OSC generic" off; this module doesn't use it. If the console is the DiGiCo offline
software on a Windows PC, allow inbound UDP on the receive port through Windows Firewall.

The console accepts one iPad-type device. To keep using a real iPad as well, turn on
**Relay a real iPad through this module** and point the iPad app at the Companion computer
instead of the console.

## Buttons

Everything is in the **Presets** tab, ready to drag onto pages. There is one idea behind
all of it: **press a button to start building something, do it on the console, then press
a slot to store it.** Press the slot again later to play it back.

**Slots**

A slot can hold any one of three things. Its colour says which:

- **Green: a capture.** One or more whole channels. When you recall it, only the lit
  recall scopes are sent.
- **Purple: a script.** A sequence of recalls, played back exactly as recorded.
- **Teal: names.** A list of channel names.

Pressing a slot stores whatever is waiting (the CAPTURE, SCRIPT REC or SAVE NAMES button
tells you when something is). Otherwise it recalls what the slot holds. The button shows
its contents, and the text of the last one recalled turns yellow.

**Capture**

- **CAPTURE**: press it (red), then nudge a fader or hit solo or mute on each channel you
  want: one, or several. Each is read in full and the button counts them. Then press a
  slot. Press CAPTURE again to cancel. Graphic EQs work the same way: touch a band.
- **Hold CAPTURE for two seconds** to clear a slot. The button reads "PRESS SLOT TO
  CLEAR"; the next slot you press is emptied. It gives up after ten seconds, or straight
  away if you tap CAPTURE or CANCEL. Nothing is sent to the console.
- **GRAB**: adds the last channel you touched to the capture, without arming first.
- **TO**: where a capture of a single channel lands. ORIGINAL sends it back to the channel
  it came from. Press it and it turns purple and names the last channel you touched ("TO
  In 5 Vox"); recalls now land there, so one capture works like a preset you can drop on
  any channel (input to group works too). Captures of several channels, scripts and names
  always go to the channels they were made for.
- **CANCEL**: stops whatever is being built.

**Recall scope**

- Toggle keys: EQ, COMP, GATE, LEVEL, AUX, GAIN, PAN, DELAY, NAME, OTHER. Only the lit
  ones are sent when you recall a capture (green slot). EQ includes the filters; LEVEL is
  fader and mute; GAIN is analogue gain, trim, pad and polarity; OTHER is insert on/off
  plus anything learned.

**Build**

- **SCRIPT REC**: press it, then press slots, changing the scope keys or the TO target
  between presses if you like. Each recall happens live and is added to the script. Press
  SCRIPT REC again, then press a slot to store the script there.
  - A script can include anything: captures, names, and other scripts.
  - A script holds its own copy of every value it sends. Changing or clearing the slots it
    was built from doesn't change it, and a script can never loop back into itself.
- **SAVE NAMES**: press it (red), then tap solo on each channel, group or aux whose name
  you want. The button counts them. Press a slot to store the list. Recalling that slot
  writes those names back and leaves every other name alone.
- **ALL NAMES**: while SAVE NAMES is red, adds every name on the console to the list.

**Log**

- **LOG**: switches the audit log on and off (blue when on). While it is on, every change
  the console reports is recorded with the time it arrived: which channel, which control,
  and the value before and after. A fader move is one entry, not hundreds. Everything the
  module does (store, recall, clear) and the connection coming and going is recorded too.
- The small text button next to it shows the latest change.
- Read the log live in the web page's **Log** tab: filter it ("in 5 eq"), pause it, and
  download it as a CSV file. To keep a permanent record, name a folder in the connection
  settings and the log is also written there, one CSV file per day.
- **METER CAPTURE** is a diagnostic, there to help build level metering in a future
  version. It records everything meter-related the console sends for ten seconds and asks
  the console for the meter addresses it knows of. It only reads; nothing on the console
  is changed. Touch a channel that has signal, press it (red while recording), and repeat a
  few times during a sound check. Download each result from the Log tab ("Meter capture")
  and send the files to the maintainer. If a log folder is set, the files are saved there
  too.
  - Better still, if you have the DiGiCo iPad app: turn on the iPad relay in the settings,
    point the app at the Companion computer, and capture while you look at a channel's
    meters, EQ and dynamics on the iPad. In that mode the module sends nothing itself and
    records exactly what the app asks the console for and what comes back.
- The log holds the latest 5,000 entries in memory. It records what the console tells an
  iPad-type device about, so anything the console doesn't announce can't be logged.

## Web page

The connection's settings page has an **Open the DiGiCo Recall web page** link at the top.
Or open `http://<companion address>:<port>/instance/<this connection's label>/`
(for example `http://127.0.0.1:8000/instance/digico-recall/`).

- **Slots**: every slot is a list of steps (a channel and the values to send to it). See
  and edit every value, remove or reorder steps, point a step at a different channel,
  choose whether a step follows the scope keys or is always sent in full, relabel the
  button, copy to another slot, or send it to the console.
- **Names**: read all names from the console, edit them in a grid, send back only what
  changed. Load names from a slot, or save the grid to one.
- **Log**: the audit trail, live. See Log above.
- **Library**: download everything as one file, or replace it from a file.

## What is not captured

Phantom power, main/alt input switching and solo states are left alone on purpose. Routing,
insert assignments, and plug-in style processing that the iPad app can't reach (Mustard,
Spice Rack, Nodal processing, Waves) are not available over this link.

**Learn** (in the settings): when on, any channel parameter the console reports that isn't
in the module's list is added to future captures of that channel type. Turn it on, wiggle
the control on the console once, and check the Library tab to see what was learned.

## Where things are stored

The library lives in this connection's configuration, so it travels with a Companion
export. You can also name a file in the settings to keep a copy on disk.
