// AI finding theme taxonomy: the closed list of defect classes an AI finding can be tagged with. Adapted from PerfMaster's theme taxonomy.

// Ids are permanent: renaming or reusing one splits its history across runs, so add ids rather than changing them.
// The group name is not part of the id.
export const AI_THEME_GROUPS = [
  {
    group: 'Typography & hierarchy',
    themes: [
      { id: 'heading-size-inconsistent', label: 'Same-level headings at different sizes' },
      { id: 'heading-vs-body-weak', label: 'Headings barely outrank body text' },
      { id: 'title-vs-heading-weak', label: 'Page title barely outranks headings' },
      { id: 'heading-levels-indistinct', label: 'Adjacent heading levels look alike' },
      { id: 'heading-order-illogical', label: 'Heading order inverted or jumbled' },
      { id: 'text-too-small', label: 'Text below a comfortable size' },
      { id: 'text-low-emphasis', label: 'Text too faint against its background' },
      { id: 'line-length-excessive', label: 'Line length beyond readable measure' },
      { id: 'all-caps-overuse', label: 'All-caps / letter-spaced overuse' },
    ],
  },
  {
    group: 'Imagery',
    themes: [
      { id: 'image-upscaled-lowres', label: 'Image rendered above native resolution' },
      { id: 'image-aspect-distorted', label: 'Image aspect ratio wrong' },
      { id: 'image-treatment-inconsistent', label: 'Images in a set treated inconsistently' },
      { id: 'items-visually-repetitive', label: 'Repeated items look identical' },
      { id: 'image-too-small', label: 'Image too small to evaluate' },
      { id: 'image-floats-in-empty-frame', label: 'Subject dwarfed by its own frame' },
      { id: 'image-missing-or-placeholder', label: 'Image missing or a placeholder' },
      { id: 'image-quality-unprofessional', label: 'Asset is not a catalog-grade image' },
      { id: 'image-alt-missing-or-wrong', label: 'Alt text missing or wrong' },
      { id: 'text-over-busy-image', label: 'Text legibility depends on a photo' },
    ],
  },
  {
    group: 'Layout & density',
    themes: [
      { id: 'page-excessively-long', label: 'Page scrolls far beyond reason' },
      { id: 'long-content-no-in-page-nav', label: 'Long page with no jump navigation' },
      { id: 'card-density-low', label: 'Cards so tall little fits per screen' },
      { id: 'grid-orphan-row', label: 'Orphaned item in the last grid row' },
      { id: 'section-underpopulated', label: 'Section empty or near-empty' },
      { id: 'sidebar-empty-column', label: 'Sidebar leaves a tall empty column' },
      { id: 'content-anchored-one-side', label: 'Content confined to one side' },
      { id: 'excessive-whitespace', label: 'Gaps far larger than the rhythm needs' },
      { id: 'label-value-gap-too-wide', label: 'Spec label and value pushed apart' },
      { id: 'elements-overlap', label: 'Elements overlap or collide' },
      { id: 'content-clipped-or-truncated', label: 'Content clipped or truncated' },
      { id: 'alignment-inconsistent', label: 'Edges and gutters do not line up' },
      { id: 'table-cramped-on-narrow-viewport', label: 'Table cramped at a narrow viewport' },
    ],
  },
  {
    group: 'CTA & controls',
    themes: [
      { id: 'cta-missing', label: 'No action where one is expected' },
      { id: 'cta-buried', label: 'Primary action buried by position' },
      { id: 'cta-weak-emphasis', label: 'Primary action under-styled' },
      { id: 'cta-repeated-redundant', label: 'Same action repeated verbatim' },
      { id: 'cta-competing', label: 'Secondary action outweighs the primary' },
      { id: 'affordance-unclear', label: 'Control gives no interactive signal' },
      { id: 'control-ineffective-in-context', label: 'Control useless in this page state' },
    ],
  },
  {
    group: 'Content',
    themes: [
      { id: 'content-duplicated', label: 'Same information shown twice' },
      { id: 'content-wall-of-text', label: 'Dense unbroken prose' },
      { id: 'content-order-suboptimal', label: 'Secondary content placed first' },
      { id: 'content-mismatched-context', label: 'Content does not match the subject' },
      { id: 'badge-signal-diluted', label: 'Badge on everything carries no signal' },
      { id: 'component-variants-inconsistent', label: 'Repeated components formatted inconsistently' },
      { id: 'identifier-jargon-leads', label: 'Raw code leads the label' },
      { id: 'price-lacks-emphasis', label: 'Price merged into metadata' },
      { id: 'price-unclear', label: 'Pricing hard to interpret' },
      { id: 'brand-identity-conflicting', label: 'Multiple entity names on one page' },
      { id: 'logo-wordmark-broken', label: 'Logo or wordmark renders broken' },
      { id: 'microcopy-ambiguous', label: 'Label does not say what it does' },
    ],
  },
  {
    group: 'Forms',
    themes: [
      { id: 'form-effort-inflated', label: 'Form asks more than the task needs' },
      { id: 'form-defaults-unhelpful', label: 'Default field values hide results' },
    ],
  },
];

export const AI_THEMES = AI_THEME_GROUPS.flatMap(g => g.themes);

export const AI_THEME_IDS = new Set(AI_THEMES.map(t => t.id));

export const AI_THEME_LABELS = Object.fromEntries(AI_THEMES.map(t => [t.id, t.label]));
