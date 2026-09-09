# Design Contract

This document is mandatory before implementing production screens. It prevents visual drift, fabricated content, and expensive design changes later.

## Product Feel

```text
Local · Calm · Specific · Useful · Trustworthy · Decision-focused
```

The product must feel like a carefully designed local utility, not a generic AI landing page or template dashboard.

## Never Use

- Purple gradients
- Pill-shaped buttons as the default button style
- Fake reviews, ratings, testimonials, or social proof
- Fake metrics, counters, booking numbers, user counts, or provider counts
- Vague hero copy or unsupported product promises
- Emoji as interface icons
- Cursor-following animation
- Excessive scroll-triggered animation
- Autoplay background video
- Decorative glassmorphism or generic AI effects
- AI-generated or stock-like imagery presented as a real place
- AI-generated filler copy presented as factual content
- “Made with AI” labels in the product
- Em dashes in product copy

## Required

- Royal blue primary action color
- White and light-gray surfaces
- Charcoal primary text and muted secondary text
- Rectangular buttons with modest corner radius
- Consistent icon library
- Real, licensed, provider-submitted, or clearly labeled placeholder media
- Practical facts above decorative content
- Restrained transitions only when they clarify state
- Responsive mobile, tablet, and desktop layouts
- Favicon and correct metadata
- Keyboard support and list fallback for maps

## Content Rules

All copy must be specific and supported by actual functionality or data.

Good:

> Find verified local experiences in Mumbai and Navi Mumbai that fit your time, budget, and route.

Bad:

> Discover unforgettable moments with intelligent travel magic.

Honest empty and failure states include:

- `No verified events match this time window.`
- `We could not confirm live availability for this experience.`
- `There are not enough verified results for these filters.`

## Anti-Fabrication Checklist

```text
No record without source metadata
No event without expiry data
No review without a real submission
No metric without a real measurement source
No image without usage rights or attribution
No video without source and verification status
No recommendation explanation without matching signals
No live-availability claim without an authoritative current signal
```

## Media Rules

- Use approved external YouTube media first.
- Support Instagram through approved embeds or an external-link fallback.
- Store URLs and metadata, never downloaded or re-hosted third-party videos.
- Show creator and platform attribution.
- Never use video as proof of current price, hours, availability, safety, or booking state.
- Do not autoplay media in cards.

## Motion Rules

- No cursor animation.
- No decorative scroll choreography.
- No animation required to understand content.
- Use short transitions for state changes, bottom sheets, route updates, and loading feedback.
- Respect reduced-motion preferences.

## Pre-Design Gate

Before screen design is approved, review:

- Design tokens and color roles
- Button/control shapes
- Typography scale
- Card variants
- Icon library
- Image and video sourcing
- Copy examples
- Empty and error states
- Animation limits
- Favicon and metadata
- Legal-page placement
