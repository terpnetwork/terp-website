/*!
 * svg-launchpad/spec.js: the variables dictionary format and LLM prompts.
 * Text follows groot crates/terp-rs/docs/svgs/README.md and dictionary.md
 * (originally crates/cw-infuser/docs/svg.md and placeholder-dictionary-spec.md).
 */
import { NAME_GRAMMAR, MAX_SVG_SIZE, MAX_TOTAL_SUPPLY } from '/lib/svg-launchpad/engine.js';

export const KIND_SNIPPETS = [
  {
    kind: 'rgb',
    title: 'Random color',
    text: 'A random rgb(R,G,B); each channel is 0–255. Use it when any color is fine.',
    json: { name: 'color-bg', kind: 'rgb' },
    use: 'fill="${color-bg}"  →  fill="rgb(42,187,3)"',
  },
  {
    kind: 'rgb_styled',
    title: 'Color from a palette',
    text: 'Picks one of your ranges at random, then a shade inside it. Each range sets min and max (0–255) for red, green and blue. At least one range; min ≤ max on every channel.',
    json: { name: 'color-accent', kind: { rgb_styled: [
      { r_min: 180, r_max: 255, g_min: 0, g_max: 80, b_min: 0, b_max: 60 },
      { r_min: 0, r_max: 60, g_min: 50, g_max: 150, b_min: 180, b_max: 255 },
    ] } },
    use: 'stroke="${color-accent}"  →  stroke="rgb(214,31,12)"',
  },
  {
    kind: 'range',
    title: 'Number in a range',
    text: 'A decimal between min and max, inclusive. min and max are strings ("-2.5", "80"). precision is the number of decimals (0–18): 0 gives whole numbers. The value has no unit; put the unit after the placeholder.',
    json: { name: 'pulse-a', kind: { range: { min: '1.2', max: '4.5', precision: 2 } } },
    use: 'dur="${pulse-a}s"  →  dur="2.42s"',
  },
  {
    kind: 'options',
    title: 'One of a list',
    text: 'Picks one string from your list. The list must not be empty. Each option is equally likely; repeat an option to weight it.',
    json: { name: 'mode-shape', kind: { options: ['circle', 'circle', 'square'] } },
    use: 'href="#${mode-shape}"  →  href="#circle"',
  },
];

export const COLLECTION_LAYER_EXAMPLE = {
  version: '1',
  collection: 'my-collection',
  description: 'What the art shows and how it moves',
  palette_groups: [
    {
      id: 'orb',
      note: 'Orb fills; all members share these ranges',
      anchor: 'glow-color',
      members: ['color-a', 'color-b'],
      ranges: [
        { r_min: 50, r_max: 120, g_min: 220, g_max: 255, b_min: 50, b_max: 120 },
        { r_min: 0, r_max: 60, g_min: 200, g_max: 255, b_min: 200, b_max: 255 },
      ],
      entropy: 'medium',
    },
  ],
  motion_groups: [
    { id: 'breath', note: 'Slow pulse per orb', members: ['pulse-a', 'pulse-b'], min: '1.2', max: '4.5', precision: 2 },
  ],
  vars: [
    { name: 'glow-color', kind: { rgb_styled: [{ r_min: 50, r_max: 120, g_min: 220, g_max: 255, b_min: 50, b_max: 120 }] } },
    { name: 'color-a', kind: { rgb_styled: [{ r_min: 50, r_max: 120, g_min: 220, g_max: 255, b_min: 50, b_max: 120 }] } },
    { name: 'pulse-a', kind: { range: { min: '1.2', max: '4.5', precision: 2 } } },
  ],
};

export const ENTROPY_GRADIENTS = [
  ['tight', 'Nearly identical shades', '±10 per channel'],
  ['low', 'Subtle variation', '±25 per channel'],
  ['medium', 'Noticeable variety', '±50 per channel'],
  ['high', 'Wide variation inside a hue band', '±80 per channel'],
  ['full', 'Any color (use "rgb")', '0–255'],
];

export const TEMPLATE_RULES = [
  'Placeholders are ${name}. The name is everything up to the next "}"; use lowercase words joined by "-" (class-qualifier, e.g. color-a, pulse-slow).',
  'Every ${name} needs one variable with that name. A variable no placeholder uses is allowed but does nothing.',
  'Values are plain text dropped in place: no escaping. Keep <, >, & and quotes out of option values.',
  'Timing values have no unit: write dur="${pulse-a}s", not dur="${pulse-a}".',
  'Give every animated element a normal fill or stroke too. Animation does not play in still images, some wallets, or filtered views; paint set only by <animate> or <set> disappears there.',
  'Every #id you reference (url(#x), href="#x", begin="x.end") must exist in the same SVG. Ids must be unique.',
  'No scripts, <foreignObject>, event handlers (onload…), or links to outside files: the site filter removes them. Images must be inline data:image/png|jpeg|gif|webp.',
  `The template can be at most ${MAX_SVG_SIZE.toLocaleString('en-US')} bytes. Supply can be at most ${MAX_TOTAL_SUPPLY.toLocaleString('en-US')}.`,
];

export function nameGrammarRows() {
  return NAME_GRAMMAR.map((r) => {
    let def = '';
    if (r.kind === 'range' && r.min != null) def = `[${r.min}, ${r.max}] precision ${r.precision}`;
    else if (r.kind === 'options' && r.options) def = JSON.stringify(r.options);
    else if (r.kind === 'rgb_styled') def = 'palette ranges';
    else def = 'you choose';
    return { prefix: r.classes.map((c) => `${c}-*`).join(', '), kind: r.kind, def, note: r.note };
  });
}

function grammarText() {
  return nameGrammarRows().map((r) => `  ${r.prefix.padEnd(22)} → ${r.kind.padEnd(10)} ${r.def}${r.note ? `  (${r.note})` : ''}`).join('\n');
}

function kindsText() {
  return KIND_SNIPPETS.map((k) => `- ${k.kind}: ${k.text}\n  ${JSON.stringify(k.json)}`).join('\n');
}

/** Prompt: write a new template. */
export function promptTemplate({ idea = '' } = {}) {
  return `You are writing an SVG template for an on-chain generative NFT collection on Terp Network (cw721-svg contract).
The contract stores one SVG template with \${name} placeholders. At mint it replaces each placeholder with a value picked from that variable's definition. Nothing else changes, so the template must be a complete, valid SVG on its own.

What to draw: ${idea || '<describe the art here>'}

Rules for the template:
${TEMPLATE_RULES.map((r) => `- ${r}`).join('\n')}

Name placeholders by meaning; the first word sets the kind of value:
${grammarText()}

Variable kinds (the "kind" field):
${kindsText()}

Reply with two code blocks and nothing else:
1. The SVG template (no comments needed).
2. A JSON dictionary in this format, with exactly one entry in "vars" for every placeholder name:
${JSON.stringify(COLLECTION_LAYER_EXAMPLE, null, 2)}`;
}

/** Prompt: write the dictionary for an existing template (dictionary.md "LLM Prompting Contract"). */
export function promptDictionary({ template = '', counts = [] } = {}) {
  const names = counts.length ? counts.map((c) => `- ${c.name} (${c.count}×)`).join('\n') : '- (paste a template first)';
  return `Write the variables dictionary (Collection Layer, version 1) for this SVG template used by Terp Network's cw721-svg contract.

Name grammar: varname ::= class ( "-" qualifier )*. The class sets the kind:
${grammarText()}

Variable kinds:
${kindsText()}

Rules:
- "vars" must contain exactly one { "name", "kind" } for every placeholder below, and no others.
- Variables in one palette group share identical rgb_styled ranges. Pick an entropy gradient per group (tight ±10, low ±25, medium ±50, high ±80 per channel, full = "rgb").
- Timing values (pulse, flicker, drift…) are unitless ranges; the template already appends "s".
- range min/max are strings; precision is 0–18.
- options are strings; keep <, >, & and quotes out of them.

Placeholders found (name, times used):
${names}

Template:
\`\`\`svg
${template}
\`\`\`

Reply with only the JSON dictionary:
{ "version": "1", "collection": "...", "description": "...", "palette_groups": [...], "motion_groups": [...], "vars": [...] }`;
}

/** Prompt: fix the problems the checks found. */
export function promptFix({ template = '', variables = [], problems = [] } = {}) {
  return `This SVG template and its variables are for Terp Network's cw721-svg contract. The checks below failed. Fix the template and/or the variables so every check passes, and keep the art the same otherwise.

Problems:
${problems.length ? problems.map((p) => `- ${p}`).join('\n') : '- (no problems found)'}

Rules:
${TEMPLATE_RULES.map((r) => `- ${r}`).join('\n')}

Template:
\`\`\`svg
${template}
\`\`\`

Variables:
\`\`\`json
${JSON.stringify(variables, null, 2)}
\`\`\`

Reply with the fixed SVG template and the fixed variables JSON array, as two code blocks.`;
}
