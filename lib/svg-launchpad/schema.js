/*!
 * svg-launchpad/schema.js: JSON Schema for the SVG minter's create_svg_collection.
 * Generated from groot crates/terp-rs/contracts/infuser/cw721-svg-minter/schema/cw-svg-minter.json
 * (contract cw-svg-minter 0.0.2, md5 507580420a67565e9010bec1749ff9f9), execute.oneOf[create_svg_collection],
 * descriptions removed; SVP1 packed-only (2026-10-15). DEPLOYED_SCHEMA (JSON template) drops `require_auth`, which mainnet code 71/83 (checksum 990E3A93...) does not have.
 */
export const SCHEMA_SOURCE = { file: 'crates/terp-rs/contracts/infuser/cw721-svg-minter/schema/cw-svg-minter.json', contract: 'cw-svg-minter 0.0.2', md5: '507580420a67565e9010bec1749ff9f9' };
export const SOURCE_SCHEMA = {
 "$schema": "http://json-schema.org/draft-07/schema#",
 "title": "CreateSvgCollection",
 "type": "object",
 "required": [
  "create_svg_collection"
 ],
 "properties": {
  "create_svg_collection": {
   "type": "object",
   "required": [
    "instantiate_msg",
    "label"
   ],
   "properties": {
    "instantiate_msg": {
     "$ref": "#/definitions/Cw721InstantiateMsg_for_SvgCollectionMetadata"
    },
    "label": {
     "type": "string"
    }
   },
   "additionalProperties": false
  }
 },
 "additionalProperties": false,
 "definitions": {
  "Action": {
   "oneOf": [
    {
     "type": "object",
     "required": [
      "transfer_ownership"
     ],
     "properties": {
      "transfer_ownership": {
       "type": "object",
       "required": [
        "new_owner"
       ],
       "properties": {
        "expiry": {
         "anyOf": [
          {
           "$ref": "#/definitions/Expiration"
          },
          {
           "type": "null"
          }
         ]
        },
        "new_owner": {
         "type": "string"
        }
       },
       "additionalProperties": false
      }
     },
     "additionalProperties": false
    },
    {
     "type": "string",
     "enum": [
      "accept_ownership"
     ]
    },
    {
     "type": "string",
     "enum": [
      "renounce_ownership"
     ]
    }
   ]
  },
  "Binary": {
   "type": "string"
  },
  "Coin": {
   "type": "object",
   "required": [
    "amount",
    "denom"
   ],
   "properties": {
    "amount": {
     "$ref": "#/definitions/Uint256"
    },
    "denom": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "Cw721InstantiateMsg_for_SvgCollectionMetadata": {
   "type": "object",
   "required": [
    "collection_info_extension",
    "name",
    "symbol"
   ],
   "properties": {
    "collection_info_extension": {
     "allOf": [
      {
       "$ref": "#/definitions/SvgCollectionMetadata"
      }
     ]
    },
    "creator": {
     "type": [
      "string",
      "null"
     ]
    },
    "minter": {
     "type": [
      "string",
      "null"
     ]
    },
    "name": {
     "type": "string"
    },
    "symbol": {
     "type": "string"
    },
    "withdraw_address": {
     "type": [
      "string",
      "null"
     ]
    }
   },
   "additionalProperties": false
  },
  "Expiration": {
   "oneOf": [
    {
     "type": "object",
     "required": [
      "at_height"
     ],
     "properties": {
      "at_height": {
       "type": "integer",
       "format": "uint64",
       "minimum": 0.0
      }
     },
     "additionalProperties": false
    },
    {
     "type": "object",
     "required": [
      "at_time"
     ],
     "properties": {
      "at_time": {
       "$ref": "#/definitions/Timestamp"
      }
     },
     "additionalProperties": false
    },
    {
     "type": "object",
     "required": [
      "never"
     ],
     "properties": {
      "never": {
       "type": "object",
       "additionalProperties": false
      }
     },
     "additionalProperties": false
    }
   ]
  },
  "MintPacket": {
   "type": "object",
   "required": [
    "bind",
    "c_action",
    "c_deposit",
    "n_deposit",
    "receipt"
   ],
   "properties": {
    "bind": {
     "$ref": "#/definitions/Binary"
    },
    "c_action": {
     "$ref": "#/definitions/Binary"
    },
    "c_deposit": {
     "$ref": "#/definitions/Binary"
    },
    "collection": {
     "default": "",
     "type": "string"
    },
    "n_deposit": {
     "$ref": "#/definitions/Binary"
    },
    "receipt": {
     "$ref": "#/definitions/Binary"
    },
    "token_recipient": {
     "default": "",
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "PriceTier": {
   "type": "object",
   "required": [
    "price",
    "until_count"
   ],
   "properties": {
    "price": {
     "allOf": [
      {
       "$ref": "#/definitions/Coin"
      }
     ]
    },
    "until_count": {
     "type": "integer",
     "format": "uint64",
     "minimum": 0.0
    }
   },
   "additionalProperties": false
  },
  "SvgCollectionMetadata": {
   "type": "object",
   "required": [
    "packed",
    "price_tiers",
    "seed",
    "total"
   ],
   "properties": {
    "mint_end_time": {
     "anyOf": [
      {
       "$ref": "#/definitions/Timestamp"
      },
      {
       "type": "null"
      }
     ]
    },
    "mint_start_time": {
     "anyOf": [
      {
       "$ref": "#/definitions/Timestamp"
      },
      {
       "type": "null"
      }
     ]
    },
    "packed": {
     "allOf": [
      {
       "$ref": "#/definitions/Binary"
      }
     ]
    },
    "price_tiers": {
     "type": "array",
     "items": {
      "$ref": "#/definitions/PriceTier"
     }
    },
    "require_auth": {
     "default": false,
     "type": "boolean"
    },
    "seed": {
     "$ref": "#/definitions/Binary"
    },
    "total": {
     "type": "integer",
     "format": "uint64",
     "minimum": 0.0
    },
    "whitelist": {
     "type": [
      "string",
      "null"
     ]
    }
   },
   "additionalProperties": false
  },
  "Timestamp": {
   "allOf": [
    {
     "$ref": "#/definitions/Uint64"
    }
   ]
  },
  "Uint256": {
   "type": "string"
  },
  "Uint64": {
   "type": "string"
  }
 }
};
export const DEPLOYED_SCHEMA = {
 "$schema": "http://json-schema.org/draft-07/schema#",
 "title": "CreateSvgCollection",
 "type": "object",
 "required": [
  "create_svg_collection"
 ],
 "properties": {
  "create_svg_collection": {
   "type": "object",
   "required": [
    "instantiate_msg",
    "label"
   ],
   "properties": {
    "instantiate_msg": {
     "$ref": "#/definitions/Cw721InstantiateMsg_for_SvgCollectionMetadata"
    },
    "label": {
     "type": "string"
    }
   },
   "additionalProperties": false
  }
 },
 "additionalProperties": false,
 "definitions": {
  "Cw721InstantiateMsg_for_SvgCollectionMetadata": {
   "type": "object",
   "required": [
    "collection_info_extension",
    "name",
    "symbol"
   ],
   "properties": {
    "collection_info_extension": {
     "allOf": [
      {
       "$ref": "#/definitions/SvgCollectionMetadata"
      }
     ]
    },
    "creator": {
     "type": [
      "string",
      "null"
     ]
    },
    "minter": {
     "type": [
      "string",
      "null"
     ]
    },
    "name": {
     "type": "string"
    },
    "symbol": {
     "type": "string"
    },
    "withdraw_address": {
     "type": [
      "string",
      "null"
     ]
    }
   },
   "additionalProperties": false
  },
  "SvgCollectionMetadata": {
   "type": "object",
   "required": [
    "price_tiers",
    "seed",
    "svg_template",
    "template_slots",
    "total",
    "variables"
   ],
   "properties": {
    "mint_end_time": {
     "anyOf": [
      {
       "$ref": "#/definitions/Timestamp"
      },
      {
       "type": "null"
      }
     ]
    },
    "mint_start_time": {
     "anyOf": [
      {
       "$ref": "#/definitions/Timestamp"
      },
      {
       "type": "null"
      }
     ]
    },
    "price_tiers": {
     "type": "array",
     "items": {
      "$ref": "#/definitions/PriceTier"
     }
    },
    "seed": {
     "$ref": "#/definitions/Binary"
    },
    "svg_template": {
     "type": "string"
    },
    "template_slots": {
     "type": "array",
     "items": {
      "$ref": "#/definitions/TemplateSlot"
     }
    },
    "total": {
     "type": "integer",
     "format": "uint64",
     "minimum": 0.0
    },
    "variables": {
     "type": "array",
     "items": {
      "$ref": "#/definitions/VariableDef"
     }
    },
    "whitelist": {
     "type": [
      "string",
      "null"
     ]
    }
   },
   "additionalProperties": false
  },
  "Binary": {
   "type": "string"
  },
  "Coin": {
   "type": "object",
   "required": [
    "amount",
    "denom"
   ],
   "properties": {
    "amount": {
     "$ref": "#/definitions/Uint256"
    },
    "denom": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "PriceTier": {
   "type": "object",
   "required": [
    "price",
    "until_count"
   ],
   "properties": {
    "price": {
     "allOf": [
      {
       "$ref": "#/definitions/Coin"
      }
     ]
    },
    "until_count": {
     "type": "integer",
     "format": "uint64",
     "minimum": 0.0
    }
   },
   "additionalProperties": false
  },
  "RgbRange": {
   "type": "object",
   "required": [
    "b_max",
    "b_min",
    "g_max",
    "g_min",
    "r_max",
    "r_min"
   ],
   "properties": {
    "b_max": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    },
    "b_min": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    },
    "g_max": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    },
    "g_min": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    },
    "r_max": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    },
    "r_min": {
     "type": "integer",
     "format": "uint8",
     "minimum": 0.0
    }
   },
   "additionalProperties": false
  },
  "TemplateSlot": {
   "type": "object",
   "required": [
    "end",
    "start",
    "var_idx"
   ],
   "properties": {
    "end": {
     "type": "integer",
     "format": "uint32",
     "minimum": 0.0
    },
    "start": {
     "type": "integer",
     "format": "uint32",
     "minimum": 0.0
    },
    "var_idx": {
     "type": "integer",
     "format": "uint16",
     "minimum": 0.0
    }
   },
   "additionalProperties": false
  },
  "Timestamp": {
   "allOf": [
    {
     "$ref": "#/definitions/Uint64"
    }
   ]
  },
  "Uint64": {
   "type": "string"
  },
  "Uint256": {
   "type": "string"
  },
  "VariableDef": {
   "type": "object",
   "required": [
    "kind",
    "name"
   ],
   "properties": {
    "kind": {
     "$ref": "#/definitions/VariableKind"
    },
    "name": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "VariableKind": {
   "oneOf": [
    {
     "type": "object",
     "required": [
      "options"
     ],
     "properties": {
      "options": {
       "type": "array",
       "items": {
        "type": "string"
       }
      }
     },
     "additionalProperties": false
    },
    {
     "type": "object",
     "required": [
      "range"
     ],
     "properties": {
      "range": {
       "type": "object",
       "required": [
        "max",
        "min",
        "precision"
       ],
       "properties": {
        "max": {
         "type": "string"
        },
        "min": {
         "type": "string"
        },
        "precision": {
         "type": "integer",
         "format": "uint32",
         "minimum": 0.0
        }
       },
       "additionalProperties": false
      }
     },
     "additionalProperties": false
    },
    {
     "type": "string",
     "enum": [
      "rgb"
     ]
    },
    {
     "type": "object",
     "required": [
      "rgb_styled"
     ],
     "properties": {
      "rgb_styled": {
       "type": "array",
       "items": {
        "$ref": "#/definitions/RgbRange"
       }
      }
     },
     "additionalProperties": false
    }
   ]
  }
 }
};
