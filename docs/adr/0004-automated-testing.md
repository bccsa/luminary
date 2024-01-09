# 4. Automated testing

Date: 2024-01-09

## Status

Accepted

## Context

Automated testing has become the industry standard when developing software projects.

## Decision

We aim for a "high" unit test coverage in all our code. We don't put a specific number on this as it might differ for each part of the code what could be realistically achieved. It is not our goal to test all our code, but to increase our confidence when developing.

We will also introduce end-to-end tests for some important scenarios, such as login, to make sure our entire stack is working. Since e2e tests can take long to run, we will limit the amount of these tests and how often they run, utilizing them in the cases where they cover a large part of important functionality.

## Consequences

Unit tests become a part of the code review process: PR's will be rejected by the reviewer if there is no unit test coverage for newly added code, unless a specific reason is provided why this was not added (as in rare cases it can be hard to unit test a piece of code - in that case an e2e test could be considered). Code can't be merged to `main` when the tests are not succeeding.
