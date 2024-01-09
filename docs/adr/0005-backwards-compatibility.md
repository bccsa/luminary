# 5. Backwards compatibility

Date: 2024-01-09

## Status

Accepted

## Context

We expect that many users of this app will not have regular access to fast internet. This can lead to them updating the app itself and its content infrequently. Furthermore, when publishing apps to the App/Play Store it might take several days before the update is accepted and published, or even longer in the case of a rejection.

## Decision

The app should be able to handle missing data, which could be caused by the user not updating the app itself, or by the local data being outdated compared to a newer app version. Empty or null values should be gracefully handled. We can be a bit more lenient in the case of our internal CMS, which needs to work online anyways.

## Consequences

Backwards compatibility will become a part of every (data) design decision. The frontend code should never assume certain data is available.
