---
name: Indigo Shield
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  pane-margin: 16px
  stack-gap: 12px
---

## Brand & Style
The design system is engineered for high-stakes enterprise environments where clarity and trust are paramount. The brand personality is professional, vigilant, and unobtrusive, designed to sit harmoniously within the Microsoft Outlook ecosystem while maintaining a distinct identity. 

The aesthetic follows a **Modern Corporate** style with a focus on **Minimalism**. It prioritizes heavy white space to reduce cognitive load during security interventions. The emotional response should be one of "calm authority"—ensuring the user feels guided rather than punished when a data policy is triggered. Visual complexity is minimized to ensure that security status indicators remain the focal point of the interface.

## Colors
The palette is centered around a commanding Indigo Blue, used strategically for primary actions and brand presence. To maintain a lightweight feel within the Outlook sidebar and modal windows, the system avoids pure black, utilizing a deep slate for text and light grays for structural elements.

- **Primary (Indigo):** Used for main action buttons, active states, and key iconography.
- **Surface & Background:** Predominantly white (#FFFFFF) with neutral off-whites for secondary containers to create subtle hierarchy.
- **Status Indicators:** Success, Warning, and Error colors are calibrated for high legibility against white backgrounds, specifically tuned to harmonize with the primary Indigo without clashing.
- **Borders:** Extremely light gray (#E2E8F0) is used to define areas without creating visual "noise."

## Typography
This design system utilizes **Inter** for its exceptional legibility and systematic feel, serving as a modern alternative to Segoe UI that provides better scaling and weight distribution.

The typographic hierarchy is intentionally compact to accommodate the restricted real estate of the Outlook Add-in task pane. 
- **Headlines:** Use semi-bold weights with slight negative letter-spacing for a modern, "locked-in" look.
- **RTL Support:** All typography must support bi-directional rendering. When switching to RTL languages (Hebrew/Arabic), line heights should be increased by 10% to accommodate script descenders, and weights should be monitored for clarity.
- **Functional Labels:** Captions and labels use a slightly tighter size but increased weight to ensure they remain readable at a glance.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for the Outlook Task Pane (typically 320px - 400px wide). 

- **Margins:** A consistent 16px (md) margin is applied to the left and right of the task pane to prevent content from crowding the edges.
- **Stacking:** Elements are stacked vertically with a 12px gap to maintain a sense of grouping without wasting vertical space.
- **RTL Logic:** The layout must fully flip for RTL. This includes mirroring the direction of progress bars, icon placement (relative to text), and the alignment of chevron indicators.
- **Mobile/Small Screen:** For narrow windows, the 16px margin reduces to 12px to maximize the content area.

## Elevation & Depth
This design system uses a **Tonal Layering** approach combined with **Ambient Shadows**. 

Depth is communicated through:
- **Level 0 (Base):** The primary white background.
- **Level 1 (Surface):** Secondary containers (like policy cards) use a very light neutral fill or a subtle 1px border.
- **Floating Elements:** Modals or tooltips use an "Extra-diffused" shadow: `0 4px 20px rgba(79, 70, 229, 0.08)`. The shadow is slightly tinted with the Indigo primary color to maintain a cohesive atmospheric feel.
- **Interaction:** On hover, buttons and cards transition their border-color or increase shadow spread slightly to provide tactile feedback.

## Shapes
The shape language is **Rounded**, utilizing an 8px base radius for standard components and 12px - 16px for larger containers.

- **Standard (8px):** Applied to buttons, input fields, and checkboxes.
- **Large (16px):** Applied to main feature cards or policy alert banners.
- **Pill:** Reserved exclusively for status tags (e.g., "Encrypted", "External") to differentiate them from actionable buttons.

## Components
Consistent styling across components ensures the Add-in feels like a high-quality extension of the user's workflow.

- **Buttons:** Primary buttons are solid Indigo with white text. Secondary buttons use a white background with an Indigo border.
- **Policy Cards:** These are the core of the DLP experience. They feature a 1px border (#E2E8F0), an 8px corner radius, and a 4px left-edge (or right-edge for RTL) accent bar in the appropriate status color (Success, Warning, Error).
- **Input Fields:** Use a subtle light gray border that transitions to Indigo on focus. The focus state includes a soft 2px outer glow in Indigo at 20% opacity.
- **Status Indicators:** Icons (Check, Alert, X) should be paired with text. In RTL mode, icons must be placed to the right of the label.
- **Checkboxes & Radios:** Use the primary Indigo for the checked state. The hit area is padded to ensure ease of use in touch-enabled versions of Outlook.
- **Empty States:** Use light-weighted Indigo line-art icons and centered "Body-md" text to guide users when no policy issues are present.