# Releasing

Bitfocus's instructions: <https://companion.free/for-developers/module-development/module-lifecycle/releasing-your-module/>

## Every release

1. Decide the version (`major.minor.patch`). Set it in **both** `package.json` and
   `companion/manifest.json`.
2. Move the items under "Unreleased" in `CHANGELOG.md` to a new heading for the version,
   with today's date, and update the links at the bottom.
3. Run the checks:
   ```
   yarn install
   yarn format:check
   yarn test
   yarn package
   ```
4. Run the parts of the manual plan in `docs/TESTING.md` that the changes touch (all of it
   for a minor or major release). Add rows to the test log and the findings table.
5. Commit, then tag with a leading `v` and push:
   ```
   git commit -am "Release v0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```
6. Publish a GitHub release for the tag, using the changelog entry as the notes. The
   `Release` workflow builds the package and attaches `digico-recall-<version>.tgz`.

## Submitting to Bitfocus

First time only: sign in at <https://developer.bitfocus.io/> with GitHub and request a
repository named `companion-module-digico-recall`. Bitfocus creates it under the `bitfocus`
organisation. Push this repository's history and tags there, and change the `repository`
and `bugs` addresses in `package.json` and `companion/manifest.json` to the new location.

Each release: in the Developer Portal open My Connections, choose the module, press
Submit Version, and pick the tag. Bitfocus builds and reviews from the tag.

Do not submit a version whose manual test plan is still marked "Not yet run".
