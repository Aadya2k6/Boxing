# BoxOS Portal Visual Theme Migration Guide

> **Canonical Reference Implementation**: Superadmin Portal (`.theme-superadmin-dark`)

---

## 1. PURPOSE

The **Superadmin Portal** was successfully migrated from a legacy light/gold dashboard theme to the established **BoxOS Dark Cinematic Platform Theme**.

This document serves as the **canonical, non-negotiable architectural guide** for visually migrating all remaining and future BoxOS portals, including:
- **Coach Portal**
- **Athlete Portal**
- **BoxOS Admin Portal**
- **Future Custom/Role Portals**

The objective of this migration pattern is to achieve 100% visual consistency with the platform identity (Home, Login, Register, Onboarding) by reusing the same dark cinematic design primitives and CSS token layer, **while preserving 100% of each portal's existing backend logic, routing, layout, and functionality**.

---

## 2. BOXOS PLATFORM COLOR SYSTEM

The BoxOS platform color system is anchored around a cinematic dark palette (`#050811`), restrained atmospheric glows, translucent glass panels, and crisp typography.

### 2.1 Core Platform Color Tokens & Values

| Token Name | CSS Custom Property | Tailwind v4 Token | Actual Implemented Value | Intended Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Background** | `--background` | `--color-background` | `#050811` | Root canvas / deep arena dark background |
| **Foreground** | `--foreground` | `--color-foreground` | `#F8FAFC` (Slate-100) | Primary text, titles, major headings |
| **Surface (Glass)**| `--surface` | `--color-surface` | `rgba(11, 15, 23, 0.75)` | Standard card/panel background with glassmorphism |
| **Elevated Surface**| `--elevated` | `--color-elevated` | `rgba(30, 41, 59, 0.6)` | Dropdowns, hover states, floating popovers |
| **Subtle Surface** | `--subtle` | `--color-subtle` | `rgba(255, 255, 255, 0.03)` | Subtle section backgrounds, input fields |
| **Card** | `--card` | `--color-color-card` | `rgba(11, 15, 23, 0.75)` | Bento cards, stat cards, metric containers |
| **Card Text** | `--card-foreground` | `--color-card-foreground` | `#F8FAFC` | Text rendered inside cards |
| **Popover** | `--popover` | `--color-popover` | `rgba(11, 15, 23, 0.75)` | Tooltips, context menus, popovers |
| **Popover Text** | `--popover-foreground`| `--color-popover-foreground`| `#F8FAFC` | Text rendered inside tooltips and popovers |
| **Border** | `--border` | `--color-border` | `rgba(255, 255, 255, 0.1)` | Subtle divider lines, card borders |
| **Border Strong** | `--border-strong` | `--color-border-strong` | `rgba(255, 255, 255, 0.15)` | Interactive control borders, focus outlines |
| **Muted Surface** | `--muted` | `--color-muted` | `rgba(255, 255, 255, 0.05)` | Disabled controls, inactive pills |
| **Muted Text** | `--muted-foreground` | `--color-muted-foreground` | `#94A3B8` (Slate-400) | Subtitles, secondary metadata, table headers |
| **Input** | `--input` | `--color-input` | `rgba(255, 255, 255, 0.1)` | Form control borders and background bases |
| **Primary** | `--primary` | `--color-primary` | `#EF4444` (Boxing Red) | Primary CTAs, active states, key emphasis |
| **Primary Light** | `--primary-light` | `--color-primary-light` | `#F87171` | Primary hover states |
| **Primary Dark** | `--primary-dark` | `--color-primary-dark` | `#DC2626` | Primary active/pressed states |
| **Secondary** | `--secondary` | `--color-secondary` | `rgba(30, 41, 59, 0.6)` | Secondary buttons, subtle badges |
| **Accent** | `--accent` | `--color-accent` | `rgba(239, 68, 68, 0.1)` | Tinted background highlight for primary items |
| **Accent Text** | `--accent-foreground` | `--color-accent-foreground` | `#EF4444` | Text rendered over tinted highlights |
| **Ring** | `--ring` | `--color-ring` | `#EF4444` | Focus ring glow |

### 2.2 Semantic Status Colors

| Role | Color Hex / RGBA | Usage in Codebase |
| :--- | :--- | :--- |
| **Success** | `#2E8F5A` / `#10B981` (Emerald) | Active status badges, collected revenue, completed items |
| **Warning** | `#C47C1A` / `#F59E0B` (Amber) | Outstanding revenue, pending RSVPs, caution alerts |
| **Info** | `#3B82F6` (Atmospheric Blue) | Informational tags, secondary charts, ambient atmosphere |
| **Destructive**| `#EF4444` (Boxing Red) | Critical actions, single class cancellations, delete modals |

---

## 3. TAILWIND CSS v4 THEME ARCHITECTURE

### 3.1 The Root Cause of Initial Migration Failures

During the initial migration of the Superadmin portal, defining standard CSS custom properties like `--surface: #050811` inside `.theme-superadmin-dark` failed to render dark components. Components continued rendering white backgrounds and dark text.

**Why this happened**:
1. The project utilizes **Tailwind CSS v4**.
2. Tailwind v4 generates internal utility variables with a `--color-*` prefix (e.g., `--color-surface`, `--color-background`, `--color-foreground`, `--color-border`).
3. Semantic classes like `bg-surface`, `text-foreground`, and `border-border` compile directly to:
   ```css
   .bg-surface { background-color: var(--color-surface); }
   .text-foreground { color: var(--color-foreground); }
   ```
4. During the build phase, Tailwind resolves `@theme inline { --color-surface: var(--surface); }` into the global `:root` scope. Redefining *only* `--surface` within a child class (`.theme-superadmin-dark`) does NOT re-evaluate `--color-surface` unless `--color-surface` is explicitly overridden in that class.

### 3.2 The Reference Implementation Fix

To ensure all dashboard components adapt automatically without modifying individual React files, **`.theme-superadmin-dark` explicitly redefines both the standard CSS custom properties AND Tailwind's `--color-*` variables**:

```css
/* src/styles.css */
.theme-superadmin-dark {
  /* Standard CSS Custom Properties */
  --background: #050811;
  --foreground: #F8FAFC;
  --surface: rgba(11, 15, 23, 0.75);
  --elevated: rgba(30, 41, 59, 0.6);
  --subtle: rgba(255, 255, 255, 0.03);
  
  --card: rgba(11, 15, 23, 0.75);
  --card-foreground: #F8FAFC;
  --popover: rgba(11, 15, 23, 0.75);
  --popover-foreground: #F8FAFC;
  
  --muted: rgba(255, 255, 255, 0.05);
  --muted-foreground: #94A3B8;
  
  --border: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.15);
  --input: rgba(255, 255, 255, 0.1);
  
  --primary: #EF4444;
  --primary-foreground: #FFFFFF;
  --primary-light: #F87171;
  --primary-dark: #DC2626;

  --secondary: rgba(30, 41, 59, 0.6);
  --secondary-foreground: #F8FAFC;
  
  --accent: rgba(239, 68, 68, 0.1);
  --accent-foreground: #EF4444;
  
  --destructive: #EF4444;
  --destructive-foreground: #FFFFFF;

  --success: #2E8F5A;
  --warning: #C47C1A;
  --info: #3B82F6;
  --ring: #EF4444;
  --superadmin: #EF4444;

  /* Explicit Tailwind v4 --color-* Namespace Overrides */
  --color-background: #050811;
  --color-foreground: #F8FAFC;
  --color-surface: rgba(11, 15, 23, 0.75);
  --color-elevated: rgba(30, 41, 59, 0.6);
  --color-subtle: rgba(255, 255, 255, 0.03);
  
  --color-card: rgba(11, 15, 23, 0.75);
  --color-card-foreground: #F8FAFC;
  --color-popover: rgba(11, 15, 23, 0.75);
  --color-popover-foreground: #F8FAFC;
  
  --color-muted: rgba(255, 255, 255, 0.05);
  --color-muted-foreground: #94A3B8;
  
  --color-border: rgba(255, 255, 255, 0.1);
  --color-border-strong: rgba(255, 255, 255, 0.15);
  --color-input: rgba(255, 255, 255, 0.1);
  
  --color-primary: #EF4444;
  --color-primary-foreground: #FFFFFF;
  --color-primary-light: #F87171;
  --color-primary-dark: #DC2626;

  --color-secondary: rgba(30, 41, 59, 0.6);
  --color-secondary-foreground: #F8FAFC;

  --color-accent: rgba(239, 68, 68, 0.1);
  --color-accent-foreground: #EF4444;

  --color-destructive: #EF4444;
  --color-destructive-foreground: #FFFFFF;

  --color-success: #2E8F5A;
  --color-warning: #C47C1A;
  --color-info: #3B82F6;
  --color-ring: #EF4444;
  --color-superadmin: #EF4444;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.5);
  --shadow-card: 0 4px 20px rgba(0,0,0,0.4);
  --shadow-elevated: 0 8px 32px rgba(0,0,0,0.5);
  --shadow-sidebar: 1px 0 0 0 rgba(255,255,255,0.08);
  --shadow-header: 0 1px 0 0 rgba(255,255,255,0.08);
}
```

---

## 4. SCOPING AND PORTAL ISOLATION

To prevent dark theme rules from leaking into unmigrated portals:
1. Theme overrides are strictly scoped inside `.theme-superadmin-dark`.
2. In `src/routes/superadmin.tsx`, the layout container dynamically sets `themeClass="theme-superadmin-dark"` on `DashboardLayout`.
3. In `DashboardLayout.tsx`, the root `<div>` applies `${themeClass}`:
   ```tsx
   <div className={`min-h-screen flex bg-background text-foreground relative ${themeClass}`}>
   ```
4. Future portals will follow the exact same isolation pattern:
   - Coach Portal: `themeClass="theme-coach-dark"`
   - Athlete Portal: `themeClass="theme-athlete-dark"`

---

## 5. TYPOGRAPHY

The typography hierarchy uses crisp, readable sans-serif fonts with distinct weights and tracking:

- **Headings & Display**: `font-display font-bold text-foreground` (or `text-2xl font-bold tracking-tight text-foreground`).
- **Body & Labels**: `text-sm text-foreground` or `text-muted-foreground`.
- **Micro Labels**: `label-micro` (`text-[10px] tracking-widest uppercase font-semibold text-muted-foreground`).
- **Tabular Data & Numbers**: `font-mono tabular-nums` or `tabular`.

---

## 6. ATMOSPHERE AND GLASS EFFECTS

The platform uses restrained ambient lighting to create visual depth:

- **Cinematic Canvas**: `#050811` base with subtle background glows.
- **Atmospheric Blue Glow**: Top-left radial glow using `rgba(59, 130, 246, 0.08)`.
- **Atmospheric Red Glow**: Top-right radial glow using `rgba(239, 68, 68, 0.08)`.
- **Glass Panel Surface**: `rgba(11, 15, 23, 0.75)` with `backdrop-blur-md` and `border border-white/10`.
- **Active Navigation Indicator**: Vertical accent pill (`width: 3px`, `border-radius: 0 4px 4px 0`) glowing with the portal's accent color.

---

## 7. DASHBOARD SHELL ADAPTATION

`DashboardLayout.tsx` serves as the universal layout container.

### 7.1 Key Adaptations
1. **Sidebar**: Styled with `bg-surface/80 backdrop-blur-md border-r border-border`.
2. **Header**: Styled with `bg-surface/60 backdrop-blur-md border-b border-border`.
3. **Avatar**: User avatar uses `bg-slate-800 text-slate-100 border border-white/10` in dark mode.
4. **Logo Integration**:
   - The `<Logo>` component supports `cinematicVariant={isDark}`.
   - In dark mode (`cinematicVariant={true}`), the **"BOX"** wordmark renders in `#F8FAFC` (white), while **"OS"** renders in `#EF4444` (Boxing Red).

---

## 8. COMPONENT MIGRATION PATTERN

Because the CSS variable layer maps Tailwind `--color-*` variables directly, standard UI primitives inherit the theme **automatically**:

- **Bento Cards & Section Cards**: Use `bg-surface border border-border text-foreground`.
- **Data Tables**: Headers use `text-muted-foreground border-b border-border`, rows use `hover:bg-subtle/50 text-foreground`.
- **Form Controls (`input-premium`)**: Inputs use `bg-subtle/40 border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary`.
- **Modals & Drawers**: Backdrop uses `bg-background/80 backdrop-blur-sm`, panel uses `bg-surface border border-border shadow-elevated text-foreground`.
- **Badges**: Use `bg-surface border border-border text-foreground` or semantic status tints (`bg-success/10 text-success`).

---

## 9. CALENDAR / DATE UI

Calendar components often contain hardcoded light-mode background colors that bypass general CSS tokens.

### 9.1 The Superadmin Calendar Refinement
In `src/routes/superadmin.class-assigning.tsx`, the calendar day cells previously used a hardcoded light cream background (`#FDF8F0`), creating invisible white-on-white text in dark mode.

### 9.2 The Reference Dark Calendar Pattern
- **Regular Day Cell**: `background: rgba(255, 255, 255, 0.04)`, `border: 1px solid rgba(255, 255, 255, 0.1)`, text: `text-slate-300 font-medium`.
- **Scheduled Class Day Cell**: `background: rgba(239, 68, 68, 0.25)`, `border: 1px solid rgba(239, 68, 68, 0.5)`, text: `text-white font-bold`.
- **Cancelled Class Day Cell**: `background: rgba(16, 185, 129, 0.25)`, `border: 1px solid rgba(16, 185, 129, 0.4)`, text: `text-emerald-300 font-bold`.

---

## 10. CHARTS AND DATA VISUALIZATION

Chart libraries (e.g., Recharts) do NOT automatically inherit CSS theme tokens unless explicitly configured.

### 10.1 Chart Colors & Styling Standard
- **Invoiced / Primary Bar**: `#EF4444` (Boxing Red) with rounded tops (`radius={[6, 6, 0, 0]}`).
- **Collected / Secondary Bar**: `#10B981` (Emerald Green).
- **Outstanding / Warning Bar**: `#F59E0B` (Amber).
- **Grid Lines**: `stroke="rgba(255, 255, 255, 0.08)"` with `vertical={false}`.
- **Axis Ticks**: `fill: "#94A3B8"`, `fontSize: 11`.
- **Chart Tooltip**:
  ```tsx
  contentStyle={{
    backgroundColor: "rgba(11, 15, 23, 0.95)",
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    fontSize: 12,
    color: "#F8FAFC",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
  }}
  ```

---

## 11. STATUS / SEMANTIC COLORS

Color choice must communicate functional meaning:

- **Red (`#EF4444`)**: Superadmin primary accent, critical errors, destructive actions.
- **Green/Emerald (`#10B981` / `#2E8F5A`)**: Active statuses, successful payments, collected revenue.
- **Amber (`#F59E0B` / `#C47C1A`)**: Pending RSVPs, warnings, outstanding balances.
- **Blue (`#3B82F6`)**: Informational tags, atmosphere, secondary analytics.
- **Slate (`#F8FAFC` / `#94A3B8`)**: Neutral content hierarchy.

---

## 12. LEGACY LIGHT / GOLD THEME REMOVAL

During the migration, all legacy gold and light theme elements were permanently removed from the Superadmin portal:

### 12.1 Purged Legacy Hex Values & Classes
- `#9E7C2A` (Legacy Gold Dark)
- `#C9A84C` (Legacy Gold Light)
- `#FDF8F0` (Cream background)
- `gold-glow`
- Legacy gold gradients

---

## 13. REMOVING UNNECESSARY UI

During the Superadmin migration, specific redundant cards (such as the "System Status / All systems nominal" alert block) were removed from the Overview page to clean up visual clutter.

*Note: UI removals are portal-specific product decisions and should not be automatically applied to other portals unless requested.*

---

## 14. WHAT IS UNIVERSAL VS PORTAL-SPECIFIC

| Universal (Shared Across All Portals) | Portal-Specific (Role-Based Customization) |
| :--- | :--- |
| `#050811` Dark background | Primary Role Accent Color (e.g., Red for Superadmin) |
| Glassmorphism panel styling (`rgba(11,15,23,0.75)`) | Active Navigation Highlight Tint (`bg-[role]/10`) |
| Border treatment (`rgba(255,255,255,0.1)`) | Role Pill Badge (`Superadmin Portal`, `Coach Portal`) |
| Tailwind v4 `--color-*` token architecture | Portal-specific navigation routes and menu items |
| Typography font families & weights | Domain-specific charts and dashboard widgets |
| Recharts dark tooltip styling | |
| Zero legacy gold styling | |

---

## 15. MIGRATION CHECKLIST FOR FUTURE PORTALS

When migrating a new portal (e.g., Coach or Athlete), follow this step-by-step checklist:

- [ ] **Step 1**: Open `src/styles.css` and create the scoped dark theme class (e.g., `.theme-coach-dark`).
- [ ] **Step 2**: Copy all `--color-*` and CSS custom property overrides from `.theme-superadmin-dark`.
- [ ] **Step 3**: Update the portal's primary accent token (e.g., `--color-primary` / `--color-coach`) if role-specific.
- [ ] **Step 4**: Apply `themeClass="theme-coach-dark"` to `DashboardLayout` in the portal's layout route.
- [ ] **Step 5**: Pass `cinematicVariant={isDark}` to `<Logo>` inside `DashboardLayout.tsx`.
- [ ] **Step 6**: Audit all route files for hardcoded light backgrounds (`bg-white`, `#FDF8F0`).
- [ ] **Step 7**: Audit all charts for hardcoded light grid lines, dark bar fills, or light tooltip styling.
- [ ] **Step 8**: Audit all calendar/date picker components for text contrast issues.
- [ ] **Step 9**: Perform a grep search for legacy gold hex codes (`#9E7C2A`, `#C9A84C`).
- [ ] **Step 10**: Run `npx tsc --noEmit` to verify type safety.
- [ ] **Step 11**: Open the browser and visually verify Overview, Tables, Forms, Modals, and Charts.

---

## 16. COMMON FAILURE MODES & FIXES

1. **Failure Mode: Components remain white despite CSS variables.**
   - *Fix*: Ensure both standard variables AND `--color-*` Tailwind namespace variables are overridden inside the scoped class in `styles.css`.
2. **Failure Mode: Logo "BOX" text is invisible on dark background.**
   - *Fix*: Pass `cinematicVariant={isDark}` to `<Logo>`.
3. **Failure Mode: Calendar dates render white-on-white.**
   - *Fix*: Replace hardcoded cream backgrounds (`#FDF8F0`) with translucent dark glass (`rgba(255,255,255,0.04)`).
4. **Failure Mode: Chart bars or tooltips render with white backgrounds.**
   - *Fix*: Update Recharts `CartesianGrid` stroke, `Bar` fill, and `Tooltip` `contentStyle` explicitly.

---

## 17. VALIDATION STANDARD

A portal migration is **only complete** when:
1. `npx tsc --noEmit` passes with 0 errors.
2. Visual inspection confirms 0 accidental light backgrounds or low-contrast text.
3. Overview, Tables, Forms, Modals, Calendars, and Charts have all been rendered and verified in the browser.
4. Backend, database, and authentication logic remain 100% untouched.

---

## 18. REFERENCE IMPLEMENTATION

The **Superadmin Portal** (`.theme-superadmin-dark`) is the official reference implementation for the BoxOS design system. All subsequent portal migrations must replicate this architecture.
