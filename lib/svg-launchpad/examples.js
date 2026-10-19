/*! svg-launchpad/examples.js: example templates and dictionaries. */
export const EXAMPLES = [
 {
  "id": "dao-fixed",
  "title": "Yin-yang (DAO), eyes with a static fill",
  "note": "The DAO collection template from groot scripts/cw-infuser/svgs/interchain/dao/template.svg (comments removed), with the eye fix: each eye has a base fill, so it shows when animation does not play.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" height=\"28\" viewBox=\"0 0 28 28\" width=\"28\" transform=\"rotate(180deg)\">\n  <defs>\n    \n\n    \n    <clipPath id=\"wipe-yin\">\n      <circle cx=\"19.5\" cy=\"14\" r=\"0\">\n        <animate attributeName=\"cx\"\n          values=\"19.5; 14; 8.5; 8.5; 14; 19.5\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"cy\"\n          values=\"14; 20; 14; 14; 8; 14\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"r\"\n          values=\"0; 16; 28; 28; 16; 0\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n      </circle>\n    </clipPath>\n\n    \n    <clipPath id=\"wipe-yang\">\n      <circle cx=\"8.5\" cy=\"14\" r=\"0\">\n        <animate attributeName=\"cx\"\n          values=\"8.5; 14; 19.5; 19.5; 14; 8.5\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"cy\"\n          values=\"14; 8; 14; 14; 20; 14\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"r\"\n          values=\"0; 16; 28; 28; 16; 0\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n      </circle>\n    </clipPath>\n  </defs>\n\n  \n  <circle cx=\"14\" cy=\"14\" r=\"13\" fill=\"${color-yin}\"/>\n\n  \n  <path d=\"M14 14\n    C14 10.9624 11.5376 8.5 8.5 8.5\n    C5.46243 8.5 3 10.9624 3 14\n    C3 20.0751 7.92487 25 14 25\n    C20.0751 25 25 20.0751 25 14\n    C25 17.0376 22.5376 19.5 19.5 19.5\n    C16.4624 19.5 14 17.0376 14 14Z\"\n    fill=\"${color-yin}\"/>\n\n  \n  <path d=\"M14 14\n    C14 10.9624 11.5376 8.5 8.5 8.5\n    C5.46243 8.5 3 10.9624 3 14\n    C3 20.0751 7.92487 25 14 25\n    C20.0751 25 25 20.0751 25 14\n    C25 17.0376 22.5376 19.5 19.5 19.5\n    C16.4624 19.5 14 17.0376 14 14Z\"\n    fill=\"${color-yang}\" clip-path=\"url(#wipe-yin)\"/>\n\n  \n  <path d=\"M14 14\n    C14 17.0376 16.4624 19.5 19.5 19.5\n    C22.5376 19.5 25 17.0376 25 14\n    C25 7.92487 20.0751 3 14 3\n    C7.92487 3 3 7.92487 3 14\n    C3 10.9624 5.46243 8.5 8.5 8.5\n    C11.5376 8.5 14 10.9624 14 14Z\"\n    fill=\"${color-yang}\"/>\n\n  \n  <path d=\"M14 14\n    C14 17.0376 16.4624 19.5 19.5 19.5\n    C22.5376 19.5 25 17.0376 25 14\n    C25 7.92487 20.0751 3 14 3\n    C7.92487 3 3 7.92487 3 14\n    C3 10.9624 5.46243 8.5 8.5 8.5\n    C11.5376 8.5 14 10.9624 14 14Z\"\n    fill=\"${color-yin}\" clip-path=\"url(#wipe-yang)\"/>\n\n  \n  \n  <circle cx=\"8.5\" cy=\"14\" r=\"1.5\" fill=\"${color-yang}\">\n    <animate attributeName=\"fill\"\n      values=\"${color-yang}; ${color-yang}; ${color-yin}; ${color-yin}; ${color-yang}; ${color-yang}\"\n      keyTimes=\"0; 0.10; 0.12; 0.88; 0.90; 1\"\n      dur=\"${drift-cycle}s\" repeatCount=\"indefinite\" fill=\"freeze\"/>\n  </circle>\n\n  \n  <circle cx=\"19.5\" cy=\"14\" r=\"1.5\" fill=\"${color-yin}\">\n    <animate attributeName=\"fill\"\n      values=\"${color-yin}; ${color-yin}; ${color-yang}; ${color-yang}; ${color-yin}; ${color-yin}\"\n      keyTimes=\"0; 0.10; 0.12; 0.88; 0.90; 1\"\n      dur=\"${drift-cycle}s\" repeatCount=\"indefinite\" fill=\"freeze\"/>\n  </circle>\n\n  \n  <path clip-rule=\"evenodd\"\n    d=\"M14 0C6.26801 0 0 6.26801 0 14C0 21.732 6.26801 28 14 28C21.732 28 28 21.732 28 14C28 6.26801 21.732 0 14 0ZM14 1.25C6.95837 1.25 1.25 6.95837 1.25 14C1.25 21.0416 6.95837 26.75 14 26.75C21.0416 26.75 26.75 21.0416 26.75 14C26.75 6.95837 21.0416 1.25 14 1.25Z\"\n    fill-rule=\"evenodd\" fill=\"${color-yang}\"/>\n</svg>",
  "dictionary": {
   "version": "1",
   "collection": "yinyang-fish",
   "description": "Yin-yang as two fish; a circular wipe floods each fish with the opposite color. Eyes carry a static base fill so they show without animation.",
   "palette_groups": [
    {
     "id": "duality",
     "note": "Paired Options: index i of color-yin pairs with index i of color-yang",
     "anchor": "color-yin",
     "members": [
      "color-yin",
      "color-yang"
     ],
     "entropy": "full"
    }
   ],
   "motion_groups": [
    {
     "id": "cycle",
     "note": "One shared cycle for every animation",
     "members": [
      "drift-cycle"
     ],
     "min": "4.0",
     "max": "14.0",
     "precision": 1
    }
   ],
   "vars": [
    {
     "name": "color-yin",
     "kind": {
      "options": [
       "rgb(64,38,14)",
       "rgb(34,34,37)",
       "rgb(0,0,0)",
       "rgb(18,18,28)",
       "rgb(42,30,60)",
       "rgb(14,40,56)",
       "rgb(58,22,22)",
       "rgb(20,44,20)"
      ]
     }
    },
    {
     "name": "color-yang",
     "kind": {
      "options": [
       "rgb(141,93,51)",
       "rgb(56,56,64)",
       "rgb(221,221,222)",
       "rgb(180,175,200)",
       "rgb(170,150,200)",
       "rgb(140,190,210)",
       "rgb(200,140,130)",
       "rgb(150,200,150)"
      ]
     }
    },
    {
     "name": "drift-cycle",
     "kind": {
      "range": {
       "min": "4.0",
       "max": "14.0",
       "precision": 1
      }
     }
    }
   ]
  }
 },
 {
  "id": "dao-live",
  "title": "Yin-yang (DAO), as deployed on mainnet",
  "note": "The template stored in terp1tsk4\u2026dc2w. Its eyes get color only from <animate>; the checks flag that.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" height=\"28\" viewBox=\"0 0 28 28\" width=\"28\" transform=\"rotate(180deg)\">\n  <defs>\n    \n\n    \n    <clipPath id=\"wipe-yin\">\n      <circle cx=\"19.5\" cy=\"14\" r=\"0\">\n        <animate attributeName=\"cx\"\n          values=\"19.5; 14; 8.5; 8.5; 14; 19.5\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"cy\"\n          values=\"14; 20; 14; 14; 8; 14\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"r\"\n          values=\"0; 16; 28; 28; 16; 0\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n      </circle>\n    </clipPath>\n\n    \n    <clipPath id=\"wipe-yang\">\n      <circle cx=\"8.5\" cy=\"14\" r=\"0\">\n        <animate attributeName=\"cx\"\n          values=\"8.5; 14; 19.5; 19.5; 14; 8.5\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"cy\"\n          values=\"14; 8; 14; 14; 20; 14\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n        <animate attributeName=\"r\"\n          values=\"0; 16; 28; 28; 16; 0\"\n          keyTimes=\"0; 0.2; 0.45; 0.55; 0.8; 1\"\n          dur=\"${drift-cycle}s\" repeatCount=\"indefinite\"/>\n      </circle>\n    </clipPath>\n  </defs>\n\n  \n  <circle cx=\"14\" cy=\"14\" r=\"13\" fill=\"${color-yin}\"/>\n\n  \n  <path d=\"M14 14\n    C14 10.9624 11.5376 8.5 8.5 8.5\n    C5.46243 8.5 3 10.9624 3 14\n    C3 20.0751 7.92487 25 14 25\n    C20.0751 25 25 20.0751 25 14\n    C25 17.0376 22.5376 19.5 19.5 19.5\n    C16.4624 19.5 14 17.0376 14 14Z\"\n    fill=\"${color-yin}\"/>\n\n  \n  <path d=\"M14 14\n    C14 10.9624 11.5376 8.5 8.5 8.5\n    C5.46243 8.5 3 10.9624 3 14\n    C3 20.0751 7.92487 25 14 25\n    C20.0751 25 25 20.0751 25 14\n    C25 17.0376 22.5376 19.5 19.5 19.5\n    C16.4624 19.5 14 17.0376 14 14Z\"\n    fill=\"${color-yang}\" clip-path=\"url(#wipe-yin)\"/>\n\n  \n  <path d=\"M14 14\n    C14 17.0376 16.4624 19.5 19.5 19.5\n    C22.5376 19.5 25 17.0376 25 14\n    C25 7.92487 20.0751 3 14 3\n    C7.92487 3 3 7.92487 3 14\n    C3 10.9624 5.46243 8.5 8.5 8.5\n    C11.5376 8.5 14 10.9624 14 14Z\"\n    fill=\"${color-yang}\"/>\n\n  \n  <path d=\"M14 14\n    C14 17.0376 16.4624 19.5 19.5 19.5\n    C22.5376 19.5 25 17.0376 25 14\n    C25 7.92487 20.0751 3 14 3\n    C7.92487 3 3 7.92487 3 14\n    C3 10.9624 5.46243 8.5 8.5 8.5\n    C11.5376 8.5 14 10.9624 14 14Z\"\n    fill=\"${color-yin}\" clip-path=\"url(#wipe-yang)\"/>\n\n  \n  <circle cx=\"8.5\" cy=\"14\" r=\"1.5\">\n    <animate attributeName=\"fill\"\n      values=\"${color-yang}; ${color-yang}; ${color-yin}; ${color-yin}; ${color-yang}; ${color-yang}\"\n      keyTimes=\"0; 0.10; 0.12; 0.88; 0.90; 1\"\n      dur=\"${drift-cycle}s\" repeatCount=\"indefinite\" fill=\"freeze\"/>\n  </circle>\n\n  \n  <circle cx=\"19.5\" cy=\"14\" r=\"1.5\">\n    <animate attributeName=\"fill\"\n      values=\"${color-yin}; ${color-yin}; ${color-yang}; ${color-yang}; ${color-yin}; ${color-yin}\"\n      keyTimes=\"0; 0.10; 0.12; 0.88; 0.90; 1\"\n      dur=\"${drift-cycle}s\" repeatCount=\"indefinite\" fill=\"freeze\"/>\n  </circle>\n\n  \n  <path clip-rule=\"evenodd\"\n    d=\"M14 0C6.26801 0 0 6.26801 0 14C0 21.732 6.26801 28 14 28C21.732 28 28 21.732 28 14C28 6.26801 21.732 0 14 0ZM14 1.25C6.95837 1.25 1.25 6.95837 1.25 14C1.25 21.0416 6.95837 26.75 14 26.75C21.0416 26.75 26.75 21.0416 26.75 14C26.75 6.95837 21.0416 1.25 14 1.25Z\"\n    fill-rule=\"evenodd\" fill=\"${color-yang}\"/>\n</svg>",
  "dictionary": {
   "version": "1",
   "collection": "yinyang-fish",
   "description": "Yin-yang as two fish; a circular wipe floods each fish with the opposite color. Eyes carry a static base fill so they show without animation.",
   "palette_groups": [
    {
     "id": "duality",
     "note": "Paired Options: index i of color-yin pairs with index i of color-yang",
     "anchor": "color-yin",
     "members": [
      "color-yin",
      "color-yang"
     ],
     "entropy": "full"
    }
   ],
   "motion_groups": [
    {
     "id": "cycle",
     "note": "One shared cycle for every animation",
     "members": [
      "drift-cycle"
     ],
     "min": "4.0",
     "max": "14.0",
     "precision": 1
    }
   ],
   "vars": [
    {
     "name": "color-yin",
     "kind": {
      "options": [
       "rgb(64,38,14)",
       "rgb(34,34,37)",
       "rgb(0,0,0)",
       "rgb(18,18,28)",
       "rgb(42,30,60)",
       "rgb(14,40,56)",
       "rgb(58,22,22)",
       "rgb(20,44,20)"
      ]
     }
    },
    {
     "name": "color-yang",
     "kind": {
      "options": [
       "rgb(141,93,51)",
       "rgb(56,56,64)",
       "rgb(221,221,222)",
       "rgb(180,175,200)",
       "rgb(170,150,200)",
       "rgb(140,190,210)",
       "rgb(200,140,130)",
       "rgb(150,200,150)"
      ]
     }
    },
    {
     "name": "drift-cycle",
     "kind": {
      "range": {
       "min": "4.0",
       "max": "14.0",
       "precision": 1
      }
     }
    }
   ]
  }
 },
 {
  "id": "orbs",
  "title": "Orbs: all four variable kinds",
  "note": "Shows rgb_styled palette groups, range values with units outside the placeholder, options, and animation on top of a static fill.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\" width=\"400\" height=\"400\">\n  <defs>\n    <radialGradient id=\"glow\">\n      <stop offset=\"0%\" stop-color=\"${glow-color}\" stop-opacity=\"0.9\"/>\n      <stop offset=\"100%\" stop-color=\"${glow-color}\" stop-opacity=\"0\"/>\n    </radialGradient>\n  </defs>\n  <rect width=\"200\" height=\"200\" fill=\"${color-bg}\"/>\n  <circle cx=\"100\" cy=\"100\" r=\"90\" fill=\"url(#glow)\"/>\n  <g transform=\"rotate(${rotate-ring} 100 100)\">\n    <circle cx=\"100\" cy=\"40\" r=\"${size-orb}\" fill=\"${color-a}\" opacity=\"${opacity-a}\">\n      <animate attributeName=\"opacity\" values=\"${opacity-a};1;${opacity-a}\" dur=\"${pulse-a}s\" repeatCount=\"indefinite\"/>\n    </circle>\n    <circle cx=\"152\" cy=\"130\" r=\"${size-orb}\" fill=\"${color-b}\">\n      <animate attributeName=\"fill\" values=\"${color-b};${glow-color};${color-b}\" dur=\"${pulse-b}s\" repeatCount=\"indefinite\"/>\n    </circle>\n    <circle cx=\"48\" cy=\"130\" r=\"${size-orb}\" fill=\"${color-a}\"/>\n  </g>\n  <text x=\"100\" y=\"190\" text-anchor=\"middle\" font-family=\"monospace\" font-size=\"9\" fill=\"${color-a}\">${mode-mark}</text>\n</svg>\n",
  "dictionary": {
   "version": "1",
   "collection": "orbs",
   "description": "Three orbs on a dark field. One shared neon palette for the orbs and the glow; slow independent pulses.",
   "palette_groups": [
    {
     "id": "neon",
     "note": "Orb fills and glow share the same neon bands",
     "anchor": "glow-color",
     "members": [
      "glow-color",
      "color-a",
      "color-b"
     ],
     "ranges": [
      {
       "r_min": 50,
       "r_max": 120,
       "g_min": 220,
       "g_max": 255,
       "b_min": 50,
       "b_max": 120
      },
      {
       "r_min": 0,
       "r_max": 60,
       "g_min": 200,
       "g_max": 255,
       "b_min": 200,
       "b_max": 255
      },
      {
       "r_min": 200,
       "r_max": 255,
       "g_min": 60,
       "g_max": 140,
       "b_min": 180,
       "b_max": 255
      }
     ],
     "entropy": "medium"
    }
   ],
   "motion_groups": [
    {
     "id": "breath",
     "note": "Slow pulse per orb",
     "members": [
      "pulse-a",
      "pulse-b"
     ],
     "min": "1.2",
     "max": "4.5",
     "precision": 2
    }
   ],
   "vars": [
    {
     "name": "glow-color",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 50,
        "r_max": 120,
        "g_min": 220,
        "g_max": 255,
        "b_min": 50,
        "b_max": 120
       },
       {
        "r_min": 0,
        "r_max": 60,
        "g_min": 200,
        "g_max": 255,
        "b_min": 200,
        "b_max": 255
       },
       {
        "r_min": 200,
        "r_max": 255,
        "g_min": 60,
        "g_max": 140,
        "b_min": 180,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "color-bg",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 0,
        "r_max": 20,
        "g_min": 0,
        "g_max": 20,
        "b_min": 10,
        "b_max": 40
       }
      ]
     }
    },
    {
     "name": "color-a",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 50,
        "r_max": 120,
        "g_min": 220,
        "g_max": 255,
        "b_min": 50,
        "b_max": 120
       },
       {
        "r_min": 0,
        "r_max": 60,
        "g_min": 200,
        "g_max": 255,
        "b_min": 200,
        "b_max": 255
       },
       {
        "r_min": 200,
        "r_max": 255,
        "g_min": 60,
        "g_max": 140,
        "b_min": 180,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "color-b",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 50,
        "r_max": 120,
        "g_min": 220,
        "g_max": 255,
        "b_min": 50,
        "b_max": 120
       },
       {
        "r_min": 0,
        "r_max": 60,
        "g_min": 200,
        "g_max": 255,
        "b_min": 200,
        "b_max": 255
       },
       {
        "r_min": 200,
        "r_max": 255,
        "g_min": 60,
        "g_max": 140,
        "b_min": 180,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "rotate-ring",
     "kind": {
      "range": {
       "min": "0",
       "max": "360",
       "precision": 0
      }
     }
    },
    {
     "name": "size-orb",
     "kind": {
      "range": {
       "min": "8",
       "max": "18",
       "precision": 1
      }
     }
    },
    {
     "name": "opacity-a",
     "kind": {
      "range": {
       "min": "0.35",
       "max": "0.9",
       "precision": 2
      }
     }
    },
    {
     "name": "pulse-a",
     "kind": {
      "range": {
       "min": "1.2",
       "max": "4.5",
       "precision": 2
      }
     }
    },
    {
     "name": "pulse-b",
     "kind": {
      "range": {
       "min": "1.2",
       "max": "4.5",
       "precision": 2
      }
     }
    },
    {
     "name": "mode-mark",
     "kind": {
      "options": [
       "I",
       "II",
       "III",
       "IV",
       "V"
      ]
     }
    }
   ]
  }
 },
 {
  "id": "broken",
  "title": "Broken on purpose",
  "note": "A missing variable, two references to ids that do not exist, an eye painted only by animation, and an unused variable.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\" width=\"300\" height=\"300\" fill=\"none\">\n  <rect width=\"100\" height=\"100\" fill=\"${color-bg}\"/>\n  <circle cx=\"50\" cy=\"50\" r=\"30\" fill=\"url(#halo)\"/>\n  <circle cx=\"35\" cy=\"45\" r=\"6\">\n    <animate attributeName=\"fill\" values=\"${color-eye};white;${color-eye}\" dur=\"${pulse-a}s\" repeatCount=\"indefinite\"/>\n  </circle>\n  <use href=\"#pupil\"/>\n  <circle cx=\"65\" cy=\"45\" r=\"6\" fill=\"${color-iris}\"/>\n</svg>\n",
  "dictionary": [
   {
    "name": "color-bg",
    "kind": "rgb"
   },
   {
    "name": "color-eye",
    "kind": {
     "rgb_styled": [
      {
       "r_min": 0,
       "r_max": 255,
       "g_min": 0,
       "g_max": 255,
       "b_min": 0,
       "b_max": 255
      }
     ]
    }
   },
   {
    "name": "pulse-a",
    "kind": {
     "range": {
      "min": "1.2",
      "max": "4.5",
      "precision": 2
     }
    }
   },
   {
    "name": "blur-unused",
    "kind": {
     "range": {
      "min": "0.5",
      "max": "8.0",
      "precision": 1
     }
    }
   }
  ]
 },
 {
  "id": "shield-mint",
  "title": "Terp orb shield: mint",
  "note": "The Terp orb shield: the site's disc (solid core, rim, short soft edge, small halo) on the 13-dot Terp mark. Variables set the core, rim, halo and background colours, glow strength, blur and pulse, which arms show (inner arms and diagonals switch on or off: full mark, cross, ring or bare plus), and a rotation that acts as the pattern seed. Every disc has a static fill; the pulse only changes glow opacity.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-72 -72 144 144\" width=\"144\" height=\"144\">\n  <defs>\n    <radialGradient id=\"disc-fill\">\n      <stop offset=\"0\" stop-color=\"${color-core}\"/>\n      <stop offset=\"0.36\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.69\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.74\" stop-color=\"${color-halo}\" stop-opacity=\"0.3\"/>\n      <stop offset=\"0.86\" stop-color=\"${color-halo}\" stop-opacity=\"0.09\"/>\n      <stop offset=\"1\" stop-color=\"${color-halo}\" stop-opacity=\"0\"/>\n    </radialGradient>\n    <filter id=\"glow\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">\n      <feGaussianBlur stdDeviation=\"${blur-glow}\"/>\n    </filter>\n  </defs>\n  <rect x=\"-72\" y=\"-72\" width=\"144\" height=\"144\" fill=\"${color-bg}\"/>\n  <g transform=\"rotate(${rotate-pattern}) scale(${scale-shield})\">\n    <g filter=\"url(#glow)\" opacity=\"${opacity-glow}\">\n      <animate attributeName=\"opacity\" values=\"${opacity-glow};1;${opacity-glow}\" dur=\"${pulse-glow}s\" repeatCount=\"indefinite\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <g opacity=\"${toggle-inner}\">\n        <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n      <g opacity=\"${toggle-diagonal}\">\n        <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n    </g>\n    <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <g opacity=\"${toggle-inner}\">\n      <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n    <g opacity=\"${toggle-diagonal}\">\n      <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n  </g>\n</svg>",
  "dictionary": {
   "version": "1",
   "collection": "orb-shield-mint",
   "description": "Terp mint discs on a near-black field; full mark most often, sometimes cross, ring or bare plus.",
   "palette_groups": [
    {
     "id": "shield",
     "note": "Core, rim and halo of every disc",
     "anchor": "color-rim",
     "members": [
      "color-core",
      "color-rim",
      "color-halo"
     ],
     "entropy": "low"
    }
   ],
   "motion_groups": [
    {
     "id": "glow",
     "note": "Halo breathes between its base opacity and full",
     "members": [
      "pulse-glow"
     ],
     "min": "2.40",
     "max": "5.00",
     "precision": 2
    }
   ],
   "vars": [
    {
     "name": "color-core",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 200,
        "r_max": 235,
        "g_min": 245,
        "g_max": 255,
        "b_min": 200,
        "b_max": 235
       }
      ]
     }
    },
    {
     "name": "color-rim",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 90,
        "r_max": 150,
        "g_min": 210,
        "g_max": 245,
        "b_min": 140,
        "b_max": 190
       },
       {
        "r_min": 120,
        "r_max": 170,
        "g_min": 225,
        "g_max": 255,
        "b_min": 120,
        "b_max": 170
       }
      ]
     }
    },
    {
     "name": "color-halo",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 100,
        "r_max": 160,
        "g_min": 220,
        "g_max": 255,
        "b_min": 170,
        "b_max": 220
       }
      ]
     }
    },
    {
     "name": "color-bg",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 4,
        "r_max": 14,
        "g_min": 8,
        "g_max": 18,
        "b_min": 6,
        "b_max": 14
       }
      ]
     }
    },
    {
     "name": "opacity-glow",
     "kind": {
      "range": {
       "min": "0.25",
       "max": "0.70",
       "precision": 2
      }
     }
    },
    {
     "name": "blur-glow",
     "kind": {
      "range": {
       "min": "1.5",
       "max": "4.0",
       "precision": 1
      }
     }
    },
    {
     "name": "pulse-glow",
     "kind": {
      "range": {
       "min": "2.40",
       "max": "5.00",
       "precision": 2
      }
     }
    },
    {
     "name": "rotate-pattern",
     "kind": {
      "range": {
       "min": "0",
       "max": "0",
       "precision": 0
      }
     }
    },
    {
     "name": "scale-shield",
     "kind": {
      "range": {
       "min": "0.95",
       "max": "1.00",
       "precision": 2
      }
     }
    },
    {
     "name": "toggle-inner",
     "kind": {
      "options": [
       "0",
       "1",
       "1"
      ]
     }
    },
    {
     "name": "toggle-diagonal",
     "kind": {
      "options": [
       "0",
       "1",
       "1"
      ]
     }
    }
   ]
  }
 },
 {
  "id": "shield-amber",
  "title": "Terp orb shield: amber, turned",
  "note": "The Terp orb shield: the site's disc (solid core, rim, short soft edge, small halo) on the 13-dot Terp mark. Variables set the core, rim, halo and background colours, glow strength, blur and pulse, which arms show (inner arms and diagonals switch on or off: full mark, cross, ring or bare plus), and a rotation that acts as the pattern seed. Every disc has a static fill; the pulse only changes glow opacity.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-72 -72 144 144\" width=\"144\" height=\"144\">\n  <defs>\n    <radialGradient id=\"disc-fill\">\n      <stop offset=\"0\" stop-color=\"${color-core}\"/>\n      <stop offset=\"0.36\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.69\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.74\" stop-color=\"${color-halo}\" stop-opacity=\"0.3\"/>\n      <stop offset=\"0.86\" stop-color=\"${color-halo}\" stop-opacity=\"0.09\"/>\n      <stop offset=\"1\" stop-color=\"${color-halo}\" stop-opacity=\"0\"/>\n    </radialGradient>\n    <filter id=\"glow\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">\n      <feGaussianBlur stdDeviation=\"${blur-glow}\"/>\n    </filter>\n  </defs>\n  <rect x=\"-72\" y=\"-72\" width=\"144\" height=\"144\" fill=\"${color-bg}\"/>\n  <g transform=\"rotate(${rotate-pattern}) scale(${scale-shield})\">\n    <g filter=\"url(#glow)\" opacity=\"${opacity-glow}\">\n      <animate attributeName=\"opacity\" values=\"${opacity-glow};1;${opacity-glow}\" dur=\"${pulse-glow}s\" repeatCount=\"indefinite\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <g opacity=\"${toggle-inner}\">\n        <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n      <g opacity=\"${toggle-diagonal}\">\n        <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n    </g>\n    <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <g opacity=\"${toggle-inner}\">\n      <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n    <g opacity=\"${toggle-diagonal}\">\n      <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n  </g>\n</svg>",
  "dictionary": {
   "version": "1",
   "collection": "orb-shield-amber",
   "description": "Warm amber and gold discs, full mark only, turned up to 45° per token.",
   "palette_groups": [
    {
     "id": "shield",
     "note": "Core, rim and halo of every disc",
     "anchor": "color-rim",
     "members": [
      "color-core",
      "color-rim",
      "color-halo"
     ],
     "entropy": "medium"
    }
   ],
   "motion_groups": [
    {
     "id": "glow",
     "note": "Halo breathes between its base opacity and full",
     "members": [
      "pulse-glow"
     ],
     "min": "1.60",
     "max": "3.20",
     "precision": 2
    }
   ],
   "vars": [
    {
     "name": "color-core",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 250,
        "r_max": 255,
        "g_min": 235,
        "g_max": 250,
        "b_min": 190,
        "b_max": 220
       }
      ]
     }
    },
    {
     "name": "color-rim",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 220,
        "r_max": 255,
        "g_min": 150,
        "g_max": 190,
        "b_min": 60,
        "b_max": 110
       },
       {
        "r_min": 200,
        "r_max": 240,
        "g_min": 120,
        "g_max": 160,
        "b_min": 40,
        "b_max": 80
       }
      ]
     }
    },
    {
     "name": "color-halo",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 255,
        "r_max": 255,
        "g_min": 170,
        "g_max": 210,
        "b_min": 90,
        "b_max": 130
       }
      ]
     }
    },
    {
     "name": "color-bg",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 16,
        "r_max": 28,
        "g_min": 10,
        "g_max": 18,
        "b_min": 4,
        "b_max": 10
       }
      ]
     }
    },
    {
     "name": "opacity-glow",
     "kind": {
      "range": {
       "min": "0.40",
       "max": "0.90",
       "precision": 2
      }
     }
    },
    {
     "name": "blur-glow",
     "kind": {
      "range": {
       "min": "2.5",
       "max": "6.0",
       "precision": 1
      }
     }
    },
    {
     "name": "pulse-glow",
     "kind": {
      "range": {
       "min": "1.60",
       "max": "3.20",
       "precision": 2
      }
     }
    },
    {
     "name": "rotate-pattern",
     "kind": {
      "range": {
       "min": "0",
       "max": "45",
       "precision": 0
      }
     }
    },
    {
     "name": "scale-shield",
     "kind": {
      "range": {
       "min": "0.88",
       "max": "0.98",
       "precision": 2
      }
     }
    },
    {
     "name": "toggle-inner",
     "kind": {
      "options": [
       "1"
      ]
     }
    },
    {
     "name": "toggle-diagonal",
     "kind": {
      "options": [
       "1"
      ]
     }
    }
   ]
  }
 },
 {
  "id": "shield-violet",
  "title": "Terp orb shield: violet, arms vary",
  "note": "The Terp orb shield: the site's disc (solid core, rim, short soft edge, small halo) on the 13-dot Terp mark. Variables set the core, rim, halo and background colours, glow strength, blur and pulse, which arms show (inner arms and diagonals switch on or off: full mark, cross, ring or bare plus), and a rotation that acts as the pattern seed. Every disc has a static fill; the pulse only changes glow opacity.",
  "template": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-72 -72 144 144\" width=\"144\" height=\"144\">\n  <defs>\n    <radialGradient id=\"disc-fill\">\n      <stop offset=\"0\" stop-color=\"${color-core}\"/>\n      <stop offset=\"0.36\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.69\" stop-color=\"${color-rim}\"/>\n      <stop offset=\"0.74\" stop-color=\"${color-halo}\" stop-opacity=\"0.3\"/>\n      <stop offset=\"0.86\" stop-color=\"${color-halo}\" stop-opacity=\"0.09\"/>\n      <stop offset=\"1\" stop-color=\"${color-halo}\" stop-opacity=\"0\"/>\n    </radialGradient>\n    <filter id=\"glow\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">\n      <feGaussianBlur stdDeviation=\"${blur-glow}\"/>\n    </filter>\n  </defs>\n  <rect x=\"-72\" y=\"-72\" width=\"144\" height=\"144\" fill=\"${color-bg}\"/>\n  <g transform=\"rotate(${rotate-pattern}) scale(${scale-shield})\">\n    <g filter=\"url(#glow)\" opacity=\"${opacity-glow}\">\n      <animate attributeName=\"opacity\" values=\"${opacity-glow};1;${opacity-glow}\" dur=\"${pulse-glow}s\" repeatCount=\"indefinite\"/>\n      <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <g opacity=\"${toggle-inner}\">\n        <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n      <g opacity=\"${toggle-diagonal}\">\n        <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n        <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      </g>\n    </g>\n    <circle cx=\"0\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"-48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"0\" cy=\"48\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <circle cx=\"-48\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    <g opacity=\"${toggle-inner}\">\n      <circle cx=\"0\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"0\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"0\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n    <g opacity=\"${toggle-diagonal}\">\n      <circle cx=\"-25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"-25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n      <circle cx=\"-25\" cy=\"25\" r=\"12.6\" fill=\"url(#disc-fill)\"/>\n    </g>\n  </g>\n</svg>",
  "dictionary": {
   "version": "1",
   "collection": "orb-shield-violet",
   "description": "Violet and cyan discs; inner arms and diagonals each switch on or off per token; wide colour spread.",
   "palette_groups": [
    {
     "id": "shield",
     "note": "Core, rim and halo of every disc",
     "anchor": "color-rim",
     "members": [
      "color-core",
      "color-rim",
      "color-halo"
     ],
     "entropy": "high"
    }
   ],
   "motion_groups": [
    {
     "id": "glow",
     "note": "Halo breathes between its base opacity and full",
     "members": [
      "pulse-glow"
     ],
     "min": "2.00",
     "max": "4.50",
     "precision": 2
    }
   ],
   "vars": [
    {
     "name": "color-core",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 220,
        "r_max": 255,
        "g_min": 220,
        "g_max": 255,
        "b_min": 240,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "color-rim",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 140,
        "r_max": 190,
        "g_min": 90,
        "g_max": 140,
        "b_min": 220,
        "b_max": 255
       },
       {
        "r_min": 60,
        "r_max": 110,
        "g_min": 190,
        "g_max": 235,
        "b_min": 220,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "color-halo",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 150,
        "r_max": 220,
        "g_min": 120,
        "g_max": 200,
        "b_min": 240,
        "b_max": 255
       }
      ]
     }
    },
    {
     "name": "color-bg",
     "kind": {
      "rgb_styled": [
       {
        "r_min": 8,
        "r_max": 18,
        "g_min": 6,
        "g_max": 14,
        "b_min": 18,
        "b_max": 32
       }
      ]
     }
    },
    {
     "name": "opacity-glow",
     "kind": {
      "range": {
       "min": "0.30",
       "max": "0.80",
       "precision": 2
      }
     }
    },
    {
     "name": "blur-glow",
     "kind": {
      "range": {
       "min": "2.0",
       "max": "5.0",
       "precision": 1
      }
     }
    },
    {
     "name": "pulse-glow",
     "kind": {
      "range": {
       "min": "2.00",
       "max": "4.50",
       "precision": 2
      }
     }
    },
    {
     "name": "rotate-pattern",
     "kind": {
      "range": {
       "min": "0",
       "max": "45",
       "precision": 0
      }
     }
    },
    {
     "name": "scale-shield",
     "kind": {
      "range": {
       "min": "0.90",
       "max": "1.00",
       "precision": 2
      }
     }
    },
    {
     "name": "toggle-inner",
     "kind": {
      "options": [
       "0",
       "1"
      ]
     }
    },
    {
     "name": "toggle-diagonal",
     "kind": {
      "options": [
       "1",
       "0"
      ]
     }
    }
   ]
  }
 }
];
