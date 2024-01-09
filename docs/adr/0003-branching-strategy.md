# 3. Branching strategy

Date: 2024-01-09

## Status

Accepted

## Context

In the previous BCC Africa app, we used different branches for staging and production, with feature branches being merged with merge commits to these release branches. This could create complicated situations were features were not deployed to both branches, and made it harder to easily rollback to a certain point.

## Decision

We will use a single `main` branch for both staging and production. Commits added to this branch will be automatically deployed to staging, and manually deployed to production. All code on this branch should be in a deployable and working state. If needed, unfinished features can be hidden behind a feature flag.

## Consequences

By using a single branch, it becomes very clear what is deployed to staging. It also forces us to be considerate when adding new code to this branch: because everyone is working off the same point, merging broken code can be very detrimental.

It makes it harder to deploy a hotfix to production, as releasing the `main` branch will include any other changes prior to that point. We accept this risk as we suspect that we will have a high release cadence, and if needed we can use feature flags to hide unfinished features.
