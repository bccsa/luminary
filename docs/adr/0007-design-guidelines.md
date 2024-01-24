# 7. Design guidelines

Date: 2024-01-24

## Status

Accepted

## Context

A primary goal of this application, both the user-facing app and the CMS, is that the interface is easy to use and has a modern look-and-feel. At the moment it is beyond the capabilities of our team to develop a full design system. However, we still want to give developers some guidelines on what to do and what not to do, so that we develop a uniform interface with well thought out interactions.

[Shopify Polaris](https://polaris.shopify.com/foundations) is the design system of Shopify, which contains a very extensive set of guides and do's and don'ts for admin interfaces.

The [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) are a set of best practices on designing for Apple platforms.

## Decision

We will use Polaris as our main resource on how to approach the design and layout of the CMS. We will use the Apple HIG as the main resource for best practices for the app, while keeping in mind that the app is cross-platform and should not have a too specific iOS interface.

## Consequences

We do not uncritically follow these resources, but apply them as a general rule. For places where we make significant design decisions that differ from the above resources their reasoning should be documented properly so that future developers can also use this knowledge.
