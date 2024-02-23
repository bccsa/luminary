# 6. Supported mobile OS versions

Date: 2024-01-12

## Status

Accepted

## Context

We want to reach as wide an audience as possible with the Luminary app. A lot of people in Africa have older phones with mainly older Android versions.

## Decision

We support as old an Android version as is possible. Capacitor only works in emulator from API level 24 (Android 7.0), so that is our minimum targeted version for now. We accept minor visual bugs on older Android versions, as long as the app is still usable.

iOS is a bit less of a concern because we expect less users there and the general longer support for iOS devices.

## Consequences

We need to be aware of major interface bugs in Android 7.0 and above, and fix them if they make the app unusable.
