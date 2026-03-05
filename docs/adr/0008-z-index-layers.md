# 8. Z-index layers for overlays

Date: 2025-03-04

## Status

Accepted

## Context

Modals, popups, menus, and side panels can stack in unpredictable ways when each component sets its own z-index. Without a shared convention, overlays can appear behind or in front of the wrong layer, and stacking order becomes hard to reason about and maintain.

## Decision

We use fixed z-index ranges so that stacking order is consistent and predictable across the app and CMS:

| Layer              | Range   | Use for                                      |
|--------------------|---------|----------------------------------------------|
| Menu bars / side menus | 0–49   | Top nav, sidebars, drawer menus, dropdown menus |
| Popups             | 50–99   | Tooltips, dropdown panels, context menus, floating pickers |
| Modals             | 100–149 | Dialogs, confirmations, full-screen overlays |

- **Menu bars / side menus (0–49):** Persistent or semi-persistent chrome (navigation, side panels, drawer menus). Use lower values for background layers, higher for foreground within this band.
- **Popups (50–99):** Transient UI that appears above page content and menus (e.g. tooltips, dropdowns). Use the lower end for single popups, higher for nested or chained popups.
- **Modals (100–149):** Blocking overlays that focus the user on a single task. Use the lower end for a single modal, higher for modal-on-modal if ever needed.

When implementing a new overlay, choose the appropriate range and use a value within that range (e.g. modals at 100, 110, 120) to allow future insertion without conflicts.

## Consequences

- New overlay components must use z-index values from these ranges only.
- Stacking order is documented and easier to debug.
- Tailwind (or other utilities) can map to these ranges via custom values (e.g. `z-modal`, `z-popup`, `z-menu`) if the project adopts a design tokens approach later.
